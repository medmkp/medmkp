import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

// Changes the signed-in buyer's emailpass password. The built-in
// /auth/customer/emailpass/update route only accepts a *reset* token (not a
// login token), so a logged-in "change password" has to go through the auth
// module directly: verify the current password, then update the provider.
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    res.status(401).json({ error: "Not authenticated." })
    return
  }

  const { currentPassword, newPassword } = (req.body ?? {}) as {
    currentPassword?: string
    newPassword?: string
  }
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Enter your current and new password." })
    return
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." })
    return
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER)
  const customer = await customerModule.retrieveCustomer(customerId).catch(() => null)
  const email = customer?.email
  if (!email) {
    res.status(400).json({ error: "Could not verify your account." })
    return
  }

  const authModule = req.scope.resolve(Modules.AUTH)

  // Verify the current password.
  const verify = await authModule.authenticate("emailpass", {
    body: { email, password: currentPassword },
  } as any)
  if (!verify?.success) {
    res.status(400).json({ error: "Current password is incorrect." })
    return
  }

  // Set the new password (entity_id for emailpass is the email).
  const updated = (await authModule.updateProvider("emailpass", {
    entity_id: email,
    password: newPassword,
  })) as { success?: boolean }
  if (updated && updated.success === false) {
    res.status(502).json({ error: "Could not update your password." })
    return
  }

  res.json({ ok: true })
}
