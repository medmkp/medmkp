import { createHash } from "crypto"
import { parsePack, unitPriceCents } from "./pack"
import { cleanProductName, isJunkProductName } from "./supplier-pipeline/html"

type SourceType = "website" | "pdf" | "csv" | "manual" | "api" | "email" | "agent"
type RefreshFrequency = "weekly" | "monthly" | "quarterly" | "manual"
type PriceBasis = "each" | "box" | "case" | "pack" | "unknown"
type Availability = "in_stock" | "limited" | "backordered" | "unknown"

export type CanonicalProductCandidate = {
  id: string
  name: string
  category: string
  attributes_text?: string
}

export type SupplierCatalogRow = {
  sku?: string
  manufacturer_sku?: string
  barcode?: string
  brand?: string
  name?: string
  description?: string
  category?: string
  subcategory?: string
  product_line?: string
  product_url?: string
  image_url?: string
  pack_size?: string
  unit_of_measure?: string
  price_cents?: number
  price_basis?: PriceBasis
  availability?: Availability
  min_quantity?: number
  raw?: unknown
}

export type SupplierCatalogIngestionInput = {
  supplier_id: string
  source_type: SourceType
  source_url?: string
  source_catalog: string
  source_section?: string
  auth_required?: boolean
  refresh_frequency?: RefreshFrequency
  captured_at?: string
  rows: SupplierCatalogRow[]
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function compact(parts: unknown[]) {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ")
}

export function boundedId(prefix: string, parts: string[], maxLength = 96) {
  const base = slug(parts.filter(Boolean).join("_")) || "unknown"
  const full = `${prefix}_${base}`

  if (full.length <= maxLength) {
    return full
  }

  const hash = createHash("sha1")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 10)
  const suffix = `_${hash}`

  return `${full.slice(0, maxLength - suffix.length)}${suffix}`
}

function normalizePriceBasis(value?: PriceBasis): PriceBasis {
  return value ?? "unknown"
}

function normalizeAvailability(value?: Availability): Availability {
  return value ?? "unknown"
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : []
}

// The platform's own id for the exact purchasable variant, when the adapter
// captured one (Shopify adapters stash the numeric variant id in raw). Cart
// permalinks are built from this stored id, so it must survive as a real
// column instead of staying buried in raw_text.
function externalVariantId(row: SupplierCatalogRow) {
  const raw = row.raw && typeof row.raw === "object"
    ? row.raw as Record<string, unknown>
    : undefined
  const id = raw?.variant_id
  if (typeof id === "number" && Number.isFinite(id)) return String(id)
  if (typeof id === "string" && id.trim()) return id.trim()
  return null
}

function firstImageUrl(row: SupplierCatalogRow) {
  if (row.image_url?.trim()) {
    return row.image_url.trim()
  }

  const raw = row.raw && typeof row.raw === "object"
    ? row.raw as Record<string, unknown>
    : undefined

  return stringArray(raw?.image_urls)[0] ?? ""
}

