import { getPostgresPool } from "./postgres"

// The current price of a supplier product — the newest row of its append-only
// price-snapshot series. Carries every snapshot field the offer mappers read.
export type LatestPriceSnapshot = {
  supplier_product_id: string
  price_cents: number
  unit_price_cents: number | null
  availability: string
  captured_at: string
}

// Latest price snapshot per supplier product, resolved in the database. The
// snapshot table is an append-only time series (one row per product per
// ingestion-observed change), so listing every snapshot for a product set and
// reducing to the newest in JS loads the product's WHOLE price history per
// request — a memory cost that grows with every ingestion run (an amplifier in
// the prod heap OOMs fixed by #621). DISTINCT ON returns exactly one row per
// product straight off IDX_medmkp_supplier_price_snapshot_product_latest_active.
// captured_at is a text column, but every writer stamps it with
// new Date().toISOString() (fixed-width, millisecond UTC), so its lexicographic
// order IS chronological order; id breaks the (never yet observed) exact tie.
export async function latestPriceSnapshotsByProduct(
  supplierProductIds: string[]
): Promise<Map<string, LatestPriceSnapshot>> {
  if (!supplierProductIds.length) {
    return new Map()
  }

  const pool = getPostgresPool()
  const { rows } = await pool.query<LatestPriceSnapshot>(
    `SELECT DISTINCT ON (supplier_product_id)
            supplier_product_id, price_cents, unit_price_cents, availability, captured_at
     FROM medmkp_supplier_price_snapshot
     WHERE supplier_product_id = ANY($1) AND deleted_at IS NULL
     ORDER BY supplier_product_id, captured_at DESC, id DESC`,
    [supplierProductIds]
  )

  return new Map(rows.map((row) => [row.supplier_product_id, row]))
}
