import { readdirSync, readFileSync } from "fs"
import { resolve } from "path"
import { shopifyExtractProduct, shopifyExtractProducts } from "./shopify"
import type { ProductPageCandidate, SupplierProductAdapter } from "../types"

/**
 * Config-driven Shopify supplier routing.
 *
 * Onboarding a Shopify vendor is dropping a config object into a
 * `data/supplier-vetting/<slug>-catalog-sources.json` array — no edit to this
 * file or to `adapters/index.ts`. The vetting JSON is a backward-compatible
 * superset: an entry opts into config-driven Shopify routing by setting
 * `platform: "shopify"`; entries without it are ignored here (legacy behavior).
 *
 * This module owns only *routing* (which candidates the Shopify adapter claims).
 * Extraction still runs through the shared products.json/HTML paths unchanged.
 */
export type ShopifyIngestionConfig = {
  supplier_id: string
  supplier_name?: string
  /** Canonical storefront origin, e.g. "https://amerdental.com". */
  origin: string
  /** Extra storefront origins that route to the same store (e.g. a 301 alias). */
  origin_aliases?: string[]
  /**
   * Substrings matched (case-insensitively) against `candidate.distributor`, so
   * candidates discovered under a different URL still route here. Preserves the
   * distributor clause of the old hardcoded `matches()` allowlist.
   */
  distributor_aliases?: string[]
}

const CONFIG_SUFFIX = "-catalog-sources.json"

function vettingDir(): string {
  // …/src/ingestion/supplier-pipeline/adapters -> …/data/supplier-vetting
  return resolve(__dirname, "../../../../data/supplier-vetting")
}

function hostOf(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return undefined
  }
}

/**
 * Validate a `platform: "shopify"` entry fail-closed: a malformed config throws
 * at load rather than silently dropping the vendor to the generic adapter.
 */
function validateConfig(
  entry: Record<string, unknown>,
  file: string
): ShopifyIngestionConfig {
  const where = `${file} (${String(entry.supplier_id ?? entry.slug ?? "unknown")})`

  const supplier_id = entry.supplier_id
  if (typeof supplier_id !== "string" || !supplier_id.trim()) {
    throw new Error(`Shopify config ${where}: missing "supplier_id"`)
  }

  const origin = entry.origin
  if (typeof origin !== "string" || !hostOf(origin)) {
    throw new Error(`Shopify config ${where}: "origin" must be an absolute URL`)
  }

  const origin_aliases = entry.origin_aliases
  if (origin_aliases !== undefined) {
    if (
      !Array.isArray(origin_aliases) ||
      origin_aliases.some((a) => typeof a !== "string" || !hostOf(a))
    ) {
      throw new Error(
        `Shopify config ${where}: "origin_aliases" must be an array of absolute URLs`
      )
    }
  }

  const distributor_aliases = entry.distributor_aliases
  if (distributor_aliases !== undefined) {
    if (
      !Array.isArray(distributor_aliases) ||
      distributor_aliases.some((a) => typeof a !== "string" || !a.trim())
    ) {
      throw new Error(
        `Shopify config ${where}: "distributor_aliases" must be an array of non-empty strings`
      )
    }
  }

  return {
    supplier_id,
    supplier_name:
      typeof entry.supplier_name === "string" ? entry.supplier_name : undefined,
    origin,
    origin_aliases: origin_aliases as string[] | undefined,
    distributor_aliases: distributor_aliases as string[] | undefined,
  }
}

/**
 * Glob `data/supplier-vetting/*-catalog-sources.json`, keep entries flagged
 * `platform: "shopify"`, and validate each fail-closed.
 */
export function loadShopifyConfigs(dir: string = vettingDir()): ShopifyIngestionConfig[] {
  const configs: ShopifyIngestionConfig[] = []

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(CONFIG_SUFFIX)) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(resolve(dir, file), "utf8"))
    } catch (error) {
      throw new Error(`Shopify config ${file}: invalid JSON (${(error as Error).message})`)
    }

    if (!Array.isArray(parsed)) {
      continue
    }

    for (const entry of parsed) {
      if (entry && typeof entry === "object" && (entry as Record<string, unknown>).platform === "shopify") {
        configs.push(validateConfig(entry as Record<string, unknown>, file))
      }
    }
  }

  return configs
}

function matchesConfig(
  candidate: ProductPageCandidate,
  domains: string[],
  aliases: string[]
): boolean {
  const host = hostOf(candidate.url)
  if (host && domains.some((domain) => host === domain || host.endsWith("." + domain))) {
    return true
  }

  const distributor = (candidate.distributor ?? "").toLowerCase()
  return aliases.some((alias) => distributor.includes(alias))
}

/**
 * Build the single Shopify adapter from configs. `matches()` routes off origin
 * host OR distributor alias; extraction delegates to the shared Shopify path.
 * Keeping `id: "shopify"` preserves the downstream products.json gate in
 * `extractShopifyCatalogProducts`.
 */
export function makeShopifyRouter(configs: ShopifyIngestionConfig[]): SupplierProductAdapter {
  const domains = new Set<string>()
  const aliases: string[] = []

  for (const config of configs) {
    const origin = hostOf(config.origin)
    if (origin) {
      domains.add(origin)
    }
    for (const alias of config.origin_aliases ?? []) {
      const host = hostOf(alias)
      if (host) {
        domains.add(host)
      }
    }
    for (const alias of config.distributor_aliases ?? []) {
      aliases.push(alias.toLowerCase())
    }
  }

  const domainList = [...domains]

  return {
    id: "shopify",
    matches: (candidate) => matchesConfig(candidate, domainList, aliases),
    extractProduct: shopifyExtractProduct,
    extractProducts: shopifyExtractProducts,
  }
}