export function buildSupplierCatalogIngestion(
  input: SupplierCatalogIngestionInput,
  canonicalProducts: CanonicalProductCandidate[]
) {
  const capturedAt = input.captured_at ?? new Date().toISOString()
  const sourceId = boundedId("mscs", [input.supplier_id, input.source_catalog], 96)

  const source = {
    id: sourceId,
    supplier_id: input.supplier_id,
    source_type: input.source_type,
    source_catalog: input.source_catalog,
    source_url: input.source_url ?? "",
    auth_required: input.auth_required ?? false,
    refresh_frequency: input.refresh_frequency ?? "manual",
    last_crawled_at: capturedAt,
    status: "active" as const,
    notes: `Imported ${input.rows.length} catalog rows into cached supplier products.`,
  }

  const supplierProducts: unknown[] = []
  const canonicalProductMatches: unknown[] = []
  const priceSnapshots: unknown[] = []

  const rowSku = (row: SupplierCatalogRow, index: number) =>
    row.sku?.trim() || row.manufacturer_sku?.trim() || `NO-SKU-${index + 1}`

  // The ids below slugify the SKU, so distinct SKUs can collide on the primary
  // key (e.g. "809-151" vs "809-151+" both slug to "..._809_151"). Pre-compute
  // which id-slugs are claimed by more than one distinct SKU; only those SKUs get
  // a deterministic disambiguating suffix, so every other SKU keeps its stable id
  // and re-ingestion stays idempotent.
  const idSlugOf = (sku: string) => slug([input.supplier_id, input.source_catalog, sku].join("_"))
  const skusByIdSlug = new Map<string, Set<string>>()
  const seenForSlug = new Set<string>()
  input.rows.forEach((row, index) => {
    const sku = rowSku(row, index)
    if (seenForSlug.has(sku)) return
    seenForSlug.add(sku)
    const idSlug = idSlugOf(sku)
    if (!skusByIdSlug.has(idSlug)) skusByIdSlug.set(idSlug, new Set())
    skusByIdSlug.get(idSlug)!.add(sku)
  })
  const idKey = (sku: string) => {
    const base = [input.supplier_id, input.source_catalog, sku]
    if ((skusByIdSlug.get(idSlugOf(sku))?.size ?? 0) > 1) {
      base.push(createHash("sha1").update(sku).digest("hex").slice(0, 8))
    }
    return base
  }

  const seenSkus = new Set<string>()
  input.rows.forEach((row, index) => {
    const sku = rowSku(row, index)
    // Collapse a SKU that repeats within a single catalog (same product listed
    // on multiple pages). Combined with deriving the id only from
    // (supplier, source_catalog, sku) below — never the row position — this
    // makes re-ingestion idempotent: a reordered or re-listed catalog updates
    // existing rows in place instead of spawning duplicate supplier products.
    if (seenSkus.has(sku)) return
    seenSkus.add(sku)
    const supplierProductId = boundedId("msp", idKey(sku), 96)
    // Clean here, at the one boundary every ingestion path funnels through, so
    // weird characters (leftover HTML entities, smart punctuation, U+FFFD from
    // bad-charset pages) never reach the DB no matter which adapter produced it.
    const name = cleanProductName(row.name?.trim() || row.description?.trim() || sku)
    // Drop scraper artifacts before they land as supplier products: a name that
    // is empty/too-short, a bare unit-of-measure token ("Ea", "Box"), or a known
    // junk string ("Debug info copied.") is not a real listing. Skipping it here
    // stops the matcher from ever minting a junk canonical from it. See #606.
    if (isJunkProductName(name)) return
    const description = row.description?.trim() || name
    const category = row.category?.trim() || "Dental supplies"
    const pack = parsePack(row.pack_size, name, category)

    supplierProducts.push({
      id: supplierProductId,
      supplier_id: input.supplier_id,
      source_catalog: input.source_catalog,
      source_page: 0,
      source_section: input.source_section ?? "",
      source_group_name: row.product_line ?? "",
      source_variant: row.pack_size ?? "",
      product_url: row.product_url ?? "",
      image_url: firstImageUrl(row),
      sku,
      manufacturer_sku: row.manufacturer_sku ?? "",
      barcode: row.barcode?.trim() || null,
      external_variant_id: externalVariantId(row),
      brand: row.brand ?? "",
      name,
      description,
      category,
      subcategory: row.subcategory ?? "",
      product_line: row.product_line ?? "",
      pack_size: row.pack_size ?? "",
      unit_of_measure: row.unit_of_measure ?? "",
      pack_quantity: pack.pack_quantity,
      base_unit: pack.pack_quantity !== null ? pack.base_unit : null,
      pack_basis: pack.pack_quantity !== null ? pack.basis : null,
      pack_parse_source: pack.source,
      pack_parse_confidence: pack.pack_quantity !== null ? Math.round(pack.confidence * 100) : null,
      features_text: compact([row.brand, row.pack_size, row.unit_of_measure]),
      raw_text: JSON.stringify(row.raw ?? row),
    })

    // Ingestion writes only an UNMATCHED placeholder; the canonical match
    // engine (scripts/match-canonical-products.ts) is the single source of
    // truth for clustering. It fills these rows in place via an UPDATE gated
    // on match_status='unmatched'. Previously ingestion ran a crude name/
    // category token-overlap scorer here, which produced servable "variant"
    // matches into oversized junk clusters and, worse, re-polluted a supplier
    // every time it was re-ingested after a match run. Deferring entirely
    // removes that whole class of bug — re-ingestion can no longer clobber the
    // matcher's output.
    canonicalProductMatches.push({
      id: boundedId("mcpm", idKey(sku), 96),
      canonical_product_id: "",
      supplier_product_id: supplierProductId,
      supplier_id: input.supplier_id,
      match_status: "unmatched",
      confidence_score: 0,
      match_reason: "Deferred to canonical match job",
      extracted_attributes_text: JSON.stringify({
        sku,
        manufacturer_sku: row.manufacturer_sku ?? "",
        brand: row.brand ?? "",
        category,
        subcategory: row.subcategory ?? "",
        pack_size: row.pack_size ?? "",
        unit_of_measure: row.unit_of_measure ?? "",
      }),
    })

    if (typeof row.price_cents === "number" && row.price_cents >= 0) {
      priceSnapshots.push({
        id: boundedId("msps", [...idKey(sku), capturedAt], 96),
        supplier_product_id: supplierProductId,
        supplier_id: input.supplier_id,
        price_cents: row.price_cents,
        price_basis: normalizePriceBasis(row.price_basis),
        unit_price_cents: unitPriceCents(row.price_cents, pack.pack_quantity),
        min_quantity: row.min_quantity ?? 1,
        availability: normalizeAvailability(row.availability),
        captured_at: capturedAt,
        source_url: row.product_url ?? input.source_url ?? "",
        confidence_score: row.product_url || input.source_url ? 85 : 65,
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
