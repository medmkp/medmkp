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

function canonicalId(cluster: Cluster): string {
  return `mcp_auto_${cluster.key.toString(36).padStart(6, "0")}`
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

    const canonicalRows = result.clusters.map((cluster) => {
      const rep = cluster.representative
      const family = result.families.get(cluster.key) ?? null
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
      return [
        canonicalId(cluster),
        `auto-${slugify(rep.row.name)}-${cluster.key.toString(36)}`,
        rep.row.name,
        mostCommon(cluster.members.map((m) => m.row.category)),
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
          canonicalId(cluster),
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
      `mcp_auto_${substitute.clusterKey.toString(36).padStart(6, "0")}`,
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

export { canonicalId }
