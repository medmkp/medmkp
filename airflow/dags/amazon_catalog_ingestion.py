"""Airflow DAG: sweep the full MedMKP canonical catalog against Amazon (free).

Searches Amazon for canonical products and saves the matching listings (image +
price snapshot + canonical match), surfaced in the product page's "Also
available on Amazon" section. Distinct from `marketplace_amazon`, which only
refreshes a curated 50-item seed list.

FREE: Amazon search is fetched directly (no scraping API, no credits) — it works
because the NUC has a US residential IP and we reconstruct Amazon's no-JS split
price spans. This DAG exports `MARKETPLACE_SCRAPER_URL_AMAZON=direct` (overridable)
so it stays free even when a paid proxy is configured globally for Alibaba.

Batched nightly sweep: the catalog is ~28k products and a single residential IP
can't fetch them all in one run without risking throttling. So each nightly run
does ONE batch of `amazon_catalog_batch` products, and the offset rotates by run
date — batch = day_of_year %% num_batches. Over `amazon_catalog_num_batches`
nights it covers the whole catalog, then repeats (refreshing prices oldest-batch
first). Coverage requires batch * num_batches >= the canonical count; bump
`amazon_catalog_num_batches` if the catalog outgrows it.

Writes to the prod DB (commit defaults true). The reconcile is upsert +
soft-delete (gap-free), so partial/repeat batches are safe and additive.

Expected Airflow Variables (defaults in parens):
- medmkp_backend_dir, medmkp_env_file, medmkp_marketplace_pool (shared)
- amazon_catalog_schedule: cron (default "0 8 * * *" = nightly ~midnight PT)
- amazon_catalog_commit: "true" to persist (default true)
- amazon_catalog_batch: products per nightly run (default 5000)
- amazon_catalog_num_batches: nights to cover the catalog (default 6 -> 30k)
- amazon_catalog_concurrency: parallel fetches (default 3, keep low)
- amazon_catalog_results: listings kept per product (default 5)
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
POOL = Variable.get("medmkp_marketplace_pool", default_var="default_pool")

COMMIT_ENABLED = (
    Variable.get("amazon_catalog_commit", default_var="true").lower() == "true"
)
BATCH = int(Variable.get("amazon_catalog_batch", default_var="5000"))
NUM_BATCHES = int(Variable.get("amazon_catalog_num_batches", default_var="6"))
CONCURRENCY = Variable.get("amazon_catalog_concurrency", default_var="3")
RESULTS = Variable.get("amazon_catalog_results", default_var="5")
TIMEOUT_MS = "45000"

# Rotate the catalog offset by run date so each night sweeps the next batch.
# Rendered by Airflow at run time (Jinja); day_of_year is on the pendulum
# logical_date. e.g. "{{ (logical_date.day_of_year % 6) * 5000 }}".
OFFSET_EXPR = (
    "{{ (logical_date.day_of_year % " + str(NUM_BATCHES) + ") * " + str(BATCH) + " }}"
)


def parse_schedule(raw: str) -> str | None:
    return None if raw.strip().lower() in ("", "none", "manual") else raw


def backend_command(command: str) -> str:
    # Source the env file (set -a exports every var), then default Amazon to the
    # free direct fetch unless the env already pins a scraper template.
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
export MARKETPLACE_SCRAPER_URL_AMAZON="${{MARKETPLACE_SCRAPER_URL_AMAZON:-direct}}"
{command}
""".strip()


def ingest_command() -> str:
    # No --seeds-file => search the canonical catalog itself, paged by offset+limit.
    args = [
        "--provider=amazon",
        f"--offset={OFFSET_EXPR}",
        f"--limit={BATCH}",
        f"--results={RESULTS}",
        f"--concurrency={CONCURRENCY}",
        f"--timeout-ms={TIMEOUT_MS}",
    ]
    if COMMIT_ENABLED:
        args.append("--commit")
    return backend_command(f"npm run marketplace:ingest -- {' '.join(args)}")


def status_command() -> str:
    return backend_command("npm run marketplace:status -- --provider=amazon")


schedule = parse_schedule(
    Variable.get("amazon_catalog_schedule", default_var="0 8 * * *")
)

with DAG(
    dag_id="amazon_catalog_full",
    description=(
        "Nightly batched sweep of the full MedMKP canonical catalog against "
        "Amazon (free direct fetch). Offset rotates by date to cover ~28k "
        f"products over {NUM_BATCHES} nights."
    ),
    start_date=datetime(2026, 1, 1),
    schedule=schedule,
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=False,
    tags=["medmkp", "marketplace-ingestion", "amazon", "full-catalog"],
) as dag:
    ingest = BashOperator(
        task_id="ingest",
        bash_command=ingest_command(),
        pool=POOL,
        retries=1,
    )
    status = BashOperator(
        task_id="status",
        bash_command=status_command(),
        pool=POOL,
    )
    ingest >> status
