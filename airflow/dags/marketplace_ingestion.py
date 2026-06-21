"""Airflow DAG(s) for MedMKP marketplace ingestion (Amazon, ...).

Search the top dental reorder products on a marketplace and save the matching
listings (image + price snapshot + canonical match) against the existing
canonical products. Unlike supplier catalog ingestion, this fetches through a
paid, metered scraping API (any provider whose URL takes a `{url}` template —
ScrapingBee, ScraperAPI, Bright Data, ...), so the DAGs default to manual
trigger (schedule=None) to avoid silently burning credits. Set a cron via the
per-marketplace schedule Variable to run it periodically for price refresh;
re-running is also always available from the Airflow UI ("Trigger DAG").

Each run is a two-task chain: `ingest` (which logs a JSON summary, plus
ScraperAPI credits before/after when the provider is ScraperAPI) followed by
`status` (which logs the resulting persisted catalog counts).

Required on the host: a scraper template must be defined in the env file
(medmkp_env_file). Use a per-provider override so each site gets the right
(and right-priced) settings, falling back to the shared MARKETPLACE_SCRAPER_URL:
  MARKETPLACE_SCRAPER_URL_AMAZON=https://app.scrapingbee.com/api/v1/?api_key=KEY&render_js=true&url={url}
  MARKETPLACE_SCRAPER_URL_ALIBABA=https://app.scrapingbee.com/api/v1/?api_key=KEY&stealth_proxy=true&render_js=true&country_code=us&url={url}
Keep the API key in that env file, not in this DAG. Amazon needs JS rendering
for prices (~5 credits); Alibaba needs a stealth/residential proxy to clear its
captcha (~75 credits) — keep its product set small.

Expected Airflow Variables:
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: env file to source before npm (default .env; use
  .env.production on hosts targeting the remote DB). Must define a scraper
  template — MARKETPLACE_SCRAPER_URL_<PROVIDER> (e.g. _AMAZON, _ALIBABA) or the
  shared MARKETPLACE_SCRAPER_URL (and optionally SCRAPERAPI_API_KEY for the
  credit audit, which only applies when the provider is ScraperAPI).
- medmkp_marketplace_pool: optional Airflow pool, defaults to default_pool
- medmkp_marketplace_commit: "false" for dry-run, defaults to true
- medmkp_marketplace_concurrency: fetch concurrency, defaults to 5
- medmkp_marketplace_seeds_file: seed query file (relative to backend dir),
  defaults to ./data/marketplace-seeds/top-dental-reorder.txt
- medmkp_marketplace_<name>_schedule: cron for that marketplace's DAG,
  defaults to None (manual). e.g. "0 9 * * 1" for weekly Monday refresh.
- medmkp_marketplace_<name>_results: results per query, defaults to 20
- medmkp_marketplace_<name>_anchor_min: min anchor match %, defaults to 30
"""

from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.models import Variable
from airflow.operators.bash import BashOperator

BACKEND_DIR = Variable.get("medmkp_backend_dir", default_var="/opt/medmkp/medusa-backend/apps/backend")
ENV_FILE = Variable.get("medmkp_env_file", default_var=".env")
POOL = Variable.get("medmkp_marketplace_pool", default_var="default_pool")
COMMIT_ENABLED = Variable.get("medmkp_marketplace_commit", default_var="true").lower() == "true"
CONCURRENCY = Variable.get("medmkp_marketplace_concurrency", default_var="5")
SEEDS_FILE = Variable.get(
    "medmkp_marketplace_seeds_file",
    default_var="./data/marketplace-seeds/top-dental-reorder.txt",
)

MARKETPLACES = [
    {
        "name": "amazon",
        "provider": "amazon",
        "default_results": "20",
        "default_anchor_min": "30",
        "timeout_ms": "45000",
    },
    # Alibaba is wired but needs a ScraperAPI plan with premium/residential
    # proxies; enable by setting medmkp_marketplace_alibaba_schedule and a
    # premium-capable MARKETPLACE_SCRAPER_URL.
    {
        "name": "alibaba",
        "provider": "alibaba",
        "default_results": "20",
        "default_anchor_min": "30",
        "timeout_ms": "45000",
    },
]


def parse_schedule(raw: str) -> str | None:
    return None if raw.strip().lower() in ("", "none", "manual") else raw


def backend_command(command: str) -> str:
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
{command}
""".strip()


def ingest_command(marketplace: dict[str, str]) -> str:
    results = Variable.get(
        f"medmkp_marketplace_{marketplace['name']}_results",
        default_var=marketplace["default_results"],
    )
    anchor_min = Variable.get(
        f"medmkp_marketplace_{marketplace['name']}_anchor_min",
        default_var=marketplace["default_anchor_min"],
    )
    args = [
        f"--provider={marketplace['provider']}",
        f"--seeds-file={SEEDS_FILE}",
        f"--results={results}",
        f"--anchor-min={anchor_min}",
        f"--concurrency={CONCURRENCY}",
        f"--timeout-ms={marketplace['timeout_ms']}",
    ]
    if COMMIT_ENABLED:
        args.append("--commit")
    return backend_command(f"npm run marketplace:ingest -- {' '.join(args)}")


def status_command(marketplace: dict[str, str]) -> str:
    return backend_command(
        f"npm run marketplace:status -- --provider={marketplace['provider']}"
    )


def build_marketplace_dag(marketplace: dict[str, str]) -> DAG:
    schedule = parse_schedule(
        Variable.get(
            f"medmkp_marketplace_{marketplace['name']}_schedule", default_var="none"
        )
    )
    with DAG(
        dag_id=f"marketplace_{marketplace['name']}",
        description=(
            f"Ingest top dental reorder products from {marketplace['name']} "
            "(image + price snapshot) via the marketplace search pipeline."
        ),
        start_date=datetime(2026, 1, 1),
        schedule=schedule,
        catchup=False,
        max_active_runs=1,
        tags=["medmkp", "marketplace-ingestion", marketplace["provider"]],
    ) as dag:
        ingest = BashOperator(
            task_id="ingest",
            bash_command=ingest_command(marketplace),
            pool=POOL,
            retries=1,
        )
        status = BashOperator(
            task_id="status",
            bash_command=status_command(marketplace),
            pool=POOL,
        )
        ingest >> status
    return dag


for marketplace in MARKETPLACES:
    globals()[f"marketplace_{marketplace['name']}"] = build_marketplace_dag(marketplace)
