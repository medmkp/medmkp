import {
  applyScraperTemplate,
  createMarketplaceFetcher,
  detectAntiBot,
  resolveScraperTemplate,
} from "../fetch"

describe("resolveScraperTemplate", () => {
  it("prefers the provider-specific template over the shared one", () => {
    expect(
      resolveScraperTemplate("alibaba", {
        MARKETPLACE_SCRAPER_URL: "https://shared/?url={url}",
        MARKETPLACE_SCRAPER_URL_ALIBABA: "https://stealth/?url={url}",
      } as NodeJS.ProcessEnv)
    ).toBe("https://stealth/?url={url}")
  })

  it("falls back to the shared template when no provider var is set", () => {
    expect(
      resolveScraperTemplate("amazon", {
        MARKETPLACE_SCRAPER_URL: "https://shared/?url={url}",
      } as NodeJS.ProcessEnv)
    ).toBe("https://shared/?url={url}")
  })

  it("returns empty string when nothing is configured", () => {
    expect(resolveScraperTemplate("amazon", {} as NodeJS.ProcessEnv)).toBe("")
  })
})

describe("detectAntiBot", () => {
  it("flags a captcha interstitial", () => {
    expect(
      detectAntiBot("<html><head><title>Captcha Interception</title></head></html>")
    ).toBe(true)
  })

  it("does not flag a normal product page", () => {
    expect(
      detectAntiBot(
        "<html><head><title>Dental Composite Resin Kit</title></head><body>Buy now</body></html>"
      )
    ).toBe(false)
  })
})

describe("applyScraperTemplate", () => {
  it("substitutes the {url} placeholder with the encoded target", () => {
    expect(
      applyScraperTemplate(
        "https://api.scraperapi.com/?api_key=KEY&render=true&url={url}",
        "https://www.alibaba.com/trade/search?SearchText=a b"
      )
    ).toBe(
      "https://api.scraperapi.com/?api_key=KEY&render=true&url=https%3A%2F%2Fwww.alibaba.com%2Ftrade%2Fsearch%3FSearchText%3Da%20b"
    )
  })

  it("appends the encoded target when no placeholder is present", () => {
    expect(applyScraperTemplate("https://proxy/?url=", "https://x.com/y")).toBe(
      "https://proxy/?url=https%3A%2F%2Fx.com%2Fy"
    )
  })
})

describe("createMarketplaceFetcher", () => {
  const originalFetch = global.fetch
  afterEach(() => {
    global.fetch = originalFetch
  })

  it("marks anti-bot responses as blocked", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://www.alibaba.com/trade/search?SearchText=x",
      text: async () => "<title>Captcha Interception</title>",
    })) as unknown as typeof fetch

    const fetcher = createMarketplaceFetcher()
    const result = await fetcher("https://www.alibaba.com/trade/search?SearchText=x")

    expect(result.ok).toBe(true)
    expect(result.blocked).toBe(true)
  })

  it("routes through the scraper template when configured", async () => {
    const spy = jest.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://proxy",
      text: async () => "<title>ok</title>",
    }))
    global.fetch = spy as unknown as typeof fetch

    const fetcher = createMarketplaceFetcher({
      scraperUrlTemplate: "https://proxy/?url={url}",
    })
    const result = await fetcher("https://www.amazon.com/s?k=dental")

    expect(result.blocked).toBe(false)
    expect(spy).toHaveBeenCalledWith(
      "https://proxy/?url=https%3A%2F%2Fwww.amazon.com%2Fs%3Fk%3Ddental",
      expect.anything()
    )
  })
})
