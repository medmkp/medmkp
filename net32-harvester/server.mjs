// Localhost HTTP front for the Net32 browser driver. The Medusa backend's net32
// marketplace fetcher (createNet32SidecarFetcher) calls GET /search?q=... so that
// Playwright/Chromium stays on the NUC and never ships in the Render backend.
//
// Run on the NUC under a virtual display:
//   NET32_HARVESTER_TOKEN=... xvfb-run -a node server.mjs
import http from "node:http"
import { search, prices, health, close } from "./net32.mjs"

const PORT = Number(process.env.NET32_HARVESTER_PORT || 8791)
const HOST = process.env.NET32_HARVESTER_HOST || "127.0.0.1"
const TOKEN = process.env.NET32_HARVESTER_TOKEN || ""

function authed(req) {
  if (!TOKEN) return true
  return (req.headers.authorization || "") === `Bearer ${TOKEN}`
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ""
    req.on("data", (chunk) => (data += chunk))
    req.on("end", () => resolve(data))
    req.on("error", () => resolve(""))
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${HOST}:${PORT}`)

    if (u.pathname === "/health") {
      return sendJson(res, 200, await health())
    }

    if (u.pathname === "/search") {
      if (!authed(req)) return sendJson(res, 401, { error: "unauthorized" })
      const q = u.searchParams.get("q") || ""
      const max = Number(u.searchParams.get("max") || 10)
      if (!q.trim()) return sendJson(res, 400, { error: "missing q" })
      const started = Date.now()
      const result = await search(q, { max })
      console.log(
        `[net32-harvester] q=${JSON.stringify(q)} products=${result.products.length}` +
          ` priced=${Object.keys(result.bestPriceMap).length} blocked=${result.blocked}` +
          ` ${Date.now() - started}ms`
      )
      return sendJson(res, 200, result)
    }

    // Price-only refresh: best prices for a set of known mpIds, no search nav.
    if (u.pathname === "/prices" && req.method === "POST") {
      if (!authed(req)) return sendJson(res, 401, { error: "unauthorized" })
      let payload
      try {
        payload = JSON.parse((await readBody(req)) || "{}")
      } catch {
        return sendJson(res, 400, { error: "invalid json body" })
      }
      const mpIds = Array.isArray(payload.mpIds) ? payload.mpIds : []
      if (!mpIds.length) return sendJson(res, 400, { error: "missing mpIds" })
      const started = Date.now()
      const result = await prices(mpIds, payload.postal ? { postal: payload.postal } : {})
      console.log(
        `[net32-harvester] prices mpIds=${mpIds.length}` +
          ` priced=${Object.keys(result.bestPriceMap).length} blocked=${result.blocked}` +
          ` ${Date.now() - started}ms`
      )
      return sendJson(res, 200, result)
    }

    sendJson(res, 404, { error: "not found" })
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[net32-harvester] listening on http://${HOST}:${PORT}`)
})

async function shutdown() {
  console.log("[net32-harvester] shutting down")
  server.close()
  await close()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
