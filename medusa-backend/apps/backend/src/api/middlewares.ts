import { defineMiddlewares, authenticate } from "@medusajs/framework/http"

// Gate the per-buyer routes behind customer auth. Every other /medmkp/* route
// stays public, as before. authenticate() populates req.auth_context so the
// route can resolve the caller's customer (and from it, their practice).
export default defineMiddlewares({
  routes: [
    {
      matcher: "/medmkp/reorder-list",
      method: ["GET", "PUT"],
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
    // Phase 2 Locations / Inventory / Scan-Session routes. Every path in these
    // families is practice-scoped (they call requirePractice / read actor_id),
    // so gate the whole subtree — base path plus /:id, /layout, /:id/inventory,
    // /:id/lines — across all methods.
    {
      matcher: "/medmkp/locations*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/inventory*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/scan-sessions*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
    {
      matcher: "/medmkp/scan-lines*",
      middlewares: [authenticate("customer", ["bearer", "session"])],
    },
  ],
})
