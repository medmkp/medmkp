import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"
import { resolvePracticeId } from "../../../utils/practice"

// Shapes the practice row for the client, exposing only the buyer-editable
// profile fields (structured shipping address + preferences blob).
function serializePractice(row: any) {
  return {
    id: row.id,
    name: row.name,
    ship_address_line1: row.ship_address_line1 ?? "",
    ship_address_line2: row.ship_address_line2 ?? "",
    ship_city: row.ship_city ?? "",
    ship_state: row.ship_state ?? "",
    ship_zip: row.ship_zip ?? "",
    ship_country: row.ship_country ?? "",
    shipping_notes: row.shipping_notes ?? "",
    use_as_billing: Boolean(row.use_as_billing),
    preferences: row.preferences ?? null,
  }
}

// Identity + editable profile for the signed-in buyer: their name/contact (for
// the topbar/profile) and the practice they belong to (shipping address, buyer
// preferences). The frontend /api/auth/me proxies this with the session cookie.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const customer = await customerModule.retrieveCustomer(customerId).catch(() => null)

  let practice: ReturnType<typeof serializePractice> | null = null
  const practiceId = await resolvePracticeId(req)
  if (practiceId) {
    const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
    const [row] = await medmkp.listDentalPractices({ id: practiceId })
    if (row) practice = serializePractice(row)
  }

  res.json({
    customer: customer
      ? {
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone ?? "",
        }
      : null,
    practice,
  })
}

type ProfileUpdate = {
  customer?: { first_name?: string; last_name?: string; phone?: string }
  practice?: {
    name?: string
    ship_address_line1?: string
    ship_address_line2?: string
    ship_city?: string
    ship_state?: string
    ship_zip?: string
    ship_country?: string
    shipping_notes?: string
    use_as_billing?: boolean
    preferences?: Record<string, unknown>
  }
}

// Persists the buyer-editable profile: customer name/phone, plus the practice
// name, structured shipping address, and preferences blob. Email is NOT
// editable here — it's the login identity (changed via account recovery).
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }

  const body = (req.body ?? {}) as ProfileUpdate

  if (body.customer) {
    const customerModule = req.scope.resolve(Modules.CUSTOMER)
    const data: Record<string, unknown> = {}
    if (body.customer.first_name !== undefined) data.first_name = body.customer.first_name
    if (body.customer.last_name !== undefined) data.last_name = body.customer.last_name
    if (body.customer.phone !== undefined) data.phone = body.customer.phone
    if (Object.keys(data).length) {
      await customerModule.updateCustomers(customerId, data)
    }
  }

  if (body.practice) {
    const practiceId = await resolvePracticeId(req)
    if (!practiceId) {
      res.status(404).json({ error: "No practice linked to this account." })
      return
    }
    const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
    const allowed = [
      "name",
      "ship_address_line1",
      "ship_address_line2",
      "ship_city",
      "ship_state",
      "ship_zip",
      "ship_country",
      "shipping_notes",
      "use_as_billing",
      "preferences",
    ] as const
    const data: Record<string, unknown> = { id: practiceId }
    for (const key of allowed) {
      if (body.practice[key] !== undefined) data[key] = body.practice[key]
    }
    if (Object.keys(data).length > 1) {
      await medmkp.updateDentalPractices(data)
    }
  }

  res.json({ ok: true })
}
