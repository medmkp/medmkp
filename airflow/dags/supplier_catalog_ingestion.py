"""Airflow DAGs for MedMKP supplier catalog ingestion.

Generates one DAG per supplier so each catalog import can be scheduled,
paused, retried, and backfilled independently. Schedules are staggered across
the week with the heaviest suppliers (Patterson, DC Dental, Darby, Henry
Schein) each isolated on their own day so the single-box NUC never runs two
big crawls at once; assign a small Airflow pool via medmkp_supplier_ingest_pool
to cap how many ingests run concurrently (size it to 1 on the single-box NUC
host: each ingest is a Node process doing thousands of fetches).

Cross-supplier matching is NOT chained onto each ingest. products:match is a
global rebuild (it re-clusters every supplier, not just the one that ran), so
coupling it per-supplier would run the same global job N times a week against a
half-updated catalog. Instead a single match_products DAG runs nightly and
picks up whichever supplier(s) ingested that day, then refreshes the catalog
read models. That daily batch is the coalescing point; a day-staggered fleet is
fully reflected within 24h.

Each DAG runs the ingestion as separate stage tasks
(discover >> index >> extract >> commit >> cleanup_state) so the UI shows
which stage is running. Stages share intermediate state through JSON files
in a per-run state directory; a failed stage can be retried without
re-running earlier stages, and cleanup_state removes the directory once
the run succeeds (it is kept on failure for debugging).

All DAGs land paused (is_paused_upon_creation=True): the catalog refresh
cadence is dormant until we onboard customers; unpause the fleet then.

Expected Airflow Variables:
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: optional env file to source before running npm, defaults to .env
  (use .env.production on hosts that target the remote database; ingestion
  commands export ALLOW_REMOTE_DB_DESTRUCTIVE=true to pass the db-safety guard)
- medmkp_supplier_ingest_pool: optional Airflow pool, defaults to default_pool
- medmkp_supplier_ingest_commit: set to "false" for dry-run tasks, defaults to true
- medmkp_supplier_ingest_state_root: directory for inter-stage state files,
  defaults to <backend dir>/.medmkp/ingestion/airflow
- medmkp_product_matching_pool: optional Airflow pool for the global matcher,
  defaults to medmkp_supplier_ingest_pool
- medmkp_product_matching_commit: set to "false" for dry-run matching,
  defaults to true
"""

from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.models import Variable
from airflow.operators.bash import BashOperator

BACKEND_DIR = Variable.get("medmkp_backend_dir", default_var="/opt/medmkp/medusa-backend/apps/backend")
ENV_FILE = Variable.get("medmkp_env_file", default_var=".env")
POOL = Variable.get("medmkp_supplier_ingest_pool", default_var="default_pool")
COMMIT_ENABLED = Variable.get("medmkp_supplier_ingest_commit", default_var="true").lower() == "true"
MATCHING_POOL = Variable.get("medmkp_product_matching_pool", default_var=POOL)
MATCHING_COMMIT_ENABLED = Variable.get("medmkp_product_matching_commit", default_var="true").lower() == "true"
STATE_ROOT = Variable.get(
    "medmkp_supplier_ingest_state_root",
    default_var=f"{BACKEND_DIR}/.medmkp/ingestion/airflow",
)

STAGES = ["discover", "index", "extract", "commit"]
STATE_DIR_TEMPLATE = STATE_ROOT + "/{{ dag.dag_id }}/{{ ts_nodash }}"

