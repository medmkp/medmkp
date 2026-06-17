import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"

// When a customer requests a password reset, Medusa emits `auth.password_reset`
// with a single-use token. We turn that token into a link to the web app's
// reset page.
//
// Dev: the link is logged so the flow can be completed without an email provider.
// Prod: this is the seam to send a real email — resolve the Notification module
// and deliver the link to `entity_id` (the customer's email) instead of logging.
export default async function authPasswordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<{ entity_id: string; token: string; actor_type?: string }>) {
  const { entity_id: email, token, actor_type } = data

  // Only handle storefront (customer) resets here.
  if (actor_type && actor_type !== "customer") {
    return
  }

  const frontendUrl = (process.env.MEDMKP_FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "")
  const resetUrl = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(`[password-reset] Reset link for ${email}: ${resetUrl}`)

  // --- Email-provider seam --------------------------------------------------
  // Once a notification provider (Resend, SendGrid, SES, ...) is configured,
  // send the link instead of only logging it, e.g.:
  //
  //   import { Modules } from "@medusajs/framework/utils"
  //   const notification = container.resolve(Modules.NOTIFICATION)
  //   await notification.createNotifications({
  //     to: email,
  //     channel: "email",
  //     template: "password-reset",
  //     data: { reset_url: resetUrl },
  //   })
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
