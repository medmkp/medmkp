/**
 * PROBE (read-only, no DB writes): estimate how much cross-supplier overlap a
 * name+brand blocking key would recover that the current SKU-based blocking
 * misses.
 *
 * The production matcher only generates a candidate pair when two products
 * share a catalog code (manufacturer_sku or a name-embedded part number). For
 * the two pure-distributor catalogs (DC Dental, Carolina) that code is an
 * internal SKU that never collides, so ~60K listings never get a candidate.
 *
 * This probe adds a second blocking key — same normalized brand + >=2 shared
 * core name tokens — and scores candidates with the *existing* name/brand/
 * numeric-attribute primitives (scorePair itself can't be reused: it requires
 * sku.score > 0 to ever accept). It pivots only on currently-unmatched
 * products to measure recoverability, and prints a precision sample.
 *
 *   DATABASE_URL=... ts-node ./src/scripts/probe-name-brand-matching.ts
 *   (optional) MAX_DF=300 HIGH=0.80 MEDIUM=0.70 ts-node ...
 */
import fs from "fs"
import path from "path"
import { Client } from "pg"
import { loadSupplierProducts } from "../matching/db"
import { normalizeProduct, brandsAgree } from "../matching/normalize"
import { jaccard, trigramDice, compareNumericAttrs, packRelation } from "../matching/score"
import type { NormalizedProduct } from "../matching/types"

const MAX_DF = Number(process.env.MAX_DF ?? 300)
const MIN_SHARED_CORE = 2
const HIGH = Number(process.env.HIGH ?? 0.8)
const MEDIUM = Number(process.env.MEDIUM ?? 0.7)

type Numeric = ReturnType<typeof compareNumericAttrs>

/** Same name-similarity blend scorePair uses, so thresholds are comparable. */
function nameSimilarity(
  a: NormalizedProduct,
  b: NormalizedProduct,
  numeric: Numeric,
  brandMatch: boolean
): number {
  const tokenSim = jaccard(a.nameTokens, b.nameTokens)
  const charSim = trigramDice(a, b)
  let nameSim = 0.45 * tokenSim + 0.55 * charSim
  nameSim += Math.min(numeric.agreements * 0.05, 0.15)
  if (brandMatch) nameSim += 0.05
  if (numeric.bareConflict) nameSim -= 0.1
  return Math.max(0, Math.min(1, nameSim))
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  throw new Error("Set DATABASE_URL (this probe never writes; point it at prod read-only).")
}

class UnionFind {
  parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[rb] = ra
  }
}

type AcceptedPair = {
  pivot: NormalizedProduct
  cand: NormalizedProduct
  nameSim: number
  packRel: string
  candMatched: boolean
  high: boolean
}

