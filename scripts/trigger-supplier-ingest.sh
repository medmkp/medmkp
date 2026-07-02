#!/usr/bin/env bash
# Trigger a Shopify supplier catalog ingestion on the NUC Airflow from a dev
# machine. The supplier list comes from the vetting registry
# (medusa-backend/apps/backend/data/supplier-vetting/*-catalog-sources.json,
# entries flagged platform:"shopify") — the same files that drive adapter
# routing and the Airflow DAGs.
#
# Usage:
#   npm run ingest:supplier -- --list                # show registered suppliers
#   npm run ingest:supplier -- jmu-dental            # trigger by slug
#   npm run ingest:supplier -- msup_jmudental_com    # ...or by supplier id
#   npm run ingest:supplier -- jmu-dental --dry-run  # print the remote command only
#
# Requires ssh access to the NUC (host alias "nuc"); override with NUC_HOST /
# NUC_REPO_DIR like scripts/deploy-airflow-nuc.sh.
set -euo pipefail

NUC_HOST="${NUC_HOST:-nuc}"
NUC_REPO_DIR="${NUC_REPO_DIR:-/opt/medmkp}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VETTING_DIR="$ROOT_DIR/medusa-backend/apps/backend/data/supplier-vetting"
DAG_ID="shopify_supplier_ingest"

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

list_suppliers() {
  python3 - "$VETTING_DIR" <<'PY'
import json, pathlib, sys

vetting_dir = pathlib.Path(sys.argv[1])
rows = []
for path in sorted(vetting_dir.glob("*-catalog-sources.json")):
    entries = json.loads(path.read_text())
    if not isinstance(entries, list):
        continue
    for entry in entries:
        if isinstance(entry, dict) and entry.get("platform") == "shopify":
            rows.append((entry.get("slug", ""), entry["supplier_id"], entry.get("origin", "")))

width = max(len(slug) for slug, _, _ in rows) if rows else 0
id_width = max(len(sid) for _, sid, _ in rows) if rows else 0
for slug, supplier_id, origin in rows:
    print(f"{slug:<{width}}  {supplier_id:<{id_width}}  {origin}")
PY
}

resolve_supplier_id() {
  python3 - "$VETTING_DIR" "$1" <<'PY'
import json, pathlib, sys

vetting_dir, query = pathlib.Path(sys.argv[1]), sys.argv[2]
for path in sorted(vetting_dir.glob("*-catalog-sources.json")):
    entries = json.loads(path.read_text())
    if not isinstance(entries, list):
        continue
    for entry in entries:
        if isinstance(entry, dict) and entry.get("platform") == "shopify":
            if query in (entry.get("slug"), entry.get("supplier_id")):
                print(entry["supplier_id"])
                sys.exit(0)

print(f'No platform:"shopify" vetting entry matches "{query}".', file=sys.stderr)
print("Registered suppliers:", file=sys.stderr)
sys.exit(1)
PY
}

if [[ $# -lt 1 || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 1
fi

if [[ "$1" == "--list" ]]; then
  list_suppliers
  exit 0
fi

QUERY="$1"
DRY_RUN="${2:-}"

# Fail closed on a flag typo (--dryrun, -n, ...): anything unrecognized must
# not fall through to a live trigger against the prod-committing NUC Airflow.
if [[ -n "$DRY_RUN" && "$DRY_RUN" != "--dry-run" ]]; then
  echo "Unknown argument: $DRY_RUN (did you mean --dry-run?)" >&2
  usage >&2
  exit 1
fi

if ! SUPPLIER_ID="$(resolve_supplier_id "$QUERY")"; then
  list_suppliers >&2
  exit 1
fi

CONF="{\"supplier_id\": \"$SUPPLIER_ID\"}"
REMOTE_CMD="cd '$NUC_REPO_DIR/airflow' && docker compose exec -T airflow airflow dags trigger $DAG_ID --conf '$CONF'"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  # %q so the printed line, copy-pasted, passes ssh exactly the same argument
  # the script would (a plain echo would mangle the --conf JSON quoting).
  printf 'ssh %q %q\n' "$NUC_HOST" "$REMOTE_CMD"
  exit 0
fi

echo "Triggering $DAG_ID for $SUPPLIER_ID on $NUC_HOST..."
ssh "$NUC_HOST" "$REMOTE_CMD"
echo
echo "Follow the run: http://$NUC_HOST:8080/dags/$DAG_ID/grid"
