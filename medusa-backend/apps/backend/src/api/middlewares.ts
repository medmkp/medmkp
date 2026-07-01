import { defineMiddlewares, authenticate } from "@medusajs/framework/http"

// Gate the per-buyer routes behind customer auth. Every other /medmkp/* route
// stays public, as before. authenticate() populates req.auth_context so the
// route can resolve the caller's customer (and from it, their practice).
export default defineMiddlewares({
  routes: [
    {
      matcher: "/medmkp/reorder-list",
      method: ["GET", "PUT"],
      // The whole list blob is PUT at once; Medusa's default JSON body limit is
      // too small for a worked list (items + saved lists + tombstones), which
      // 500s every save with "request entity too large". Give it generous room
      // (the merge also caps tombstone growth so it can't run away).
      bodyParser: { sizeLimit: "10mb" },
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/me",
      method: ["GET", "PUT"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/change-password",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/supplier-credentials",
      method: ["GET", "POST", "DELETE"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/cart-builds",
      method: ["GET", "POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    // Phase 2 Locations / Inventory / Scan routes. Every path in these families
    // is practice-scoped (they call requirePractice / read actor_id), so gate the
    // whole subtree — base path plus /:id, /layout, /:id/inventory — across all
    // methods. /medmkp/scans is the session-less scan-write endpoint.
    {
      matcher: "/medmkp/locations*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/inventory*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/scans*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    // Evidence Library document metadata routes — practice-scoped (base path plus
    // /:id), gated across all methods like the locations subtree.
    {
      matcher: "/medmkp/evidence*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    // Invoice matching + savings are the upcoming paid "Practice" tier. Gate them
    // behind customer auth so they're practice-scoped and can be entitlement-checked
    // (see assertEntitled in utils/practice.ts). The future billing webhook must NOT
    // be authed — do not widen this to /medmkp/billing*.
    {
      matcher: "/medmkp/invoices*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/savings",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    // Billing: Checkout, the Customer-Portal, and checkout/portal-return reconcile
    // are practice-scoped and must be authed. Gate each path explicitly — NOT the
    // whole /medmkp/billing* subtree — so the future unauthed Stripe webhook
    // (/medmkp/billing/webhook) stays open, as noted above.
    {
      matcher: "/medmkp/billing/checkout",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/billing/portal",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/billing/reconcile",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    // Stripe webhook: intentionally NOT authed (Stripe signs the payload; there is
    // no session). Signature verification needs the exact bytes Stripe sent, so
    // keep the raw body around — the JSON parser still fills req.body, but
    // preserveRawBody also stashes the untouched buffer on req.rawBody for
    // stripe.webhooks.constructEvent. Do NOT add an authenticate() matcher here.
    {
      matcher: "/medmkp/billing/webhook",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
  ],
})
