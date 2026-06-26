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
  ],
})
