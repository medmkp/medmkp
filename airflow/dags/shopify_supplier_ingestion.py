"""Registry-driven Shopify supplier ingestion.

Shopify storefronts no longer get one hand-written DAG entry each. The supplier
list is read at DAG-parse time from the vetting registry —
`medusa-backend/apps/backend/data/supplier-vetting/*-catalog-sources.json`,
entries flagged `platform: "shopify"` — the same files that drive adapter
routing (`adapters/shopify-config.ts`). Onboarding a Shopify supplier is
dropping its vetting JSON; this file never changes.

Two DAGs cover the whole fleet:

- `shopify_supplier_ingest` (manual): trigger any one supplier on demand. The
  supplier is a dropdown param in the Trigger UI (or `--conf` from the CLI /
  `npm run ingest:supplier -- <slug>` at the repo root). Runs the staged
  discover >> index >> extract >> commit chain with per-stage retry, like the
  legacy per-supplier DAGs.
- `shopify_catalog_refresh` (weekly): one mapped task per registered supplier.
  The shared single-slot ingest pool serializes them on the NUC, which is what
  the old per-supplier cron staggering actually achieved. A failed supplier is
  a failed map index, retryable individually from the UI.

Both pass `--ensure-supplier`, so a first run auto-provisions the DB supplier
row from the vetting entry — no manual `supplier:seed-usable` step.

Registry parsing is fail-closed (a malformed vetting file raises at parse
time), which is why these DAGs live in their own file: a broken registry file
breaks the Shopify DAGs loudly without taking down the other ingestion DAGs.

Expected Airflow Variables (same keys as supplier_catalog_ingestion.py):
- medmkp_backend_dir, medmkp_env_file, medmkp_supplier_ingest_pool,
  medmkp_supplier_ingest_commit, medmkp_supplier_ingest_state_root
- medmkp_shopify_refresh_schedule: cron for the fleet refresh, defaults to
  "0 4 * * 0" (Sun 04:00, the slot the hand-written Shopify entries used);
  "none"/"manual"/"" makes the fleet manual-only.

The fleet DAG also caps itself at one mapped task at a time
(max_active_tis_per_dag=1) so it stays serial even where the ingest pool
Variable/pool is missing — 8 concurrent Node crawls would OOM the 4g NUC
container. shopify_catalog_refresh lands paused (fleet convention: dormant
until customer onboarding) — unpause it once to activate the weekly schedule.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from airflow import DAG
from airflow.models import Variable
from airflow.models.param import Param
from airflow.operators.bash import BashOperator

BACKEND_DIR = Variable.get("medmkp_backend_dir", default_var="/opt/medmkp/medusa-backend/apps/backend")
ENV_FILE = Variable.get("medmkp_env_file", default_var=".env")
POOL = Variable.get("medmkp_supplier_ingest_pool", default_var="default_pool")
COMMIT_ENABLED = Variable.get("medmkp_supplier_ingest_commit", default_var="true").lower() == "true"
STATE_ROOT = Variable.get(
    "medmkp_supplier_ingest_state_root",
    default_var=f"{BACKEND_DIR}/.medmkp/ingestion/airflow",
)
REFRESH_SCHEDULE = Variable.get("medmkp_shopify_refresh_schedule", default_var="0 4 * * 0")


def parse_schedule(raw: str) -> str | None:
    # Same semantics as the marketplace/net32/amazon DAGs: ""/"none"/"manual"
    # all mean manual-trigger only.
    return None if raw.strip().lower() in ("", "none", "manual") else raw

# The registry lives in the same bind-mounted checkout as this DAG file, so a
# path relative to __file__ resolves both on the NUC and in local dev.
VETTING_DIR = (
    Path(__file__).resolve().parents[2]
    / "medusa-backend" / "apps" / "backend" / "data" / "supplier-vetting"
)

# One shared crawl profile — every Shopify storefront extracts through the
# products.json catalog path, so the hand-tuned per-supplier args had already
# converged on these values. Per-page HTML extraction is only the fallback
# tier; Shopify throttles per IP, so keep product concurrency gentle.
SHOPIFY_ARGS = [
    "--max-sitemaps-per-supplier=10",
    "--sitemap-concurrency=4",
    "--product-concurrency=6",
    "--timeout-ms=30000",
]

STAGES = ["discover", "index", "extract", "commit"]
STATE_DIR_TEMPLATE = STATE_ROOT + "/{{ dag.dag_id }}/{{ params.supplier_id }}/{{ ts_nodash }}"


def load_shopify_suppliers() -> list[dict[str, str]]:
    """Collect `platform: "shopify"` vetting entries, fail-closed."""
    suppliers: list[dict[str, str]] = []

    for path in sorted(VETTING_DIR.glob("*-catalog-sources.json")):
        entries = json.loads(path.read_text())
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict) or entry.get("platform") != "shopify":
                continue
            supplier_id = entry.get("supplier_id")
            if not supplier_id:
                raise ValueError(f"Shopify vetting entry in {path.name} is missing supplier_id")
            suppliers.append(
                {
                    "supplier_id": supplier_id,
                    "slug": entry.get("slug") or supplier_id,
                    "name": entry.get("supplier_name") or supplier_id,
                }
            )

    if not suppliers:
        raise ValueError(f"No platform:shopify vetting entries found under {VETTING_DIR}")

    return suppliers


SUPPLIERS = load_shopify_suppliers()
SUPPLIER_IDS = [supplier["supplier_id"] for supplier in SUPPLIERS]


def bash_ingest_command(args: list[str]) -> str:
    arg_string = " ".join(args)

    return f"""
