"""Airflow DAG: sweep the FULL MedMKP canonical catalog against Amazon (free).

Unlike `marketplace_amazon` (which refreshes a curated 50-item seed list), this
job searches Amazon for *every* canonical product and saves the matching
listings (image + price snapshot + canonical match). It is meant for broad
coverage, run occasionally, not a frequent price refresh.

FREE by default: Amazon search is fetched directly (no scraping API, no
credits). It works because the NUC has a US residential IP and we reconstruct
Amazon's no-JS split price spans. This DAG exports
`MARKETPLACE_SCRAPER_URL_AMAZON=direct` (overridable) so it stays free even if a
paid proxy is configured globally for Alibaba.

⚠️ Rate limiting: a single residential IP hitting Amazon thousands of times in
one run will eventually get throttled/captcha'd. Those responses are detected
and counted as `blocked` (never persisted as garbage), but expect partial
coverage on a full sweep. The realistic pattern is modest batches over time:
set `amazon_catalog_limit` (e.g. 300) and run repeatedly, and keep
`amazon_catalog_concurrency` low (default 3). The `ingest` task logs a JSON
summary with `searches_blocked` so you can see how far the IP got.

⚠️ Writes to the DB only when committing. Defaults to a DRY RUN
(`amazon_catalog_commit=false`) so a first full sweep can be inspected before
anything is written. Flip the Variable to "true" once the dry run looks good.

Expected Airflow Variables (sensible defaults; override as needed):
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: env file to source before npm (default .env; use
  .env.production on hosts targeting the remote DB)
- medmkp_marketplace_pool: optional Airflow pool, defaults to default_pool
- amazon_catalog_schedule: cron, defaults to None (manual trigger only)
- amazon_catalog_commit: "true" to persist; defaults to "false" (dry run)
- amazon_catalog_limit: max canonical products to search, defaults to 100000
  (effectively all). Lower it (e.g. 300) for a gentle batched run.
- amazon_catalog_concurrency: parallel fetches, defaults to 3 (keep low)
- amazon_catalog_results: listings kept per product, defaults to 5
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
    Variable.get("amazon_catalog_commit", default_var="false").lower() == "true"
)
LIMIT = Variable.get("amazon_catalog_limit", default_var="100000")
CONCURRENCY = Variable.get("amazon_catalog_concurrency", default_var="3")
RESULTS = Variable.get("amazon_catalog_results", default_var="5")
TIMEOUT_MS = "45000"


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
export NODE_OPTIONS="${{NODE_OPTIONS:---max-old-space-size=8192}}"
export ALLOW_REMOTE_DB_DESTRUCTIVE="${{ALLOW_REMOTE_DB_DESTRUCTIVE:-true}}"
export MARKETPLACE_SCRAPER_URL_AMAZON="${{MARKETPLACE_SCRAPER_URL_AMAZON:-direct}}"
{command}
""".strip()


def ingest_command() -> str:
    # No --seeds-file => the ingest script searches the canonical catalog itself,
    # sliced to --limit. A large limit sweeps everything.
    args = [
        "--provider=amazon",
        f"--limit={LIMIT}",
        f"--results={RESULTS}",
        f"--concurrency={CONCURRENCY}",
        f"--timeout-ms={TIMEOUT_MS}",
    ]
    if COMMIT_ENABLED:
        args.append("--commit")
    return backend_command(f"npm run marketplace:ingest -- {' '.join(args)}")


def status_command() -> str:
    return backend_command("npm run marketplace:status -- --provider=amazon")


schedule = parse_schedule(Variable.get("amazon_catalog_schedule", default_var="none"))

with DAG(
    dag_id="amazon_catalog_full",
    description=(
        "Sweep the full MedMKP canonical catalog against Amazon (free direct "
        "fetch). Defaults to a dry run; set amazon_catalog_commit=true to persist."
    ),
    start_date=datetime(2026, 1, 1),
    schedule=schedule,
    catchup=False,
    max_active_runs=1,
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
