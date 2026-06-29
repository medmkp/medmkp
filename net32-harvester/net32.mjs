// Net32 browser driver. A single long-lived headful Chromium (run under xvfb on
// the NUC) clears Cloudflare's "Just a moment" JS challenge once, then drives
// Net32's internal JSON API. Plain fetch/curl 403s even from a US IP and even
// with the harvested cf_clearance cookie (Cloudflare binds clearance to the
// browser's TLS fingerprint), so the only reliable client is the browser itself
// via in-page fetch. See net32-ingestion-mechanism memory.
import { chromium } from "playwright"

const UA =
  process.env.NET32_UA ||
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const PROFILE_DIR = process.env.NET32_PROFILE_DIR || "/tmp/net32-profile"
const POSTAL = process.env.NET32_POSTAL_CODE || "27513"
const SEARCH_BASE = "https://www.net32.com/search"
const BEST_PRICE_BATCH = 12

let ctxPromise = null

async function getContext() {
  if (!ctxPromise) {
    ctxPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      userAgent: UA,
      viewport: { width: 1366, height: 850 },
      locale: "en-US",
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    })
  }
  return ctxPromise
}

async function getPage() {
  const ctx = await getContext()
  const pages = ctx.pages()
  return pages.length ? pages[0] : await ctx.newPage()
}

function isChallenge(title) {
  return /just a moment|attention required|checking your browser/i.test(title || "")
}

async function waitCleared(page) {
  for (let i = 0; i < 25; i++) {
    const title = await page.title().catch(() => "")
    if (!isChallenge(title)) return true
    await page.waitForTimeout(1500)
  }
  return false
}

// Serialize searches: one shared page can't navigate concurrently, and serial
// access is also the polite cadence against Net32.
let chain = Promise.resolve()
export function search(query, opts = {}) {
  const run = () => doSearch(query, opts)
  chain = chain.then(run, run)
  return chain
}

async function doSearch(query, { max = 10, postal = POSTAL } = {}) {
  const page = await getPage()
  // Net32 filters on the `query` param; a bare `q` returns the full catalog.
  const url = `${SEARCH_BASE}?query=${encodeURIComponent(query)}`
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })

  if (!(await waitCleared(page))) {
    return { query, blocked: true, products: [], bestPriceMap: {} }
  }
  // Wait for the results to render, not for network idle: Net32's page keeps
  // trackers chattering so it never truly idles (a fixed networkidle wait sinks
  // ~20s). Resolve as soon as the JSON-LD ItemList or product links appear.
  await page
    .waitForFunction(
      () => {
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => {
          try {
            return JSON.parse(s.textContent)?.["@type"] === "ItemList"
          } catch {
            return false
          }
        })
        return ld || document.querySelectorAll('a[href*="-d-"]').length > 0
      },
      { timeout: 12000 }
    )
    .catch(() => {})

  // Enumerate the filtered, ranked results from the page's JSON-LD ItemList
  // (name + url + image per hit), which is precise. Fall back to scraping
  // product links (/ec/<slug>-d-<mpId>) if the ItemList isn't present. mpId is
  // embedded in the URL either way.
  const products = await page.evaluate((maxResults) => {
    const re = /-d-(\d+)(?:[/?#]|$)/
    const seen = new Set()
    const out = []

    const itemList = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => {
        try {
          return JSON.parse(s.textContent)
        } catch {
          return null
        }
      })
      .find((j) => j && j["@type"] === "ItemList")

    if (itemList && Array.isArray(itemList.itemListElement)) {
      for (const el of itemList.itemListElement) {
        const m = (el.url || "").match(re)
        if (!m) continue
        const mpId = Number(m[1])
        if (!mpId || seen.has(mpId)) continue
        seen.add(mpId)
        out.push({
          mpId,
          url: String(el.url).split("#")[0],
          name: el.name || "",
          image: typeof el.image === "string" ? el.image : "",
        })
        if (out.length >= maxResults) break
      }
    }
    if (out.length) return out

    for (const a of document.querySelectorAll('a[href*="-d-"]')) {
      const href = a.getAttribute("href") || ""
      const m = href.match(re)
      if (!m) continue
      const mpId = Number(m[1])
      if (!mpId || seen.has(mpId)) continue
      seen.add(mpId)
      out.push({
        mpId,
        url: new URL(href, location.origin).href.split("#")[0],
        name: "",
        image: "",
      })
      if (out.length >= maxResults) break
    }
    return out
  }, max)

  const mpIds = products.map((p) => p.mpId)
  const bestPriceMap = await fetchBestPrices(page, mpIds, postal)

  return { query, blocked: false, products, bestPriceMap }
}

// Drive Net32's price API for a set of mpIds from the already-cleared page,
// batched (the endpoint only answers a handful of ids per call). Shared by
// search() (to price its hits) and prices() (to refresh known products).
async function fetchBestPrices(page, mpIds, postal) {
  const ids = [...new Set(mpIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
  const bestPriceMap = {}
  for (let i = 0; i < ids.length; i += BEST_PRICE_BATCH) {
    const chunk = ids.slice(i, i + BEST_PRICE_BATCH)
    const map = await page.evaluate(
      async ({ chunk, postal }) => {
        try {
          const r = await fetch("/rest/neo/search/getBestPrice", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              isBuyGetPage: false,
              tag: "",
              mpIds: chunk,
              postalCode: postal,
            }),
          })
          if (!r.ok) return {}
          const j = await r.json()
          return j?.bestPriceMap || {}
        } catch {
          return {}
        }
      },
      { chunk, postal }
    )
    Object.assign(bestPriceMap, map)
  }
  return bestPriceMap
}

// Refresh prices for already-known mpIds WITHOUT a search navigation. The
// expensive part of a search is the page nav + Cloudflare/render wait; the price
// API itself is a same-origin in-page fetch. So a recurring price refresh that
// reuses stored mpIds (every product URL carries its mpId) skips navigation
// entirely. Serialized through the same chain as search() so it shares the one
// cleared page.
export function prices(mpIds, opts = {}) {
  const run = () => doPrices(mpIds, opts)
  chain = chain.then(run, run)
  return chain
}

async function doPrices(mpIds, { postal = POSTAL } = {}) {
  const page = await getPage()
  // getBestPrice is same-origin; make sure the shared page is on net32.com and
  // past the challenge. After any prior search it already is; a cold page needs
  // one cheap nav to establish the cleared origin.
  if (!/net32\.com/.test(page.url())) {
    await page.goto(`${SEARCH_BASE}?query=`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    })
    if (!(await waitCleared(page))) {
      return { blocked: true, bestPriceMap: {} }
    }
  }
  const bestPriceMap = await fetchBestPrices(page, mpIds, postal)
  return { blocked: false, bestPriceMap }
}

export async function health() {
  try {
    const ctx = await getContext()
    return { ok: true, pages: ctx.pages().length }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export async function close() {
  if (ctxPromise) {
    const ctx = await ctxPromise.catch(() => null)
    if (ctx) await ctx.close().catch(() => {})
    ctxPromise = null
  }
}