async function main() {
  const databaseUrl = resolveDatabaseUrl()
  const client = new Client({
    connectionString: databaseUrl,
    ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    console.log("Loading supplier products + prices...")
    const rows = await loadSupplierProducts(client)
    const products = rows.map(normalizeProduct)
    console.log(`Loaded + normalized ${products.length} products`)

    console.log("Loading current match status...")
    const statusRes = await client.query(
      `SELECT supplier_product_id, match_status, canonical_product_id
       FROM medmkp_canonical_product_match
       WHERE deleted_at IS NULL AND match_status IN ('exact','variant','needs_review','unmatched')`
    )
    const statusById = new Map<string, { status: string; canon: string }>()
    for (const r of statusRes.rows) {
      statusById.set(r.supplier_product_id, {
        status: r.match_status,
        canon: r.canonical_product_id || "",
      })
    }
    const statusOf = (p: NormalizedProduct) => statusById.get(p.row.id)?.status ?? "unknown"
    const isMatched = (p: NormalizedProduct) => {
      const s = statusOf(p)
      return s === "exact" || s === "variant"
    }

    console.log("Building core-token inverted index...")
    const tokenIndex = new Map<string, number[]>()
    products.forEach((p, idx) => {
      for (const t of new Set(p.coreTokens)) {
        let list = tokenIndex.get(t)
        if (!list) {
          list = []
          tokenIndex.set(t, list)
        }
        list.push(idx)
      }
    })

    console.log(`Generating + scoring name+brand candidates (MAX_DF=${MAX_DF}, HIGH=${HIGH}, MEDIUM=${MEDIUM})...`)
    const acceptedByPairKey = new Map<string, AcceptedPair>()
    let pivots = 0

    products.forEach((p, pivotIdx) => {
      if (statusOf(p) !== "unmatched" || !p.brandKey) return
      pivots++

      const overlap = new Map<number, number>()
      for (const t of new Set(p.coreTokens)) {
        const list = tokenIndex.get(t)
        if (!list || list.length > MAX_DF) continue
        for (const idx of list) {
          if (idx === pivotIdx) continue
          overlap.set(idx, (overlap.get(idx) ?? 0) + 1)
        }
      }

      for (const [idx, shared] of overlap) {
        if (shared < MIN_SHARED_CORE) continue
        const cand = products[idx]
        if (cand.row.supplier_id === p.row.supplier_id) continue
        if (cand.brandKey !== p.brandKey) continue

        const numeric = compareNumericAttrs(p, cand)
        if (numeric.hardConflict || numeric.bareConflict) continue
        if (brandsAgree(p, cand) !== "match") continue

        const ns = nameSimilarity(p, cand, numeric, true)
        if (ns < MEDIUM) continue

        const key = p.row.id < cand.row.id ? `${p.row.id}|${cand.row.id}` : `${cand.row.id}|${p.row.id}`
        const existing = acceptedByPairKey.get(key)
        if (!existing || ns > existing.nameSim) {
          acceptedByPairKey.set(key, {
            pivot: p,
            cand,
            nameSim: ns,
            packRel: packRelation(p, cand),
            candMatched: isMatched(cand),
            high: ns >= HIGH,
          })
        }
      }
    })

    const accepted = [...acceptedByPairKey.values()]
    const highPairs = accepted.filter((a) => a.high)

    // Recoverability: distinct currently-unmatched products that gain a link.
    const recoverableHigh = new Set<string>()
    const recoverableMedium = new Set<string>()
    const joinsExistingGroup = new Set<string>() // unmatched product links to an already-matched product
    for (const a of accepted) {
      recoverableMedium.add(a.pivot.row.id)
      if (statusOf(a.cand) === "unmatched") recoverableMedium.add(a.cand.row.id)
    }
    for (const a of highPairs) {
      recoverableHigh.add(a.pivot.row.id)
      if (statusOf(a.cand) === "unmatched") recoverableHigh.add(a.cand.row.id)
      if (a.candMatched) joinsExistingGroup.add(a.pivot.row.id)
    }

    // New cross-supplier groups formed purely among currently-unmatched products
    // (high-tier links only). Map ids -> dense index for union-find.
    const idToIdx = new Map<string, number>()
    products.forEach((p, i) => idToIdx.set(p.row.id, i))
    const uf = new UnionFind(products.length)
    for (const a of highPairs) {
      if (statusOf(a.pivot) === "unmatched" && statusOf(a.cand) === "unmatched") {
        uf.union(idToIdx.get(a.pivot.row.id)!, idToIdx.get(a.cand.row.id)!)
      }
    }
    const compMembers = new Map<number, Set<string>>() // root -> supplier ids
    const compSize = new Map<number, number>()
    const inNewGroup = new Set<string>()
    for (const a of highPairs) {
      if (statusOf(a.pivot) !== "unmatched" || statusOf(a.cand) !== "unmatched") continue
      for (const p of [a.pivot, a.cand]) {
        const root = uf.find(idToIdx.get(p.row.id)!)
        if (!compMembers.has(root)) compMembers.set(root, new Set())
        compMembers.get(root)!.add(p.row.supplier_id)
        if (!inNewGroup.has(p.row.id)) {
          inNewGroup.add(p.row.id)
          compSize.set(root, (compSize.get(root) ?? 0) + 1)
        }
      }
    }
    let newMultiSupplierGroups = 0
    for (const suppliers of compMembers.values()) {
      if (suppliers.size >= 2) newMultiSupplierGroups++
    }

    const summary = {
      thresholds: { MAX_DF, MIN_SHARED_CORE, HIGH, MEDIUM },
      unmatched_pivots_with_brand: pivots,
      accepted_pairs_medium_plus: accepted.length,
      accepted_pairs_high: highPairs.length,
      recoverable_unmatched_products_high: recoverableHigh.size,
      recoverable_unmatched_products_medium_plus: recoverableMedium.size,
      of_which_join_existing_canonical_high: joinsExistingGroup.size,
      new_cross_supplier_groups_high: newMultiSupplierGroups,
    }
    console.log("\n=== SUMMARY ===")
    console.log(JSON.stringify(summary, null, 2))

    const diffTokens = (a: NormalizedProduct, b: NormalizedProduct) => {
      const sb = new Set(b.nameTokens)
      const sa = new Set(a.nameTokens)
      const onlyA = [...sa].filter((t) => !sb.has(t))
      const onlyB = [...sb].filter((t) => !sa.has(t))
      return `±[${onlyA.join(",")} / ${onlyB.join(",")}]`
    }
    const sample = (pairs: AcceptedPair[], n: number) => {
      const sorted = [...pairs].sort((x, y) => x.nameSim - y.nameSim)
      const step = Math.max(1, Math.floor(sorted.length / n))
      const out: AcceptedPair[] = []
      for (let i = 0; i < sorted.length && out.length < n; i += step) out.push(sorted[i])
      return out
    }
    const fmt = (a: AcceptedPair) =>
      [
        a.nameSim.toFixed(2),
        a.high ? "H" : "m",
        a.candMatched ? "join" : "new",
        `${a.pivot.row.supplier_id.replace("msup_", "").replace("_com", "")}/${a.cand.row.supplier_id
          .replace("msup_", "")
          .replace("_com", "")}`,
        `[${a.pivot.brandKey}]`,
        a.pivot.row.name,
        "  ⟷  ",
        a.cand.row.name,
        diffTokens(a.pivot, a.cand),
      ].join("  ")

    console.log("\n=== PRECISION SAMPLE — HIGH tier (nameSim >= " + HIGH + "), spread low→high ===")
    for (const a of sample(highPairs, 30)) console.log(fmt(a))

    console.log("\n=== PRECISION SAMPLE — MEDIUM-only tier [" + MEDIUM + "," + HIGH + ") ===")
    for (const a of sample(accepted.filter((a) => !a.high), 15)) console.log(fmt(a))

    const outDir = path.resolve(__dirname, "../../.medmkp/matching/name-brand-probe")
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2))
    const csv = [
      "nameSim,tier,kind,pivot_supplier,cand_supplier,brand,pivot_name,cand_name",
      ...accepted
        .sort((x, y) => y.nameSim - x.nameSim)
        .map((a) =>
          [
            a.nameSim.toFixed(3),
            a.high ? "high" : "medium",
            a.candMatched ? "join_existing" : "new_group",
            a.pivot.row.supplier_id,
            a.cand.row.supplier_id,
            JSON.stringify(a.pivot.brandKey ?? ""),
            JSON.stringify(a.pivot.row.name),
            JSON.stringify(a.cand.row.name),
          ].join(",")
        ),
    ].join("\n")
    fs.writeFileSync(path.join(outDir, "accepted-pairs.csv"), csv)
    console.log(`\nWrote ${outDir}/summary.json and accepted-pairs.csv`)
  } finally {
    await client.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
