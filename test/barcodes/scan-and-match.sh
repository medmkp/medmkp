#!/usr/bin/env bash
# Decode a barcode image with zbar, query the medmkp prod scanner lookup,
# and report whether it resolves to a catalog product.
# Usage: scan-and-match.sh <image-file>
set -uo pipefail

BACKEND="https://medmkp-medusa.onrender.com/medmkp/products/search"
img="$1"

# zbar prints e.g. "EAN-13:0743842007546" — strip the symbology prefix.
raw=$(zbarimg -q --raw "$img" 2>/dev/null | head -1 | tr -d '[:space:]')
if [ -z "$raw" ]; then
  echo "NODECODE	$img	-	-"
  exit 0
fi

resp=$(curl -s -m 30 "$BACKEND?barcode=$raw")
count=$(printf '%s' "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("count",0))' 2>/dev/null || echo 0)
name=$(printf '%s' "$resp" | python3 -c 'import sys,json;d=json.load(sys.stdin);p=d.get("products") or [{}];print(p[0].get("name","")[:60])' 2>/dev/null)

if [ "${count:-0}" -gt 0 ]; then
  echo "MATCH	$img	$raw	$name"
else
  echo "NOMATCH	$img	$raw	-"
fi
