import type {
  MarketplaceFetchOptions,
  MarketplaceFetchResult,
  MarketplaceFetcher,
} from "./types"

const DEFAULT_TIMEOUT_MS = 20000

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

// Marketplaces (Alibaba especially) answer bot traffic with a captcha/"slider"
// interstitial that still returns HTTP 200. Treat those as a fetch failure so we
// never persist an interstitial as if it were a product page.
const ANTI_BOT_PATTERNS: RegExp[] = [
  /captcha/i,
  /punish/i,
  /x5sec/i,
  /baxia/i,
  /sufei/i,
  /nc_iconfont/i,
  /slidetounlock/i,
  /are you a human/i,
  /verify (?:you are|your identity)/i,
  /unusual traffic/i,
  /access denied/i,
  /to discuss automated access/i,
]

export function detectAntiBot(html: string): boolean {
  if (!html.trim()) {
    return false
  }

  // Match against the <title> and a bounded head slice so a product whose
  // description happens to contain "captcha" doesn't trip the detector.
  const head = html.slice(0, 4000)
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""

  return ANTI_BOT_PATTERNS.some(
    (pattern) => pattern.test(title) || pattern.test(head)
  )
}

/**
 * Substitute the encoded target URL into a scraper/proxy template. The template
 * must contain a literal "{url}" placeholder, e.g.
 *   https://api.scraperapi.com/?api_key=KEY&render=true&url={url}
 * Anything without the placeholder is treated as a prefix the target is appended
 * to (encoded), which covers the common "?url=" proxy style.
 */
export function applyScraperTemplate(template: string, target: string): string {
  const encoded = encodeURIComponent(target)

  if (template.includes("{url}")) {
    return template.replace("{url}", encoded)
  }

  return `${template}${encoded}`
}

/**
 * Pick the scraper template for a provider. Amazon search pages are static HTML
 * (cheap, no JS render) while Alibaba needs a stealth/JS-rendering proxy to clear
 * its captcha — and the DAG runs both off one env file. A provider-specific
 * MARKETPLACE_SCRAPER_URL_<PROVIDER> (e.g. MARKETPLACE_SCRAPER_URL_ALIBABA) wins;
 * otherwise we fall back to the shared MARKETPLACE_SCRAPER_URL.
 */
export function resolveScraperTemplate(
  providerId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const key = `MARKETPLACE_SCRAPER_URL_${providerId.toUpperCase()}`
  const perProvider = env[key]?.trim()
  return perProvider || env.MARKETPLACE_SCRAPER_URL?.trim() || ""
}

export type CreateFetcherOptions = {
  /**
   * Scraper/proxy URL template (see applyScraperTemplate). Defaults to the
   * MARKETPLACE_SCRAPER_URL env var. When unset, requests go out directly — fine
   * for unblocked sources, but Alibaba/Amazon will return anti-bot pages.
   */
  scraperUrlTemplate?: string
  defaultTimeoutMs?: number
}

export function createMarketplaceFetcher(
  options: CreateFetcherOptions = {}
): MarketplaceFetcher {
  const scraperUrlTemplate =
    options.scraperUrlTemplate ?? process.env.MARKETPLACE_SCRAPER_URL ?? ""
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS

  return async function fetchMarketplaceUrl(
    url: string,
    fetchOptions: MarketplaceFetchOptions = {}
  ): Promise<MarketplaceFetchResult> {
    const target = scraperUrlTemplate
      ? applyScraperTemplate(scraperUrlTemplate, url)
      : url
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      fetchOptions.timeoutMs ?? defaultTimeoutMs
    )

    try {
      const response = await fetch(target, {
        headers: { ...BROWSER_HEADERS, ...fetchOptions.headers },
        redirect: "follow",
        signal: controller.signal,
      })
      const body = await response.text()

      return {
        url,
        final_url: response.url || url,
        status: response.status,
        ok: response.ok,
        body,
        blocked: detectAntiBot(body),
      }
    } catch (error) {
      return {
        url,
        final_url: url,
        status: 0,
        ok: false,
        body: "",
        blocked: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
