import { createHash } from "crypto"
import type { Client } from "pg"
import type { Cluster, MatchRunResult, SupplierProductRow } from "./types"

export async function loadSupplierProducts(client: Client): Promise<SupplierProductRow[]> {
  const products = await client.query(
    `SELECT id, supplier_id, sku, manufacturer_sku, brand, name, category,
            pack_size, unit_of_measure, product_url, image_url
     FROM medmkp_supplier_product
     WHERE deleted_at IS NULL`
  )

  const prices = await client.query(
    `SELECT DISTINCT ON (supplier_product_id)
            supplier_product_id, price_cents, price_basis
     FROM medmkp_supplier_price_snapshot
     WHERE deleted_at IS NULL
     ORDER BY supplier_product_id, captured_at DESC`
  )

  const priceByProduct = new Map<string, { price_cents: number; price_basis: string }>()
  for (const row of prices.rows) {
    priceByProduct.set(row.supplier_product_id, {
      price_cents: row.price_cents,
      price_basis: row.price_basis,
    })
  }

  return products.rows.map((row) => ({
    ...row,
    price_cents: priceByProduct.get(row.id)?.price_cents ?? null,
    price_basis: priceByProduct.get(row.id)?.price_basis ?? null,
  }))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function baseCanonicalId(contentKey: string): string {
  return `mcp_auto_${createHash("sha1").update(contentKey).digest("hex").slice(0, 12)}`
}

function minMemberId(cluster: Cluster): string {
  let min = cluster.members[0].row.id
  for (const member of cluster.members) {
    if (member.row.id < min) {
      min = member.row.id
    }
  }
  return min
}

/**
 * Assign a stable, content-addressed id and handle to every cluster. The id is a
 * hash of the cluster's contentKey, so the same product keeps the same id (and
 * therefore the same URL) across re-match runs regardless of iteration order.
 *
 * Two distinct clusters can in principle hash to the same id (identical
 * brand/model/pack/variant the matcher nonetheless left unmerged); we resolve
 * such collisions deterministically by processing clusters in a stable order
 * (contentKey, then smallest member id) and suffixing later collisions, so the
 * disambiguation itself is reproducible across runs.
 */
export function assignCanonicalIds(
  clusters: Cluster[]
): Map<number, { id: string; handle: string }> {
  const ordered = [...clusters].sort((a, b) => {
    if (a.contentKey !== b.contentKey) {
      return a.contentKey < b.contentKey ? -1 : 1
    }
    const am = minMemberId(a)
    const bm = minMemberId(b)
    return am < bm ? -1 : am > bm ? 1 : 0
  })

  const usedIds = new Set<string>()
  const usedHandles = new Set<string>()
  const out = new Map<number, { id: string; handle: string }>()

  for (const cluster of ordered) {
    const base = baseCanonicalId(cluster.contentKey)
    let id = base
    let n = 1
    while (usedIds.has(id)) {
      n += 1
      id = `${base}_${n}`
    }
    usedIds.add(id)

    const slug = slugify(cluster.representative.row.name)
    const suffix = id.slice(-6)
    let handle = `auto-${slug}-${suffix}`
    let h = 1
    while (usedHandles.has(handle)) {
      h += 1
      handle = `auto-${slug}-${suffix}-${h}`
    }
    usedHandles.add(handle)

    out.set(cluster.key, { id, handle })
  }

  return out
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  let best = ""
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

// "Dental supplies" is the catch-all that Patterson and the marketplace default
// stamp on otherwise-uncategorized products (it is the single most common
// category in the catalog). Treat it (and empty) as a fallback only.
const GENERIC_CATEGORIES = new Set(["", "dental supplies"])

/**
 * Choose a canonical's category from its members' supplier categories,
 * preferring a specific one over the generic catch-all: a specific category on
 * any member wins even when the catch-all is more numerous. Without this, the
 * same product's size variants land on different categories purely because the
 * specific-vs-catch-all member ratio differs per size (e.g. Nitrile Utility
 * Gloves: "Gloves" on Small but "Dental supplies" on the others).
 */
export function pickCategory(categories: string[]): string {
  const specific = categories.filter(
    (category) => !GENERIC_CATEGORIES.has(category.trim().toLowerCase())
  )
  return specific.length ? mostCommon(specific) : mostCommon(categories)
}

export async function batchInsert(
  client: Client,
  table: string,
  columns: string[],
  rows: unknown[][],
  batchSize = 500
) {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    const placeholders = batch
      .map(
        (_, rowIdx) =>
          `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(", ")})`
      )
      .join(", ")
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`,
      batch.flat()
    )
  }
}

/**
 * Persist a match run. Idempotent: previous auto-generated canonical
 * products, identity matches, and substitute rows are reset first, so the
 * matcher can be re-run after every catalog refresh. Rows whose
 * match_reason does not start with "auto:" (e.g. future manual curation)
 * are never touched.
 */
export async function commitMatchRun(client: Client, result: MatchRunResult): Promise<void> {
  await client.query("BEGIN")
  try {
    // The prod DB is memory-starved; a parallel seq scan over the large
    // delete/reset queries can OOM-crash it. Keep this transaction single-
    // threaded (work_mem stays at the server default on purpose — raising it is
    // the documented OOM trigger). Scoped to the transaction (LOCAL), so it
    // never affects the app's sessions.
    await client.query(`SET LOCAL max_parallel_workers_per_gather = 0`)

    // Stable, content-addressed id + handle per cluster (computed once, reused for
    // the canonical rows, identity matches, and substitute rows below).
    const idByClusterKey = assignCanonicalIds(result.clusters)

    // Snapshot the current auto canonicals and their members BEFORE we drop them,
    // so we can record handle aliases for any product whose handle changes this
    // run (the one-time positional->content-addressed switch, and any later
    // representative drift). Old URLs then keep resolving via the alias table.
    const oldSnapshot = await client.query<{ id: string; handle: string; supplier_product_id: string }>(
      `SELECT cp.id, cp.handle, m.supplier_product_id
       FROM medmkp_canonical_product cp
       JOIN medmkp_canonical_product_match m
         ON m.canonical_product_id = cp.id AND m.deleted_at IS NULL
       WHERE cp.id LIKE 'mcp_auto_%' AND cp.deleted_at IS NULL`
    )
    const oldByCanonical = new Map<string, { handle: string; members: string[] }>()
    for (const row of oldSnapshot.rows) {
      let entry = oldByCanonical.get(row.id)
      if (!entry) {
        entry = { handle: row.handle, members: [] }
        oldByCanonical.set(row.id, entry)
      }
      entry.members.push(row.supplier_product_id)
    }

    await client.query(`DELETE FROM medmkp_canonical_product_match WHERE id LIKE 'mcpm_auto_%'`)
    // Reset rows the matcher wrote, plus any rows other writers (e.g. the
    // ingestion pipeline's deterministic matcher) pointed at auto canonical
    // products — those ids are regenerated on every run and would dangle.
    await client.query(
      `UPDATE medmkp_canonical_product_match
       SET canonical_product_id = '', match_status = 'unmatched', confidence_score = 0,
           match_reason = 'No deterministic canonical match rule fired', updated_at = now()
       WHERE match_reason LIKE 'auto:%' OR canonical_product_id LIKE 'mcp_auto_%'`
    )
    await client.query(`DELETE FROM medmkp_canonical_product WHERE id LIKE 'mcp_auto_%'`)

    // Family-wide category consensus: all variants of one product (e.g. every
    // glove size) must share a category, so aggregate every member's category
    // across the family's clusters and pick once.
    const familyCategoryMembers = new Map<string, string[]>()
    for (const cluster of result.clusters) {
      const family = result.families.get(cluster.key)
      if (!family) {
        continue
      }
      const list = familyCategoryMembers.get(family.familyId) ?? []
      for (const member of cluster.members) {
        list.push(member.row.category)
      }
      familyCategoryMembers.set(family.familyId, list)
    }
    const familyCategory = new Map<string, string>()
    for (const [familyId, categories] of familyCategoryMembers) {
      familyCategory.set(familyId, pickCategory(categories))
    }

    const canonicalRows = result.clusters.map((cluster) => {
      const rep = cluster.representative
      const family = result.families.get(cluster.key) ?? null
      const category = family
        ? familyCategory.get(family.familyId)!
        : pickCategory(cluster.members.map((m) => m.row.category))
      const attributes = {
        brands: [...new Set(cluster.members.map((m) => m.row.brand).filter(Boolean))],
        manufacturer_skus: [...new Set(cluster.members.map((m) => m.row.manufacturer_sku).filter(Boolean))],
        pack_sizes: [...new Set(cluster.members.map((m) => m.row.pack_size).filter(Boolean))],
        supplier_count: cluster.supplierCount,
        member_count: cluster.members.length,
        // Surfaced on the product page (Size/Type chips read these).
        ...(family
          ? { family: family.familyName, size: family.variantLabel }
          : {}),
      }
      const assigned = idByClusterKey.get(cluster.key)!
      return [
        assigned.id,
        assigned.handle,
        rep.row.name,
        category,
        "",
        mostCommon(cluster.members.map((m) => m.row.unit_of_measure)),
        JSON.stringify(attributes),
        family?.familyId ?? null,
        family?.familyHandle ?? null,
        family?.familyName ?? null,
        family?.variantLabel ?? null,
        // variant_rank is an INTEGER column; guard the boundary so a fractional
        // rank can never abort the whole commit.
        family ? Math.round(family.variantRank) : null,
      ]
    })
    await batchInsert(
      client,
      "medmkp_canonical_product",
      [
        "id", "handle", "name", "category", "description", "unit_of_measure", "attributes_text",
        "family_id", "family_handle", "family_name", "variant_label", "variant_rank",
      ],
      canonicalRows
    )

    // Record handle aliases for products whose handle changed this run. Map each
    // old canonical to its successor by majority vote of its members' new
    // canonical id, then alias old_handle -> successor. Skip handles that are
    // still live (a current canonical owns them) so a direct lookup always wins.
    const newCanonicalBySupplier = new Map<string, string>()
    for (const cluster of result.clusters) {
      const id = idByClusterKey.get(cluster.key)!.id
      for (const member of cluster.members) {
        newCanonicalBySupplier.set(member.row.id, id)
      }
    }
    const liveHandles = new Set([...idByClusterKey.values()].map((a) => a.handle))
    const aliasRows: unknown[][] = []
    const aliasedHandles = new Set<string>()
    for (const { handle: oldHandle, members } of oldByCanonical.values()) {
      if (!oldHandle || liveHandles.has(oldHandle) || aliasedHandles.has(oldHandle)) {
        continue
      }
      const votes = new Map<string, number>()
      for (const supplierProductId of members) {
        const newId = newCanonicalBySupplier.get(supplierProductId)
        if (newId) {
          votes.set(newId, (votes.get(newId) ?? 0) + 1)
        }
      }
      let successorId = ""
      let bestVotes = 0
      for (const [id, count] of votes) {
        if (count > bestVotes) {
          bestVotes = count
          successorId = id
        }
      }
      if (!successorId) {
        continue
      }
      aliasedHandles.add(oldHandle)
      aliasRows.push([oldHandle, successorId])
    }
    for (let offset = 0; offset < aliasRows.length; offset += 500) {
      const batch = aliasRows.slice(offset, offset + 500)
      const placeholders = batch
        .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`)
        .join(", ")
      await client.query(
        `INSERT INTO medmkp_canonical_handle_alias (handle, canonical_id)
         VALUES ${placeholders}
         ON CONFLICT (handle) DO UPDATE
           SET canonical_id = EXCLUDED.canonical_id, updated_at = now()`,
        batch.flat()
      )
    }

    const decisions = new Map<string, { status: string; confidence: number; reason: string }>()
    for (const pair of result.acceptedPairs) {
      for (const product of [pair.a, pair.b]) {
        const existing = decisions.get(product.row.id)
        if (!existing || pair.decision.confidence > existing.confidence) {
          decisions.set(product.row.id, {
            status: pair.decision.status,
            confidence: pair.decision.confidence,
            reason: pair.decision.reason,
          })
        }
      }
    }

    const identityRows: unknown[][] = []
    for (const cluster of result.clusters) {
      for (const member of cluster.members) {
        const decision = decisions.get(member.row.id)
        identityRows.push([
          member.row.id,
          idByClusterKey.get(cluster.key)!.id,
          decision?.status ?? "exact",
          decision?.confidence ?? 75,
          decision?.reason ?? "auto:exact cluster-member",
        ])
      }
    }
    for (let offset = 0; offset < identityRows.length; offset += 500) {
      const batch = identityRows.slice(offset, offset + 500)
      const placeholders = batch
        .map(
          (_, idx) => `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
        )
        .join(", ")
      await client.query(
        `UPDATE medmkp_canonical_product_match m
         SET canonical_product_id = v.canonical_product_id,
             match_status = v.match_status,
             confidence_score = v.confidence::int,
             match_reason = v.match_reason,
             updated_at = now()
         FROM (VALUES ${placeholders}) AS v(supplier_product_id, canonical_product_id, match_status, confidence, match_reason)
         WHERE m.supplier_product_id = v.supplier_product_id
           AND m.deleted_at IS NULL
           AND m.match_status = 'unmatched'`,
        batch.flat()
      )
    }

    const substituteRows = result.substitutes.map((substitute, idx) => [
      `mcpm_auto_sub_${idx.toString(36).padStart(6, "0")}`,
      idByClusterKey.get(substitute.clusterKey)!.id,
      substitute.product.row.id,
      substitute.product.row.supplier_id,
      "substitute",
      substitute.confidence,
      substitute.reason,
      JSON.stringify({
        sku: substitute.product.row.sku,
        manufacturer_sku: substitute.product.row.manufacturer_sku,
        brand: substitute.product.row.brand,
        pack_size: substitute.product.row.pack_size,
        unit_price_cents: substitute.product.unitPriceCents,
        type_similarity: substitute.typeSim,
      }),
    ])
    await batchInsert(
      client,
      "medmkp_canonical_product_match",
      [
        "id",
        "canonical_product_id",
        "supplier_product_id",
        "supplier_id",
        "match_status",
        "confidence_score",
        "match_reason",
        "extracted_attributes_text",
      ],
      substituteRows
    )

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  }
}
