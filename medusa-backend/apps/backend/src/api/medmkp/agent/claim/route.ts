import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"
import { decryptSecret } from "../../../../utils/secret-vault"

// Shared-secret gate for the NUC buying-agent runner. This endpoint hands out
// decrypted supplier credentials, so it is NOT customer-authed — only the
// runner, holding CART_AGENT_TOKEN, may call it.
function authorizeRunner(req: MedusaRequest): boolean {
  const expected = process.env.CART_AGENT_TOKEN
  if (!expected) return false
  const header = req.headers["authorization"] || ""
  const token = header.replace(/^Bearer\s+/i, "")
  return token.length > 0 && token === expected
}

// Reap jobs a crashed runner left "running" longer than this so they re-queue.
const STALE_RUNNING_MS = 10 * 60 * 1000

// Atomically claim the oldest queued job (or a stale running one) and return it
// with the decrypted login for the runner to drive a browser session.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!authorizeRunner(req)) {
    res.status(401).json({ error: "Unauthorized." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)

  const queued = await medmkp.listCartBuildJobs(
    { status: "queued" },
    { order: { created_at: "ASC" }, take: 1 }
  )
  let job = queued[0]

  if (!job) {
    // Recover a job stuck in "running" past the stale window.
    const running = await medmkp.listCartBuildJobs(
      { status: "running" },
      { order: { claimed_at: "ASC" }, take: 1 }
    )
    const candidate = running[0]
    if (
      candidate?.claimed_at &&
      Date.now() - new Date(candidate.claimed_at).getTime() > STALE_RUNNING_MS
    ) {
      job = candidate
    }
  }

  if (!job) {
    res.json({ job: null })
    return
  }

  await medmkp.updateCartBuildJobs({
    id: job.id,
    status: "running",
    claimed_at: new Date(),
  })

  const [credential] = await medmkp.listSupplierCredentials({
    practice_id: job.practice_id,
    supplier_id: job.supplier_id,
  })
  if (!credential) {
    await medmkp.updateCartBuildJobs({
      id: job.id,
      status: "needs_auth",
      error: "No stored credential for this supplier.",
      finished_at: new Date(),
    })
    res.json({ job: null })
    return
  }

  let password = ""
  try {
    password = decryptSecret(credential.password_encrypted)
  } catch {
    await medmkp.updateCartBuildJobs({
      id: job.id,
      status: "failed",
      error: "Stored credential could not be decrypted (key rotation?).",
      finished_at: new Date(),
    })
    res.json({ job: null })
    return
  }

  res.json({
    job: {
      id: job.id,
      supplier_slug: job.supplier_slug,
      lines: job.lines,
      credential: { username: credential.username, password },
    },
  })
}
