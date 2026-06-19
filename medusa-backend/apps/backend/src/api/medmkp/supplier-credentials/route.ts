import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { resolvePracticeId } from "../../../utils/practice"
import { encryptSecret, maskHint } from "../../../utils/secret-vault"

// Shapes a credential row for the client. The encrypted password NEVER leaves
// the backend — only the masked username hint and last-verification status.
function serialize(row: any) {
  return {
    supplier_id: row.supplier_id,
    username_hint: row.username_hint,
    last_status: row.last_status,
    last_verified_at: row.last_verified_at ?? null,
    last_error: row.last_error ?? null,
  }
}

// Lists which suppliers the signed-in practice has stored a login for (masked).
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.json({ credentials: [] })
    return
  }
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const rows = await medmkp.listSupplierCredentials({ practice_id: practiceId })
  res.json({ credentials: rows.map(serialize) })
}

type SaveBody = { supplier_id?: string; username?: string; password?: string }

// Upserts the practice's login for one supplier. Password is sealed at rest;
// re-saving without a password updates only the username.
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

  const body = (req.body ?? {}) as SaveBody
  const supplierId = (body.supplier_id ?? "").trim()
  const username = (body.username ?? "").trim()
  if (!supplierId || !username) {
    res.status(400).json({ error: "supplier_id and username are required." })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [existing] = await medmkp.listSupplierCredentials({
    practice_id: practiceId,
    supplier_id: supplierId,
  })

  // A password is required for a brand-new credential, optional on edit (lets a
  // buyer fix a typo'd username without re-typing the password).
  const password = body.password ?? ""
  if (!existing && !password) {
    res.status(400).json({ error: "Password is required for a new login." })
    return
  }

  const data: Record<string, unknown> = {
    practice_id: practiceId,
    supplier_id: supplierId,
    username,
    username_hint: maskHint(username),
  }
  if (password) {
    data.password_encrypted = encryptSecret(password)
    // Re-saving the password invalidates the prior verification.
    data.last_status = "unverified"
    data.last_verified_at = null
    data.last_error = null
  }

  if (existing) {
    await medmkp.updateSupplierCredentials({ id: existing.id, ...data })
  } else {
    await medmkp.createSupplierCredentials(data)
  }

  res.json({ ok: true })
}

type DeleteBody = { supplier_id?: string }

// Removes a stored login.
export async function DELETE(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!req.auth_context?.actor_id) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }
  const practiceId = await resolvePracticeId(req)
  if (!practiceId) {
    res.status(404).json({ error: "No practice linked to this account." })
    return
  }
  const supplierId = ((req.body ?? {}) as DeleteBody).supplier_id?.trim()
  if (!supplierId) {
    res.status(400).json({ error: "supplier_id is required." })
    return
  }
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [existing] = await medmkp.listSupplierCredentials({
    practice_id: practiceId,
    supplier_id: supplierId,
  })
  if (existing) await medmkp.deleteSupplierCredentials(existing.id)
  res.json({ ok: true })
}
