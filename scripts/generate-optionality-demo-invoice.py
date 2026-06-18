#!/usr/bin/env python3
"""Generate demo invoices whose line items all have strong cross-supplier
optionality, selected from the LIVE canonical matches (what the app shows).

Reads a dump of clean multi-supplier cluster members (see DUMP_SQL / the TSV
produced alongside this script), then builds one invoice per "current supplier"
from products where that supplier is NOT the cheapest, so every uploaded line
surfaces a cheaper alternative. Clusters are assigned disjointly so the
invoices are distinct. The over-merged bur/wire/composite families are excluded
upstream in the dump query.

  python3 scripts/generate-optionality-demo-invoice.py \
      --members /tmp/medmkp-demo-members.tsv --invoices 5 --lines 13
"""
import argparse
import importlib.util
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Reuse the PDF rendering + helpers from the existing generator (hyphenated
# filename, so load it by path rather than a normal import).
_spec = importlib.util.spec_from_file_location("gti", ROOT / "scripts" / "generate-test-invoices.py")
gti = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gti)


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\x20-\x7e]+", " ", text)).strip()


def unit_for(pack: str) -> str:
    p = pack.lower()
    if "box" in p or "/bx" in p or re.search(r"\bbx\b", p):
        return "box"
    if "case" in p or "/cs" in p:
        return "case"
    if any(t in p for t in ("pk", "pack", "pkg")):
        return "pack"
    return "each"


def load_clusters(tsv: Path):
    """cid -> {minp, min_supplier, members: {supplier: (sku, name, pack, price)}}"""
    clusters = {}
    for line in tsv.read_text().splitlines():
        parts = line.split("\t")
        if len(parts) != 9:
            continue
        cid, supplier, sku, name, pack, price, minp, min_supplier, suppliers = parts
        c = clusters.setdefault(cid, {"minp": int(minp), "min_supplier": min_supplier, "members": {}})
        # keep the cheapest listing if a supplier appears twice
        prev = c["members"].get(supplier)
        if prev is None or int(price) < prev[3]:
            c["members"][supplier] = (sku, clean(name), clean(pack), int(price))
    return clusters


def build_pools(clusters):
    """vendor -> sorted list of overpay candidates (savings desc)."""
    pools = {}
    for cid, c in clusters.items():
        for vendor, (sku, name, pack, price) in c["members"].items():
            if price <= c["minp"]:
                continue  # vendor is already the cheapest -> no savings to show
            savings = price - c["minp"]
            pools.setdefault(vendor, []).append(
                {"cid": cid, "sku": sku, "name": name, "pack": pack, "price": price,
                 "alt_price": c["minp"], "alt_supplier": c["min_supplier"], "savings": savings}
            )
    for v in pools:
        pools[v].sort(key=lambda r: r["savings"], reverse=True)
    return pools


def take(vendor_pool, used, lines, min_lines):
    """Pick up to `lines` unused, name-distinct candidates from a vendor pool."""
    picked, seen_prefix = [], set()
    for r in vendor_pool:
        if r["cid"] in used:
            continue
        prefix = re.sub(r"[^a-z0-9]+", " ", r["name"].lower())[:18]
        if prefix in seen_prefix:
            continue
        picked.append(r)
        seen_prefix.add(prefix)
        used.add(r["cid"])
        if len(picked) >= lines:
            break
    return picked if len(picked) >= min_lines else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--members", default="/tmp/medmkp-demo-members.tsv")
    parser.add_argument("--invoices", type=int, default=5)
    parser.add_argument("--lines", type=int, default=13)
    parser.add_argument("--min-lines", type=int, default=9)
    parser.add_argument("--seed", type=int, default=20260617)
    args = parser.parse_args()
    rng = random.Random(args.seed)

    clusters = load_clusters(Path(args.members))
    pools = build_pools(clusters)
    caps = {v: len(rows) for v, rows in pools.items()}
    print("Vendor overpay capacity (clean multi-supplier products where vendor is not cheapest):")
    for v, n in sorted(caps.items(), key=lambda kv: kv[1], reverse=True):
        print(f"  {v:34} {n}")

    used = set()
    plans = []  # (title, vendor, picks)

    # One invoice per vendor that can sustain it, constrained vendors first so
    # the dominant vendor doesn't starve them of products.
    eligible = sorted([v for v in pools if caps[v] >= args.min_lines], key=lambda v: caps[v])
    for vendor in eligible:
        if len(plans) >= args.invoices:
            break
        picks = take(pools[vendor], used, args.lines, args.min_lines)
        if picks:
            plans.append((vendor, vendor, picks))

    # If we still need more invoices, split the largest remaining pool.
    k = 2
    while len(plans) < args.invoices:
        vendor = max(pools, key=lambda v: sum(1 for r in pools[v] if r["cid"] not in used))
        picks = take(pools[vendor], used, args.lines, args.min_lines)
        if not picks:
            break
        plans.append((f"{vendor} (Reorder {k})", vendor, picks))
        k += 1

    OUT = gti.OUT_DIR
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for idx, (title, vendor, picks) in enumerate(plans):
        rng.shuffle(picks)
        items = []
        for r in picks:
            desc = r["name"] if not r["pack"] or r["pack"].lower() in r["name"].lower() else f"{r['name']} - {r['pack']}"
            items.append((r["sku"], desc, rng.randint(1, 5), unit_for(r["pack"]), r["price"]))
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
        path = OUT / f"invoice-{slug}-optionality-demo.pdf"
        layout = "sku-first" if idx % 2 == 0 else "desc-first"
        total = gti.build_invoice(path, vendor, items, f"{slug[:3].upper()}-2026{idx:02d}", layout, rng)
        save = sum((r["price"] - r["alt_price"]) * it[2] for r, it in zip(picks, items))
        made.append((path.name, vendor, len(items), total, save))

    print(f"\nGenerated {len(made)} invoices:")
    for name, vendor, n, total, save in made:
        print(f"  {name:52} {vendor:30} {n} lines · total {gti.money(total):>11} · savings {gti.money(save):>10}")


if __name__ == "__main__":
    main()
