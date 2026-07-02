import { boundedId } from "../supplier-catalog"
import { parsePack, unitPriceCents } from "../pack"
import { cleanProductName, isJunkProductName } from "../supplier-pipeline/html"
import type { MarketplaceCatalogRow } from "./search"

type SourceType = "website" | "pdf" | "csv" | "manual" | "api" | "email" | "agent"

export type MarketplaceIngestionInput = {
  supplier_id: string
  source_catalog: string
  source_url?: string
  source_type?: SourceType
  captured_at?: string
  rows: MarketplaceCatalogRow[]
}

/**
 * Turn marketplace rows into the records the medmkp module persists. Two things
 * differ from the crawl-based supplier ingestion (buildSupplierCatalogIngestion):
 *
 *  1. The canonical match is known by construction, so we attach it directly.
 *  2. The same listing can surface for several canonical products, so the
 *     supplier_product is de-duplicated by SKU while still emitting one
 *     canonical match per (canonical, listing) pair.
 */
export function buildMarketplaceIngestion(input: MarketplaceIngestionInput) {
  const capturedAt = input.captured_at ?? new Date().toISOString()
  const sourceId = boundedId("mscs", [input.supplier_id, input.source_catalog], 96)

  const source = {
    id: sourceId,
    supplier_id: input.supplier_id,
    source_type: input.source_type ?? ("api" as const),
    source_catalog: input.source_catalog,
    source_url: input.source_url ?? "",
    auth_required: false,
    refresh_frequency: "manual" as const,
    last_crawled_at: capturedAt,
    status: "active" as const,
    notes: `Marketplace search ingestion: ${input.rows.length} canonical-sourced listings.`,
  }

  const supplierProducts: unknown[] = []
  const canonicalProductMatches: unknown[] = []
  const priceSnapshots: unknown[] = []

  const seenProductIds = new Set<string>()
  const seenMatchIds = new Set<string>()

  input.rows.forEach((row) => {
    if (!row.sku) {
      return
    }
    const supplierProductId = boundedId(
      "msp",
      [input.supplier_id, input.source_catalog, row.sku],
      96
    )
    const name = cleanProductName(row.name?.trim() || row.sku)
    // Skip scraper artifacts (e.g. Amazon's "Debug info copied." ×264) before
    // they become a supplier product / canonical match. See #606.
    if (isJunkProductName(name)) {
      return
    }
    const category = row.category?.trim() || "Dental supplies"
    const pack = parsePack(row.pack_size, name, category)

    // One supplier_product per distinct listing, even if several canonical
    // products matched it.
    if (!seenProductIds.has(supplierProductId)) {
      seenProductIds.add(supplierProductId)

      supplierProducts.push({
        id: supplierProductId,
        supplier_id: input.supplier_id,
        source_catalog: input.source_catalog,
        source_page: 0,
        source_section: "",
        source_group_name: "",
        source_variant: "",
        product_url: row.product_url ?? "",
        image_url: row.image_url ?? "",
        sku: row.sku,
        manufacturer_sku: row.manufacturer_sku ?? "",
        brand: row.brand ?? "",
        name,
        description: row.description?.trim() || name,
        category,
        subcategory: row.subcategory ?? "",
        product_line: row.product_line ?? "",
        pack_size: row.pack_size ?? "",
        unit_of_measure: row.unit_of_measure ?? "",
        pack_quantity: pack.pack_quantity,
        base_unit: pack.pack_quantity !== null ? pack.base_unit : null,
        pack_basis: pack.pack_quantity !== null ? pack.basis : null,
        pack_parse_source: pack.source,
        pack_parse_confidence:
          pack.pack_quantity !== null ? Math.round(pack.confidence * 100) : null,
        features_text: row.brand ?? "",
        raw_text: JSON.stringify(row.raw ?? row),
      })

      if (typeof row.price_cents === "number" && row.price_cents >= 0) {
        priceSnapshots.push({
          id: boundedId(
            "msps",
            [input.supplier_id, input.source_catalog, row.sku, capturedAt],
            96
          ),
          supplier_product_id: supplierProductId,
          supplier_id: input.supplier_id,
          price_cents: row.price_cents,
          price_basis: row.price_basis ?? "unknown",
          unit_price_cents: unitPriceCents(row.price_cents, pack.pack_quantity),
          min_quantity: row.min_quantity ?? 1,
          availability: row.availability ?? "unknown",
          captured_at: capturedAt,
          source_url: row.product_url ?? input.source_url ?? "",
          confidence_score: row.product_url ? 80 : 60,
        })
      }
    }

    // One canonical match per (canonical product, listing).
    const matchId = boundedId(
      "mcpm",
      [input.supplier_id, input.source_catalog, row.sku, row.canonical_product_id],
      96
    )
    if (!seenMatchIds.has(matchId)) {
      seenMatchIds.add(matchId)
      canonicalProductMatches.push({
        id: matchId,
        canonical_product_id: row.canonical_product_id,
        supplier_product_id: supplierProductId,
        supplier_id: input.supplier_id,
        match_status: row.canonical_match_status,
        confidence_score: row.canonical_match_confidence,
        match_reason: row.canonical_match_reason,
        extracted_attributes_text: JSON.stringify({
          sku: row.sku,
          brand: row.brand ?? "",
          category,
          product_url: row.product_url ?? "",
        }),
      })
    }
  })

  return {
    source,
    supplierProducts,
    canonicalProductMatches,
    priceSnapshots,
  }
}