set -euo pipefail
cd "{BACKEND_DIR}"
if [ -f "{ENV_FILE}" ]; then
  set -a
  . "{ENV_FILE}"
  set +a
fi
export DB_SSL="${{DB_SSL:-true}}"
export NODE_OPTIONS="${{NODE_OPTIONS:---max-old-space-size=8192}}"
export ALLOW_REMOTE_DB_DESTRUCTIVE="${{ALLOW_REMOTE_DB_DESTRUCTIVE:-true}}"
npm run supplier:ingest:db -- {arg_string}
""".strip()


# The manual DAG's commit refuses to run while the weekly fleet is active:
# commits are delete-and-replace per supplier, and a manual commit *retry* that
# interleaves with a fleet run of the same supplier would re-commit an older
# extract snapshot over the fleet's fresher one. Checked in the commit task
# itself (not at trigger time) so the guard also covers retries.
FLEET_GUARD = """
if airflow dags list-runs -d shopify_catalog_refresh --state running -o plain 2>/dev/null | grep -q running; then
  echo "shopify_catalog_refresh is running; refusing to commit over it. Retry after it finishes." >&2
  exit 1
fi
""".strip()


def stage_command(stage: str) -> str:
    args = [
        "--supplier-id={{ params.supplier_id }}",
        "--ensure-supplier",
        f"--stages={stage}",
        f"--state-dir={STATE_DIR_TEMPLATE}",
        "{% if params.limit %}--limit={{ params.limit }}{% endif %}",
    ]
    if stage == "commit" and COMMIT_ENABLED:
        args.append("--commit")
    args.extend(SHOPIFY_ARGS)
    command = bash_ingest_command(args)
    if stage == "commit":
        command = FLEET_GUARD + "\n" + command
    return command


def refresh_command(supplier: dict[str, str]) -> str:
    args = [f"--supplier-id={supplier['supplier_id']}", "--ensure-supplier"]
    if COMMIT_ENABLED:
        args.append("--commit")
    args.extend(SHOPIFY_ARGS)
    return bash_ingest_command(args)


with DAG(
    dag_id="shopify_supplier_ingest",
    description=(
        "Ingest one Shopify supplier catalog on demand — pick the supplier from "
        "the dropdown (registry-driven; suppliers come from the vetting JSONs)."
    ),
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    max_active_runs=1,
    # Manual-only DAG: unpaused so an ad-hoc trigger runs immediately instead
    # of queueing behind a pause toggle.
    is_paused_upon_creation=False,
    params={
        # No default: a conf-less trigger is rejected instead of silently
        # ingesting whichever supplier's vetting file sorts first (defaults are
        # re-resolved per task, so they can even drift mid-run as files land).
        "supplier_id": Param(
            type="string",
            enum=SUPPLIER_IDS,
            description="Supplier to ingest (from data/supplier-vetting/*-catalog-sources.json).",
        ),
        "limit": Param(
            0,
            type="integer",
            minimum=0,
            description="Product-page cap for the HTML fallback tier; 0 = no cap.",
        ),
    },
    tags=["medmkp", "supplier-ingestion", "shopify"],
) as ingest_dag:
    previous = None
    for stage in STAGES:
        task = BashOperator(
            task_id=stage,
            bash_command=stage_command(stage),
            pool=POOL,
            retries=1,
        )
        if previous is not None:
            previous >> task
        previous = task

    cleanup = BashOperator(
        task_id="cleanup_state",
        bash_command=f'rm -rf "{STATE_DIR_TEMPLATE}"',
    )
    previous >> cleanup


with DAG(
    dag_id="shopify_catalog_refresh",
    description=(
        "Weekly refresh of every registered Shopify supplier catalog (one mapped "
        "task per supplier; the shared ingest pool serializes them)."
    ),
    start_date=datetime(2026, 1, 1),
    schedule=parse_schedule(REFRESH_SCHEDULE),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=True,
    tags=["medmkp", "supplier-ingestion", "shopify"],
) as refresh_dag:
    BashOperator.partial(
        task_id="ingest_supplier",
        pool=POOL,
        retries=1,
        # Serialize the mapped crawls even if the ingest pool Variable/pool is
        # missing (POOL then falls back to the 128-slot default_pool): 8
        # concurrent Node ingests would OOM the 4g single-box container.
        max_active_tis_per_dag=1,
        append_env=True,
        map_index_template="{{ task.env['MEDMKP_SUPPLIER_SLUG'] }}",
    ).expand_kwargs(
        [
            {
                "bash_command": refresh_command(supplier),
                "env": {"MEDMKP_SUPPLIER_SLUG": supplier["slug"]},
            }
            for supplier in SUPPLIERS
        ]
    )
