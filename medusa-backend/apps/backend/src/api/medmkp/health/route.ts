import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// Classify the database this backend is *actually* connected to, so the frontend
// DevBadge can show the real data source instead of guessing from which backend
// URL it points at (a locally-run backend often talks to the prod Render DB).
// "prod" = any remote host, "local" = localhost/127.0.0.1. The raw host/name are
// only returned off-production so the public deployed endpoint never leaks the
// DB hostname.
function describeDatabase() {
  const url = process.env.DATABASE_URL
  if (!url) return { target: "unknown" as const }
  try {
    const { hostname, pathname } = new URL(url)
    const isLocal = /^(localhost|127\.0\.0\.1|::1)$/.test(hostname)
    const target = isLocal ? ("local" as const) : ("prod" as const)
    if (process.env.NODE_ENV === "production") return { target }
    return { target, host: hostname, name: pathname.replace(/^\//, "") || null }
  } catch {
    return { target: "unknown" as const }
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({ ok: true, db: describeDatabase() })
}
