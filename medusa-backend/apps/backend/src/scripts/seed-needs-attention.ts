import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework"
import { MEDMKP_MODULE } from "../modules/medmkp"
import type MedMKPModuleService from "../modules/medmkp/service"
import { LOCATION_TYPES, mintQrCode, attentionReason } from "../utils/inventory"

// Seeds a practice with inventory that lights up every Needs Attention state, so
// the worklist (GET /medmkp/needs-attention) can be demoed against real data:
// expired lots, lots expiring soon, unidentified scans (no catalog match), and
// lots missing their lot/expiry trace — plus a few healthy lots so the practice
// reads like a real one (and audit readiness isn't 0%).
//
// Identified lots reference REAL catalog products (name + SKU come through), so
// the rows look legitimate. Every seeded row is tagged counted_by = SEED_MARKER,
// which is invisible in the UI but lets us re-run idempotently (a re-run clears
// the old seed and lays down a fresh set, so the relative dates stay current).
//
//   npx medusa exec ./src/scripts/seed-needs-attention.ts -- --email=you@example.com
//   npx medusa exec ./src/scripts/seed-needs-attention.ts -- --practice=dp_123 --dry-run
//   npx medusa exec ./src/scripts/seed-needs-attention.ts -- --email=you@example.com --clear

const PRACTICE_LINK_TABLE = "customer_customer_medmkp_medmkp_dental_practice"
const SEED_MARKER = "seed:needs-attention"
const DAY = 86_400_000

