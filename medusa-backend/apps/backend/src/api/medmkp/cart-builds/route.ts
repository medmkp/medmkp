import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { assertEntitled, resolvePracticeId } from "../../../utils/practice"
import { encryptSecret, maskHint } from "../../../utils/secret-vault"

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
  if (!(await assertEntitled(req, res))) return

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
  // On-the-fly login: used for this build only. When `save` is true the login is
  // also persisted to the vault for next time; otherwise it rides the job
  // encrypted and is discarded when the build finishes.
  username?: string
  password?: string
  save?: boolean
}

// Enqueues a cart-build for one supplier. The agent needs a login: either one
// stored in the vault, or supplied inline on this request. The NUC runner picks
// the job up via the agent claim endpoint.
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
  if (!(await assertEntitled(req, res))) return

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

  const [supplier] = await medmkp.listSuppliers({ id: supplierId })
  if (!supplier) {
    res.status(404).json({ error: "Unknown supplier." })
    return
  }

  const [stored] = await medmkp.listSupplierCredentials({
    practice_id: practiceId,
    supplier_id: supplierId,
  })

  const inlineUser = (body.username ?? "").trim()
  const inlinePass = body.password ?? ""

  // Decide where the login comes from. Inline creds win (the buyer just typed
  // them); otherwise fall back to a stored vault login.
  const jobData: Record<string, unknown> = {
    practice_id: practiceId,
    supplier_id: supplierId,
    supplier_slug: supplier.slug ?? "",
    status: "queued",
    lines,
  }

  if (inlineUser && inlinePass) {
    if (body.save) {
      // Persist to the vault for next time, then build from it like normal.
      const data = {
        practice_id: practiceId,
        supplier_id: supplierId,
        username: inlineUser,
        username_hint: maskHint(inlineUser),
        password_encrypted: encryptSecret(inlinePass),
        last_status: "unverified" as const,
        last_verified_at: null,
        last_error: null,
      }
      if (stored) await medmkp.updateSupplierCredentials({ id: stored.id, ...data })
      else await medmkp.createSupplierCredentials(data)
    } else {
      // Ephemeral: seal onto the job, zeroed when the build finishes.
      jobData.credentials_encrypted = encryptSecret(inlinePass)
      jobData.credentials_username = inlineUser
    }
  } else if (!stored) {
    // No inline creds and nothing saved — the frontend should prompt for a login.
    res.status(409).json({ error: "needs_credentials", supplier_id: supplierId })
    return
  }

  const [job] = await medmkp.createCartBuildJobs([jobData])

  res.status(202).json({ job: serialize(job) })
}
