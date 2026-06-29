"""Airflow DAG for MedMKP Net32 ingestion (best-price overlay).

Net32 is Cloudflare-fronted, so its catalog can't be fetched like a static page.
This DAG runs the marketplace ingest pipeline with `--provider=net32`, which
delegates fetching to the **net32-harvester** browser sidecar: a long-lived
headful Chromium (under xvfb) that clears the challenge and drives Net32's
internal JSON API. The sidecar runs on the HOST (this Airflow container has no
browser/xvfb), so this task reaches it over the Docker host gateway via
`medmkp_net32_harvester_url`. Deploy + run the sidecar per net32-harvester/README.md.

Unlike the supplier crawl DAGs, this hits a third party's site through a real
browser, so it defaults to manual trigger (schedule=None) and is paused on
creation. Set `medmkp_net32_schedule` to a cron for periodic price refresh
(competitors refresh ~weekly). Each run is `ingest` -> `status`.

Expected Airflow Variables (shared with the other ingest DAGs):
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: env file to source before npm (default .env = prod Render DB)

Net32-specific Variables:
- medmkp_net32_harvester_url: sidecar base URL as seen from THIS container,
  e.g. http://172.20.0.1:8791 (the Docker host gateway). REQUIRED.
- medmkp_net32_harvester_token: optional bearer token (must match the sidecar's
  NET32_HARVESTER_TOKEN).
- medmkp_net32_schedule: cron, default None (manual). e.g. "0 8 * * 1" weekly.
- medmkp_net32_commit: "true"/"false", default true (writes the Net32 supplier
  catalog to the prod DB; keep the DAG paused until you've reviewed a dry run).
- medmkp_net32_seeds_file: optional curated seed-query file (relative to backend
  dir). Default "" (blank) = CANONICAL MODE: search Net32 by each canonical
  product's own name and overlay its best price, paging the full catalog via
  limit/offset. Set a path (e.g. ./data/marketplace-seeds/top-dental-reorder.txt)
  to fall back to the legacy curated-phrase mode.
- medmkp_net32_limit: canonical-mode page size — max canonical products searched
  per run, default 100000 (effectively the whole catalog in one sweep). Lower it
  and rotate medmkp_net32_offset to sweep in nightly batches.
- medmkp_net32_offset: canonical-mode starting offset into the catalog, default 0.
- medmkp_net32_results: results per query, default 5
- medmkp_net32_concurrency: fetch concurrency, default 1 (serialized — polite,
  and the single-page sidecar serializes anyway)
- medmkp_net32_timeout_ms: per-search timeout, default 90000 (browser searches
  take 20-35s; the net32 fetcher also floors this).
"""

from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.models import Variable
from airflow.operators.bash import BashOperator

BACKEND_DIR = Variable.get(
    "medmkp_backend_dir", default_var="/opt/medmkp/medusa-backend/apps/backend"
)
ENV_FILE = Variable.get("medmkp_env_file", default_var=".env")
POOL = Variable.get("medmkp_net32_pool", default_var="default_pool")

HARVESTER_URL = Variable.get(
    "medmkp_net32_harvester_url", default_var="http://172.20.0.1:8791"
)
HARVESTER_TOKEN = Variable.get("medmkp_net32_harvester_token", default_var="")
COMMIT_ENABLED = Variable.get("medmkp_net32_commit", default_var="true").lower() == "true"
# Blank by default = canonical mode (search Net32 by each canonical product's
# name). Set a path to fall back to the legacy curated-seed-phrase list.
SEEDS_FILE = Variable.get("medmkp_net32_seeds_file", default_var="")
LIMIT = Variable.get("medmkp_net32_limit", default_var="100000")
OFFSET = Variable.get("medmkp_net32_offset", default_var="0")
RESULTS = Variable.get("medmkp_net32_results", default_var="5")
CONCURRENCY = Variable.get("medmkp_net32_concurrency", default_var="1")
TIMEOUT_MS = Variable.get("medmkp_net32_timeout_ms", default_var="90000")


def parse_schedule(raw: str) -> str | None:
    return None if raw.strip().lower() in ("", "none", "manual") else raw


def backend_command(command: str, *, need_harvester: bool) -> str:
    # The harvester precheck fails the task fast (with a clear message) when the
    # host sidecar is down, instead of silently ingesting zero rows.
    precheck = ""
    if need_harvester:
        auth = f'-H "Authorization: Bearer {HARVESTER_TOKEN}"' if HARVESTER_TOKEN else ""
        precheck = f"""
if ! curl -fsS {auth} "{HARVESTER_URL}/health" >/dev/null 2>&1; then
  echo "[net32] harvester not reachable at {HARVESTER_URL}/health — is the host sidecar running? (see net32-harvester/README.md)" >&2
  exit 1
fi
""".strip()
    return f"""
set -euo pipefail
cd "{BACKEND_DIR}"
if [ -f "{ENV_FILE}" ]; then
  set -a
  . "{ENV_FILE}"
  set +a
fi
export DB_SSL="${{DB_SSL:-true}}"
export NODE_OPTIONS="${{NODE_OPTIONS:---max-old-space-size=2048}}"
export ALLOW_REMOTE_DB_DESTRUCTIVE="${{ALLOW_REMOTE_DB_DESTRUCTIVE:-true}}"
export NET32_HARVESTER_URL="{HARVESTER_URL}"
export NET32_HARVESTER_TOKEN="{HARVESTER_TOKEN}"
{precheck}
{command}
""".strip()


def ingest_command() -> str:
    args = [
        "--provider=net32",
        f"--results={RESULTS}",
        f"--concurrency={CONCURRENCY}",
        f"--timeout-ms={TIMEOUT_MS}",
    ]
    seeds = SEEDS_FILE.strip()
    if seeds and seeds.lower() not in ("none", "canonical"):
        # Legacy curated-phrase mode: search a fixed list of seed queries.
        args.append(f"--seeds-file={seeds}")
    else:
        # Canonical mode (default): search Net32 by each canonical product's own
        # name, paging the full catalog via limit/offset for the price overlay.
        args.append(f"--limit={LIMIT}")
        args.append(f"--offset={OFFSET}")
    if COMMIT_ENABLED:
        args.append("--commit")
    return backend_command(
        f"npm run marketplace:ingest -- {' '.join(args)}", need_harvester=True
    )


with DAG(
    dag_id="marketplace_net32",
    description=(
        "Ingest Net32 best-price overlay onto the canonical catalog via the "
        "net32-harvester browser sidecar."
    ),
    start_date=datetime(2026, 1, 1),
    schedule=parse_schedule(Variable.get("medmkp_net32_schedule", default_var="none")),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=True,
    tags=["medmkp", "marketplace-ingestion", "net32"],
) as dag:
    ingest = BashOperator(
        task_id="ingest",
        bash_command=ingest_command(),
        pool=POOL,
        retries=1,
    )
    status = BashOperator(
        task_id="status",
        bash_command=backend_command(
            "npm run marketplace:status -- --provider=net32", need_harvester=False
        ),
        pool=POOL,
    )
    ingest >> status
