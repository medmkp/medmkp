import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { requirePractice } from "../../../utils/practice"
import { attentionReason } from "../../../utils/inventory"

const DAY = 86_400_000

type Reason = "unidentified" | "expired" | "expiring" | "missing_trace"

// GET /medmkp/needs-attention — the practice-wide worklist. Rolls every location's
// inventory evidence into one prioritized feed of lots that need a human: expired,
// expiring soon, unidentified (scanned but unmatched), or missing lot/expiry trace.
// This is the same signal that drives each location's needs_attention_count, just
// aggregated across the practice and returned at the row grain instead of a count.
// The reorder / recall / SDS-proof queues in the wireframe aren't backed yet (no
// live on-hand census, recall feed, or per-item SDS link), so they're omitted
// rather than faked.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const practiceId = await requirePractice(req, res)
  if (!practiceId) return

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const locations = await medmkp.listLocations({ practice_id: practiceId })
  const locationById = new Map<string, any>(locations.map((l: any) => [l.id, l]))
  const locationIds = locations.map((l: any) => l.id)
  const items = locationIds.length
    ? ((await medmkp.listInventoryItems({ location_id: locationIds })) as any[])
    : []

  const now = new Date()

  // Join supplier SKUs onto identified lots so each row is recognizable — the
  // item's stored name comes from the scan, the SKU from the matched offer.
  const supplierProductIds = [...new Set(items.map((i) => i.supplier_product_id).filter(Boolean))] as string[]
  const supplierProducts = supplierProductIds.length
    ? ((await medmkp.listSupplierProducts({ id: supplierProductIds })) as any[])
    : []
  const skuByProduct = new Map<string, string>(
    supplierProducts.map((sp) => [sp.id, sp.sku || sp.manufacturer_sku || ""])
  )

  const issues: any[] = []
  const stats = { expired: 0, expiring: 0, unidentified: 0, missing_trace: 0, total: 0 }
  const snapshot = { expired: 0, expiringThisWeek: 0, unidentified: 0, missing_trace: 0 }

  for (const it of items) {
    const reason = attentionReason(it, now) as Reason | null
    if (!reason) continue
    stats[reason]++
    stats.total++

    const exp = it.expiration_date ? new Date(it.expiration_date) : null
    const daysUntil = exp ? Math.ceil((exp.getTime() - now.getTime()) / DAY) : null

    if (reason === "expired") snapshot.expired++
    else if (reason === "expiring" && daysUntil != null && daysUntil <= 7) snapshot.expiringThisWeek++
    else if (reason === "unidentified") snapshot.unidentified++
    else if (reason === "missing_trace") snapshot.missing_trace++

    issues.push({
      id: it.id,
      name: it.name,
      sku: (it.supplier_product_id && skuByProduct.get(it.supplier_product_id)) || "",
      reason,
      location_id: it.location_id,
      location_name: locationById.get(it.location_id)?.name || "Unknown location",
      lot_number: it.lot_number || null,
      barcode: it.barcode || null,
      expiration_date: it.expiration_date || null,
      last_counted_at: it.last_counted_at || null,
    })
  }

  // Recent activity = the most recently captured lots across the practice. This is
  // the only real event stream we have (last_counted_at from the scanner), so it's
  // "what was touched last", not a full audit log.
  const recent = items
    .filter((i) => i.last_counted_at)
    .sort((a, b) => new Date(b.last_counted_at).getTime() - new Date(a.last_counted_at).getTime())
    .slice(0, 6)
    .map((i) => ({
      id: i.id,
      name: i.name,
      location_name: locationById.get(i.location_id)?.name || "Unknown location",
      last_counted_at: i.last_counted_at,
    }))

  res.json({ stats, snapshot, issues, recent })
}