# Day-staggered weekly schedules (cron: m h * * DOW; DOW 0=Sun..6=Sat). The four
# heaviest crawls get their own day; mediums share the lighter days, hours
# apart. The NUC ingest pool is size 1, so same-day jobs run serially
# regardless — the hour offsets are for clear retry windows.
#   Mon: patterson        Tue: dc_dental       Wed: darby
#   Thu: henry_schein     Fri: dental_city, pearson
#   Sat: shasta, sky, safco
#   Sun: shopify_catalog_refresh (see shopify_supplier_ingestion.py),
#        unimedusa, young_specialties, zirc
#
# Shopify storefronts (amerdental, carolina, DDI, Davis, ...) are NOT listed
# here: they are registry-driven from data/supplier-vetting/*-catalog-sources.json
# by shopify_supplier_ingestion.py (weekly fleet DAG + manual trigger DAG).
SUPPLIERS = [
    {
        "name": "dc_dental",
        "supplier_id": "msup_dcdental_com",
        "schedule": "0 3 * * 2",
        "args": [
            "--max-links-per-source=500",
            # supplier:ingest:db is delete-and-replace, so the page cap must
            # cover the WHOLE catalog (~39.7k items / 50 per page ~= 800 pages),
            # otherwise a run hard-deletes everything it didn't re-discover.
            "--max-dcdental-catalog-pages=1000",
            "--source-concurrency=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "sky_dental",
        "supplier_id": "msup_skydentalsupply_com",
        "schedule": "0 6 * * 6",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "shasta_dental",
        "supplier_id": "msup_shastadentalsupply_com",
        "schedule": "0 3 * * 6",
        "args": [
            "--max-shasta-catalog-pages=5000",
            "--product-concurrency=6",
            "--timeout-ms=45000",
        ],
    },
    {
        "name": "dental_city",
        "supplier_id": "msup_dentalcity_com",
        "schedule": "0 3 * * 5",
        "args": [
            "--max-sitemaps-per-supplier=5000",
            "--sitemap-concurrency=8",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_depot",
        "supplier_id": "msup_dentaldepotinc_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_planet",
        "supplier_id": "msup_dentalplanet_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "dental_savings_club",
        "supplier_id": "msup_dentalsavingsclub_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        # Known Cloudflare bot-management block; keep a manual DAG for
        # visibility/backfills after a catalog feed or CSV path is available.
        "name": "frontier_dental",
        "supplier_id": "msup_frontierdental_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=2",
            "--product-concurrency=3",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "ids_dental",
        "supplier_id": "msup_idsdental_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "net32",
        "supplier_id": "msup_net32_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "parkell",
        "supplier_id": "msup_parkell_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "pearson_dental",
        "supplier_id": "msup_pearsondental_com",
        "schedule": "0 9 * * 5",
        "args": [
            "--max-sitemaps-per-supplier=3",
            # Pearson's legacy catalog crawl is broad; keep the scheduled job
            # bounded so it reaches extraction in a reasonable window.
            "--max-pearson-catalog-pages=1000",
            "--source-concurrency=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=45000",
        ],
    },
    {
        "name": "practicon",
        "supplier_id": "msup_practicon_com",
        "schedule": None,
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "safco_dental",
        "supplier_id": "msup_safcodental_com",
        "schedule": "0 8 * * 6",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "unimedusa",
        "supplier_id": "msup_unimedusa_com",
        "schedule": "0 8 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "young_specialties",
        "supplier_id": "msup_youngspecialties_com",
        "schedule": "0 10 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "name": "zirc_dental_products",
        "supplier_id": "msup_zirc_com",
        "schedule": "0 12 * * 0",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
]


def supplier_command(supplier: dict[str, object], stage: str) -> str:
    args = [
        f"--supplier-id={supplier['supplier_id']}",
        f"--stages={stage}",
        f"--state-dir={STATE_DIR_TEMPLATE}",
    ]
    if stage == "commit" and COMMIT_ENABLED:
        args.append("--commit")
    args.extend(supplier["args"])
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


def build_supplier_dag(supplier: dict[str, object]) -> DAG:
    with DAG(
        dag_id=supplier["name"],
        description=f"Import the {supplier['supplier_id']} catalog and public price snapshot into MedMKP.",
        start_date=datetime(2026, 1, 1),
        schedule=supplier["schedule"],
        catchup=False,
        max_active_runs=1,
        is_paused_upon_creation=True,
        tags=["medmkp", "supplier-ingestion", supplier["supplier_id"]],
    ) as dag:
        previous = None
        for stage in STAGES:
            task = BashOperator(
                task_id=stage,
                bash_command=supplier_command(supplier, stage),
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
    return dag


def build_product_matching_dag() -> DAG:
    match_args = " -- --commit" if MATCHING_COMMIT_ENABLED else ""

    with DAG(
        dag_id="match_products",
        description=(
            "Nightly global rebuild of auto canonical products + cross-supplier "
            "matches, then a refresh of the catalog read models. Runs late each "
            "evening so it picks up the same day's ingest. If a heavy crawl is "
            "still running it queues behind it (shared single-slot pool) rather "
            "than matching a partial catalog."
        ),
        start_date=datetime(2026, 1, 1),
        # 23:00, after the day's crawls (which start 03:00) have landed, for
        # same-day freshness. Shares the ingest pool, so a still-running crawl
        # makes this queue instead of overlapping.
        schedule="0 23 * * *",
        catchup=False,
        max_active_runs=1,
        is_paused_upon_creation=True,
        tags=["medmkp", "product-matching"],
    ) as dag:
        match = BashOperator(
            task_id="match_products",
            bash_command=backend_command(f"npm run products:match{match_args}"),
            pool=MATCHING_POOL,
            retries=1,
        )
        # The matcher reads base tables and writes canonical tables; the storefront
        # price/category/offer read models are materialized views that only refresh
        # when told to. Rebuild them after every match so new prices and products
        # become visible.
        refresh = BashOperator(
            task_id="refresh_read_models",
            bash_command=backend_command("npm run catalog:refresh-read-models"),
            pool=MATCHING_POOL,
            retries=1,
        )
        match >> refresh

    return dag


def build_henry_schein_dag() -> DAG:
    ingest_args = " -- --max-pages=12000 --max-pages-per-category=500 --concurrency=4"
    if COMMIT_ENABLED:
        ingest_args += " --commit"

    with DAG(
        dag_id="henry_schein",
        description=(
            "Import the Henry Schein public dental catalog and enrich campaign-listed "
            "products with public web prices."
        ),
        start_date=datetime(2026, 1, 1),
        schedule="0 3 * * 4",
        catchup=False,
        max_active_runs=1,
        is_paused_upon_creation=True,
        tags=["medmkp", "supplier-ingestion", "msup_henryschein_com"],
    ) as dag:
        BashOperator(
            task_id="ingest",
            bash_command=backend_command(f"npm run henryschein:ingest{ingest_args}"),
            pool=POOL,
            retries=1,
        )

    return dag


def build_patterson_dag() -> DAG:
    # Patterson is sitemap-driven (~120k /Supplies/ItemDetail pages); keep the
    # fetch pool modest so the single-box NUC isn't saturated.
    ingest_args = " -- --concurrency=6"
    if COMMIT_ENABLED:
        ingest_args += " --commit"

    with DAG(
        dag_id="patterson",
        description=(
            "Import the Patterson Dental public identity catalog (name/brand/MPN/pack) "
            "from its sitemap; prices remain login-gated, so no price snapshots."
        ),
        start_date=datetime(2026, 1, 1),
        schedule="0 3 * * 1",
        catchup=False,
        max_active_runs=1,
        is_paused_upon_creation=True,
        tags=["medmkp", "supplier-ingestion", "msup_pattersondental_com"],
    ) as dag:
        BashOperator(
            task_id="ingest",
            bash_command=backend_command(f"npm run patterson:ingest{ingest_args}"),
            pool=POOL,
            retries=1,
        )

    return dag


def build_darby_dag() -> DAG:
    # Darby is sitemap-driven (~35k Magento product pages WITH public prices).
    # Uses the dedicated streaming ingest (darby:ingest) rather than the generic
    # in-memory supplier:ingest:db: the latter loads the whole extract plus the
    # full canonical-product list before a single write, the pattern that
    # OOM-killed the first Patterson prod run on the 7 GB NUC. Keep the fetch
    # pool modest so the single-box NUC isn't saturated.
    ingest_args = " -- --concurrency=8"
    if COMMIT_ENABLED:
        ingest_args += " --commit"

    with DAG(
        dag_id="darby_dental",
        description=(
            "Import the Darby Dental public Magento catalog (name/brand/MPN/pack + "
            "public price + stock) from its sitemap, streamed to bound memory."
        ),
        start_date=datetime(2026, 1, 1),
        schedule="0 3 * * 3",
        catchup=False,
        max_active_runs=1,
        is_paused_upon_creation=True,
        tags=["medmkp", "supplier-ingestion", "msup_darbydental_com"],
    ) as dag:
        BashOperator(
            task_id="ingest",
            bash_command=backend_command(f"npm run darby:ingest{ingest_args}"),
            pool=POOL,
            retries=1,
        )

    return dag


for supplier in SUPPLIERS:
    globals()[supplier["name"]] = build_supplier_dag(supplier)

henry_schein = build_henry_schein_dag()
patterson = build_patterson_dag()
darby_dental = build_darby_dag()
match_products = build_product_matching_dag()