// medusa exec forwards CLI flags via process.argv (the injected `args` param is
// empty), so read them there — matching the other scripts in this directory.
function argValue(key: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${key}=`))
  return hit ? hit.split("=").slice(1).join("=").trim() : undefined
}

// The rooms we spread the seed across. Reused if the practice already has them;
// created only when the practice has no locations at all.
type Room = { name: string; type: (typeof LOCATION_TYPES)[number]; notes: string }
const MIN_ROOMS: Room[] = [
  { name: "Hygiene Cabinet", type: "cabinet", notes: "Hygiene Room" },
  { name: "Operatory 1", type: "operatory", notes: "Operatory · Treatment Room" },
  { name: "Sterilization", type: "sterilization", notes: "Sterilization Room · Equipment" },
  { name: "Storage", type: "storage", notes: "Storage Room · Supplies" },
]

type PoolProduct = { canonical_product_id: string; supplier_product_id: string; name: string; sku: string }

// A pool of real, recognizable dental products (canonical product + a priced
// supplier offer with a SKU) to attach to the identified lots. Falls back to any
// matched product if the recognizable-term search comes up short on a lean DB.
async function loadProductPool(knex: any): Promise<PoolProduct[]> {
  const terms = [
    "%nitrile%glove%", "%exam glove%", "%face mask%", "%earloop%", "%cavi%wipe%",
    "%disinfect%wipe%", "%prophy%angle%", "%fluoride varnish%", "%lidocaine%",
    "%articaine%", "%sterilization pouch%", "%patient bib%", "%cotton roll%",
    "%gauze%", "%composite%", "%saliva ejector%", "%tray cover%", "%prophy paste%",
  ]

  const base = () =>
    knex({ m: "medmkp_canonical_product_match" })
      .join({ sp: "medmkp_supplier_product" }, "sp.id", "m.supplier_product_id")
      .join({ cp: "medmkp_canonical_product" }, "cp.id", "m.canonical_product_id")
      .whereIn("m.match_status", ["exact", "variant"])
      .whereNull("m.deleted_at")
      .whereNull("sp.deleted_at")
      .whereNull("cp.deleted_at")
      .whereRaw("coalesce(sp.sku, '') <> ''")
      .orderBy("cp.name")
      .select(
        "m.canonical_product_id as canonical_product_id",
        "m.supplier_product_id as supplier_product_id",
        "cp.name as name",
        "sp.sku as sku",
      )

  // Dedupe by canonical product in JS (one lot per distinct product), so we don't
  // depend on Postgres DISTINCT ON semantics.
  const pool: PoolProduct[] = []
  const seen = new Set<string>()
  const take = (rows: PoolProduct[]) => {
    for (const p of rows) {
      if (seen.has(p.canonical_product_id)) continue
      seen.add(p.canonical_product_id)
      pool.push(p)
    }
  }

  take(await base().whereRaw("cp.name ILIKE ANY(?)", [terms]).limit(200))
  // Lean catalog — top up with any matched products so the demo still fills out.
  if (pool.length < 12) take(await base().limit(200))

  // Deterministic shuffle (hash of id): name-ordered results cluster one product
  // family together (all gauze, say) — spread them so the demo reads varied.
  const hash = (s: string) => {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return h
  }
  return pool.sort((a, b) => hash(a.canonical_product_id) - hash(b.canonical_product_id))
}

// One inventory row to lay down. `product` null ⇒ an unidentified scan.
type Spec = {
  label: string
  product: PoolProduct | null
  name?: string
  barcode?: string | null
  lot_number: string | null
  expiration_date: Date | null
}

export default async function seedNeedsAttention({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const medmkp = container.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const dryRun = process.argv.includes("--dry-run")
  const clearOnly = process.argv.includes("--clear")
  let practiceId = argValue("practice")
  const email = argValue("email")

  // Resolve the practice from a customer email when no explicit id is given.
  if (!practiceId && email) {
    const [customer] = await knex.select("id").from("customer").where({ email }).limit(1)
    if (!customer) throw new Error(`No customer found for email "${email}".`)
    const [link] = await knex
      .select("medmkp_dental_practice_id")
      .from(PRACTICE_LINK_TABLE)
      .where({ customer_id: customer.id })
      .whereNull("deleted_at")
      .limit(1)
    if (!link) throw new Error(`Customer "${email}" is not linked to any practice.`)
    practiceId = link.medmkp_dental_practice_id
  }

  if (!practiceId) {
    const practices = await knex.select("id", "name").from("medmkp_dental_practice").whereNull("deleted_at").limit(25)
    logger.info(`No --practice or --email given. Available practices:`)
    for (const p of practices) logger.info(`  ${p.id}  ${p.name}`)
    throw new Error("Pass --practice=<id> or --email=<customer email> to choose the target practice.")
  }

  // Ensure we have locations to hang the seed on (create a minimal set only when
  // the practice has none — otherwise reuse whatever's there).
  let locations = (await medmkp.listLocations({ practice_id: practiceId })) as any[]
  if (locations.length === 0 && !dryRun && !clearOnly) {
    for (const r of MIN_ROOMS) {
      await medmkp.createLocations({ practice_id: practiceId, name: r.name, type: r.type, qr_code: mintQrCode(), notes: r.notes })
    }
    locations = (await medmkp.listLocations({ practice_id: practiceId })) as any[]
  }
  const locationIds = locations.map((l) => l.id)

  // Clear any prior seed rows (marked by counted_by) — makes both --clear and a
  // plain re-run idempotent.
  const existing = locationIds.length ? ((await medmkp.listInventoryItems({ location_id: locationIds })) as any[]) : []
  const priorSeed = existing.filter((i) => i.counted_by === SEED_MARKER)
  if (priorSeed.length && !dryRun) {
    await medmkp.deleteInventoryItems(priorSeed.map((i) => i.id))
  }
  logger.info(
    `${clearOnly ? "Clearing" : "Seeding"} Needs Attention for practice ${practiceId} — ` +
    `${locations.length} location(s), removed ${dryRun ? "(dry-run) " : ""}${priorSeed.length} prior seed row(s).`,
  )
  if (clearOnly) {
    logger.info(dryRun ? "Dry-run: would clear only." : "Cleared seed rows. Done.")
    return
  }

  if (locations.length === 0) {
    throw new Error("Practice has no locations to seed into. Run seed-locations first, or drop --dry-run so this can create a minimal set.")
  }

  const pool = await loadProductPool(knex)
  if (pool.length === 0) {
    throw new Error("No matched catalog products with SKUs found — can't build identified lots. Seed the catalog first.")
  }
  logger.info(`  product pool: ${pool.length} real catalog item(s).`)

  const now = new Date()
  const addDays = (n: number) => new Date(now.getTime() + n * DAY)
  let pi = 0
  const nextProduct = (): PoolProduct => pool[pi++ % pool.length]

  // The lots to lay down — each group targets one Needs Attention state.
  const specs: Spec[] = [
    // Expired (past expiration) — urgent.
    { label: "expired", product: nextProduct(), lot_number: "LOT-24A-118", expiration_date: addDays(-9) },
    { label: "expired", product: nextProduct(), lot_number: "LOT-23K-402", expiration_date: addDays(-34) },
    { label: "expired", product: nextProduct(), lot_number: "LOT-24C-006", expiration_date: addDays(-2) },
    // Expiring soon (within 30 days).
    { label: "expiring", product: nextProduct(), lot_number: "LOT-25B-771", expiration_date: addDays(6) },
    { label: "expiring", product: nextProduct(), lot_number: "LOT-25A-330", expiration_date: addDays(14) },
    { label: "expiring", product: nextProduct(), lot_number: "LOT-25C-905", expiration_date: addDays(24) },
    // Missing trace — identified, but no lot (or no expiry) for the audit trail.
    { label: "missing_trace", product: nextProduct(), lot_number: null, expiration_date: addDays(210) },
    { label: "missing_trace", product: nextProduct(), lot_number: "LOT-25D-500", expiration_date: null },
    // Unidentified — scanned, no catalog match yet (barcode only).
    { label: "unidentified", product: null, name: "Unrecognized scan", barcode: "0069055012340", lot_number: null, expiration_date: null },
    { label: "unidentified", product: null, name: "Unrecognized scan", barcode: "3401579842093", lot_number: "LOT-25X-771", expiration_date: addDays(120) },
    // Healthy — identified, lot + far-off expiry. NOT flagged; keeps the practice real.
    { label: "healthy", product: nextProduct(), lot_number: "LOT-25E-101", expiration_date: addDays(300) },
    { label: "healthy", product: nextProduct(), lot_number: "LOT-25F-220", expiration_date: addDays(420) },
    { label: "healthy", product: nextProduct(), lot_number: "LOT-25G-088", expiration_date: addDays(365) },
    { label: "healthy", product: nextProduct(), lot_number: "LOT-25H-777", expiration_date: addDays(540) },
  ]

  const counts: Record<string, number> = {}
  let created = 0
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const location = locations[i % locations.length]
    const fields = {
      location_id: location.id,
      canonical_product_id: spec.product?.canonical_product_id ?? null,
      supplier_product_id: spec.product?.supplier_product_id ?? null,
      barcode: spec.barcode ?? null,
      name: spec.product?.name ?? spec.name ?? "Unrecognized scan",
      quantity_on_hand: 1 + (i % 3),
      is_estimated: true,
      lot_number: spec.lot_number,
      expiration_date: spec.expiration_date,
      capture_type: spec.product ? "receiving" : "shelf_audit",
      received_date: spec.product ? addDays(-14) : null,
      // Stagger the capture times so the "Recent activity" feed reads naturally.
      last_counted_at: new Date(now.getTime() - i * 41 * 60_000),
      counted_by: SEED_MARKER,
    }

    // Self-check: confirm the row actually lands in the state we intended (skip
    // the healthy rows, which are meant to be null).
    const reason = attentionReason(fields, now)
    const intended = spec.label === "healthy" ? null : spec.label
    const ok = reason === intended
    const tag = ok ? "" : `  ⚠ expected ${intended ?? "none"}, got ${reason ?? "none"}`

    if (dryRun) {
      logger.info(`  would create [${spec.label}] "${fields.name}" @ ${location.name} → reason=${reason ?? "none"}${tag}`)
    } else {
      await medmkp.createInventoryItems(fields)
      created += 1
      logger.info(`  created [${spec.label}] "${fields.name}" @ ${location.name} → reason=${reason ?? "none"}${tag}`)
    }
    counts[reason ?? "healthy"] = (counts[reason ?? "healthy"] || 0) + 1
  }

  const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")
  logger.info(dryRun ? `Dry-run complete. Would seed: ${summary}.` : `Done. Created ${created} lot(s): ${summary}.`)
}
