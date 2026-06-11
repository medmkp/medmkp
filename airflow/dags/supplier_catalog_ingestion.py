"""Airflow DAG for MedMKP supplier catalog ingestion.

Expected Airflow Variables:
- medmkp_backend_dir: absolute path to medusa-backend/apps/backend
- medmkp_env_file: optional env file to source before running npm, defaults to .env
- medmkp_supplier_ingest_pool: optional Airflow pool, defaults to default_pool
- medmkp_supplier_ingest_commit: set to "false" for dry-run tasks, defaults to true
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

SUPPLIERS = [
    {
        "task_id": "ingest_dc_dental",
        "supplier_id": "msup_dcdental_com",
        "args": [
            "--max-links-per-source=500",
            "--max-dcdental-catalog-pages=30",
            "--source-concurrency=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=6",
            "--timeout-ms=30000",
        ],
    },
    {
        "task_id": "ingest_amerdental",
        "supplier_id": "msup_amerdental_com",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "task_id": "ingest_carolina_dental",
        "supplier_id": "msup_carolinadental_com",
        "args": [
            "--max-sitemaps-per-supplier=10",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "task_id": "ingest_sky_dental",
        "supplier_id": "msup_skydentalsupply_com",
        "args": [
            "--max-sitemaps-per-supplier=3",
            "--sitemap-concurrency=4",
            "--product-concurrency=12",
            "--timeout-ms=30000",
        ],
    },
    {
        "task_id": "ingest_shasta_dental",
        "supplier_id": "msup_shastadentalsupply_com",
        "args": [
            "--max-shasta-catalog-pages=5000",
            "--product-concurrency=6",
            "--timeout-ms=45000",
        ],
    },
]


def supplier_command(supplier: dict[str, object]) -> str:
    args = [f"--supplier-id={supplier['supplier_id']}"]
    if COMMIT_ENABLED:
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
npm run supplier:ingest:db -- {arg_string}
""".strip()


with DAG(
    dag_id="medmkp_supplier_catalog_ingestion",
    description="Import supplier catalogs and public price snapshots into MedMKP.",
    start_date=datetime(2026, 1, 1),
    schedule="0 3 * * 0",
    catchup=False,
    max_active_runs=1,
    max_active_tasks=3,
    tags=["medmkp", "supplier-ingestion"],
) as dag:
    for supplier in SUPPLIERS:
        BashOperator(
            task_id=supplier["task_id"],
            bash_command=supplier_command(supplier),
            pool=POOL,
            retries=1,
        )
