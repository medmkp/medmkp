import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

// Estimates each supplier's shipping policy from invoice history — the only
// ground-truth shipping signal we have (medmkp_invoice.shipping_cents vs
// subtotal_cents, grouped by vendor). For each supplier we infer:
//   - flat_shipping_cents          = median shipping on invoices that paid for it
//   - free_shipping_threshold_cents = lowest subtotal that shipped free (the
//                                     observed free-shipping boundary)
// DRY-RUN by default; pass `--commit` to write. Remote writes additionally
// require ALLOW_REMOTE_DB_DESTRUCTIVE=true.
//
//   npm run supplier:estimate-shipping                              # dry-run (no writes)
//   ESTIMATE_SHIPPING_COMMIT=true npm run supplier:estimate-shipping  # write (local)
//   ESTIMATE_SHIPPING_COMMIT=true ALLOW_REMOTE_DB_DESTRUCTIVE=true npm run supplier:estimate-shipping  # write (remote)
//
// MIN_INVOICE_SAMPLES (env, default 2): suppliers with fewer usable invoices are
// reported but skipped, so we never fabricate a policy from a single data point.

type InvoiceRow = { vendor_name: string | null; subtotal_cents: number | null; shipping_cents: number | null }
type SupplierRow = { id: string; name: string; slug: string | null }
type Estimate = {
  supplier: SupplierRow
  n: number
  freeN: number
  paidN: number
  thresholdCents: number | null
  flatCents: number | null
}

function norm(name: string | null | undefined): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const usd = (cents: number | null) => (cents == null ? "—" : `$${(cents / 100).toFixed(2)}`)

export default async function estimateSupplierShipping({ container, args }: { container: any; args: string[] }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const commit = process.env.ESTIMATE_SHIPPING_COMMIT === "true" || (args || []).includes("--commit")
  const minSamples = Math.max(1, Number(process.env.MIN_INVOICE_SAMPLES) || 2)
  const dbUrl = process.env.DATABASE_URL || ""
  const host = (() => { try { return new URL(dbUrl).hostname } catch { return "?" } })()

  logger.info(`Estimate supplier shipping: host=${host} mode=${commit ? "COMMIT" : "DRY-RUN"} minSamples=${minSamples}`)
  if (commit) assertDestructiveDbOperationAllowed("estimate-supplier-shipping", dbUrl)

  const suppliers: SupplierRow[] = await knex("medmkp_supplier")
    .select("id", "name", "slug")
    .whereNull("deleted_at")

  // A subtotal is required to reason about a free-shipping threshold; a negative
  // or null shipping value is unusable. Keep everything else.
  const invoices: InvoiceRow[] = await knex("medmkp_invoice")
    .select("vendor_name", "subtotal_cents", "shipping_cents")
    .whereNotNull("vendor_name")
    .where("subtotal_cents", ">", 0)
    .where("shipping_cents", ">=", 0)
    .whereNull("deleted_at")

  // Index suppliers by normalized name so an invoice vendor can resolve by exact
  // normalized match first, then by a contains match either direction.
  const byNorm = new Map<string, SupplierRow>()
  for (const s of suppliers) {
    byNorm.set(norm(s.name), s)
    if (s.slug) byNorm.set(norm(s.slug), s)
  }
  const resolveSupplier = (vendor: string | null): SupplierRow | null => {
    const key = norm(vendor)
    if (!key) return null
    if (byNorm.has(key)) return byNorm.get(key)!
    for (const s of suppliers) {
      const sk = norm(s.name)
      if (sk && (sk.includes(key) || key.includes(sk))) return s
    }
    return null
  }

  // Bucket usable invoices per supplier.
  const samplesBySupplier = new Map<string, { subtotal: number; shipping: number }[]>()
  let matchedInvoices = 0
  for (const inv of invoices) {
    const supplier = resolveSupplier(inv.vendor_name)
    if (!supplier) continue
    matchedInvoices++
    const arr = samplesBySupplier.get(supplier.id) || []
    arr.push({ subtotal: inv.subtotal_cents || 0, shipping: inv.shipping_cents || 0 })
    samplesBySupplier.set(supplier.id, arr)
  }

  logger.info(`Invoices: ${invoices.length} usable, ${matchedInvoices} matched to a supplier; suppliers=${suppliers.length}`)

  const estimates: Estimate[] = []
  for (const supplier of suppliers) {
    const samples = samplesBySupplier.get(supplier.id) || []
    if (!samples.length) continue
    const paid = samples.filter((s) => s.shipping > 0)
    const free = samples.filter((s) => s.shipping === 0)
    // Free-shipping boundary: the cheapest order we observed ship for free. With
    // no free orders, there's no observed free tier.
    const thresholdCents = free.length ? Math.min(...free.map((s) => s.subtotal)) : null
    // Flat fee: typical amount paid when shipping was charged. All-free → $0.
    const flatCents = paid.length ? median(paid.map((s) => s.shipping)) : 0
    estimates.push({ supplier, n: samples.length, freeN: free.length, paidN: paid.length, thresholdCents, flatCents })
  }

  estimates.sort((a, b) => b.n - a.n)

  logger.info("Per-supplier estimates (n = usable invoices):")
  logger.info("  supplier                         n  free paid   threshold     flat")
  const writes: Estimate[] = []
  for (const e of estimates) {
    const enough = e.n >= minSamples
    const flag = enough ? "" : "  (skipped: < minSamples)"
    logger.info(
      `  ${e.supplier.name.slice(0, 30).padEnd(30)} ${String(e.n).padStart(3)} ${String(e.freeN).padStart(4)} ${String(e.paidN).padStart(4)}   ${usd(e.thresholdCents).padStart(9)} ${usd(e.flatCents).padStart(8)}${flag}`
    )
    if (enough) writes.push(e)
  }
  logger.info(`Estimated ${writes.length} supplier policies (${estimates.length - writes.length} skipped for insufficient data).`)

  if (!commit) {
    logger.info("DRY-RUN complete — no writes made. Re-run with --commit to persist.")
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  let written = 0
  for (const e of writes) {
    const notes = `Estimated from ${e.n} invoice(s) on ${today}: ${e.freeN} free, ${e.paidN} charged.`
    await knex("medmkp_supplier")
      .where("id", e.supplier.id)
      .update({
        free_shipping_threshold_cents: e.thresholdCents,
        flat_shipping_cents: e.flatCents,
        shipping_policy_notes: notes,
      })
    written++
  }
  logger.info(`COMMIT complete — wrote shipping policy for ${written} supplier(s).`)
}
