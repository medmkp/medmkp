import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { resolvePracticeId } from "../../../utils/practice"

const MAX_LINES = 60

function serialize(row: any) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    supplier_slug: row.supplier_slug,
    status: row.status,
    results: row.results ?? null,
    cart_url: row.cart_url ?? null,
    error: row.error ?? null,
    finished_at: row.finished_at ?? null,
  }
}

// Returns the practice's recent cart-build jobs (the drawer polls this for live
// status). `?id=` narrows to one job.
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.json({ jobs: [] })
    return
  }
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const filter: Record<string, unknown> = { practice_id: practiceId }
  const id = (req.query.id as string) || ""
  if (id) filter.id = id
  const rows = await medmkp.listCartBuildJobs(filter, {
    order: { created_at: "DESC" },
    take: id ? 1 : 20,
  })
  res.json({ jobs: rows.map(serialize) })
}

type EnqueueBody = {
  supplier_id?: string
  lines?: { name?: string; qty?: number; productUrl?: string; sku?: string }[]
}

// Enqueues a cart-build for one supplier. Requires that the practice has stored
// a login for it (the agent can't shop without one). The NUC runner picks the
// job up via the agent claim endpoint.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.status(404).json({ error: "No practice linked to this account." })
    return
  }

  const body = (req.body ?? {}) as EnqueueBody
  const supplierId = (body.supplier_id ?? "").trim()
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .filter((l) => l?.productUrl)
    .slice(0, MAX_LINES)
    .map((l) => ({
      name: l.name ?? "",
      qty: Math.max(1, Math.round(Number(l.qty) || 1)),
      productUrl: l.productUrl,
      sku: l.sku ?? "",
    }))

  if (!supplierId || !lines.length) {
    res.status(400).json({ error: "supplier_id and at least one line with a productUrl are required." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const [credential] = await medmkp.listSupplierCredentials({
    practice_id: practiceId,
    supplier_id: supplierId,
  })
  if (!credential) {
    // The frontend should route the buyer to Settings to add a login first.
    res.status(409).json({ error: "needs_credentials", supplier_id: supplierId })
    return
  }

  const [supplier] = await medmkp.listSuppliers({ id: supplierId })
  if (!supplier) {
    res.status(404).json({ error: "Unknown supplier." })
    return
  }

  const [job] = await medmkp.createCartBuildJobs([
    {
      practice_id: practiceId,
      supplier_id: supplierId,
      supplier_slug: supplier.slug ?? "",
      status: "queued",
      lines,
    },
  ])

  res.status(202).json({ job: serialize(job) })
}
