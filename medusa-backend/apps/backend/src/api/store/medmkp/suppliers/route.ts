import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getPostgresPool } from "../../../../utils/postgres"

const CACHE_TTL_MS = 5 * 60 * 1000

type ShipTier = { min_subtotal_cents: number; flat_cents: number }

type SupplierRow = {
  id: string
  name: string
  product_count: string
  free_shipping_threshold_cents: number | null
  flat_shipping_cents: number | null
  shipping_policy_notes: string | null
  shipping_flat_tiers: ShipTier[] | null
  transit_days_min: number | null
  transit_days_max: number | null
  order_cutoff_local: string | null
  ships_same_day: boolean | null
  dist_center_zips: string | null
  ship_carrier: string | null
  shipping_time_notes: string | null
}

type Supplier = {
  id: string
  name: string
  product_count: number
  free_shipping_threshold_cents: number | null
  flat_shipping_cents: number | null
  shipping_policy_notes: string | null
  shipping_flat_tiers: ShipTier[] | null
  transit_days_min: number | null
  transit_days_max: number | null
  order_cutoff_local: string | null
  ships_same_day: boolean | null
  dist_center_zips: string | null
  ship_carrier: string | null
  shipping_time_notes: string | null
}

let cache: { loadedAt: number; suppliers: Supplier[] } | null = null

// Distinct ingested suppliers that have at least one active product. Drives the
// preferred-supplier picker in the buyer's default buying preferences and the
// per-supplier shipping policy used to estimate landed cost on the reorder list.
async function loadSuppliers(): Promise<Supplier[]> {
  const pool = getPostgresPool()
  const result = await pool.query<SupplierRow>(
    `SELECT s.id, s.name, count(p.id) AS product_count,
            s.free_shipping_threshold_cents, s.flat_shipping_cents, s.shipping_policy_notes,
            s.shipping_flat_tiers, s.transit_days_min, s.transit_days_max,
            s.order_cutoff_local, s.ships_same_day, s.dist_center_zips,
            s.ship_carrier, s.shipping_time_notes
     FROM medmkp_supplier s
     JOIN medmkp_supplier_product p ON p.supplier_id = s.id AND p.deleted_at IS NULL
     WHERE s.deleted_at IS NULL
     GROUP BY s.id, s.name, s.free_shipping_threshold_cents, s.flat_shipping_cents, s.shipping_policy_notes,
              s.shipping_flat_tiers, s.transit_days_min, s.transit_days_max,
              s.order_cutoff_local, s.ships_same_day, s.dist_center_zips,
              s.ship_carrier, s.shipping_time_notes
     HAVING count(p.id) > 0
     ORDER BY s.name ASC`
  )
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    product_count: Number(row.product_count),
    free_shipping_threshold_cents: row.free_shipping_threshold_cents,
    flat_shipping_cents: row.flat_shipping_cents,
    shipping_policy_notes: row.shipping_policy_notes,
    shipping_flat_tiers: row.shipping_flat_tiers,
    transit_days_min: row.transit_days_min,
    transit_days_max: row.transit_days_max,
    order_cutoff_local: row.order_cutoff_local,
    ships_same_day: row.ships_same_day,
    dist_center_zips: row.dist_center_zips,
    ship_carrier: row.ship_carrier,
    shipping_time_notes: row.shipping_time_notes,
  }))
}

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = { loadedAt: Date.now(), suppliers: await loadSuppliers() }
  }
  res.json({ suppliers: cache.suppliers })
}
