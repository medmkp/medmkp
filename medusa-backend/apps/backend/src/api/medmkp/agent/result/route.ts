import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

function authorizeRunner(req: MedusaRequest): boolean {
  const expected = process.env.CART_AGENT_TOKEN
  if (!expected) return false
  const header = req.headers["authorization"] || ""
  const token = header.replace(/^Bearer\s+/i, "")
  return token.length > 0 && token === expected
}

type ResultBody = {
  job_id?: string
  status?: "done" | "failed" | "needs_auth"
  cart_url?: string
  error?: string
  results?: {
    productUrl: string
    status: "added" | "out_of_stock" | "not_found" | "failed"
    note?: string
  }[]
  // Login outcome, written back onto the stored credential so the UI can warn
  // the buyer when their saved password has gone stale.
  credential_status?: "ok" | "auth_failed" | "error"
}

// The NUC runner posts the outcome of a cart-build job here.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!authorizeRunner(req)) {
    res.status(401).json({ error: "Unauthorized." })
    return
  }

  const body = (req.body ?? {}) as ResultBody
  const jobId = (body.job_id ?? "").trim()
  if (!jobId) {
    res.status(400).json({ error: "job_id is required." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [job] = await medmkp.listCartBuildJobs({ id: jobId })
  if (!job) {
    res.status(404).json({ error: "Unknown job." })
    return
  }

  const status = body.status === "failed" || body.status === "needs_auth" ? body.status : "done"
  await medmkp.updateCartBuildJobs({
    id: jobId,
    status,
    results: Array.isArray(body.results) ? body.results : null,
    cart_url: body.cart_url ?? null,
    error: body.error ?? null,
    finished_at: new Date(),
  })

  // Reflect the login result onto the credential record.
  if (body.credential_status) {
    const [credential] = await medmkp.listSupplierCredentials({
      practice_id: job.practice_id,
      supplier_id: job.supplier_id,
    })
    if (credential) {
      await medmkp.updateSupplierCredentials({
        id: credential.id,
        last_status: body.credential_status,
        last_verified_at: body.credential_status === "ok" ? new Date() : credential.last_verified_at,
        last_error: body.credential_status === "ok" ? null : body.error ?? null,
      })
    }
  }

  res.json({ ok: true })
}
