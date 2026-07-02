import { model } from "@medusajs/framework/utils"

const SupplierProduct = model.define("medmkp_supplier_product", {
  id: model.id({ prefix: "msp" }).primaryKey(),
  supplier_id: model.text().searchable(),
  source_catalog: model.text().searchable(),
  source_page: model.number(),
  source_section: model.text().searchable(),
  source_group_name: model.text().searchable(),
  source_variant: model.text().searchable(),
  product_url: model.text(),
  image_url: model.text(),
  sku: model.text().searchable(),
  manufacturer_sku: model.text().searchable(),
  // GTIN / UPC barcode (e.g. DC Dental's upccode). Nullable: most sources don't expose one.
  barcode: model.text().nullable(),
  // Where the barcode came from: null/"supplier" for an ingested one, "gudid"
  // when borrowed from the FDA GUDID reference via a brand+MPN join.
  barcode_source: model.text().nullable(),
  // The supplier platform's own id for this exact purchasable variant (e.g. the
  // numeric Shopify variant id). Cart deep links need it: Shopify's
  // /cart/{variant}:{qty} permalink only accepts variant ids, and resolving one
  // live per product is what forced the wrong-variant "first available" guess.
  external_variant_id: model.text().nullable(),
  brand: model.text().searchable(),
  name: model.text().searchable(),
  description: model.text().searchable(),
  category: model.text().searchable(),
  subcategory: model.text().searchable(),
  product_line: model.text().searchable(),
  pack_size: model.text(),
  unit_of_measure: model.text(),
  // Structured pack normalization (see ingestion/pack.ts). pack_quantity is the
  // total base_unit count in one purchasable SKU; null when unrecoverable.
  pack_quantity: model.number().nullable(),
  base_unit: model.text().nullable(),
  pack_basis: model.text().nullable(),
  pack_parse_source: model.text().nullable(),
  pack_parse_confidence: model.number().nullable(),
  features_text: model.text(),
  raw_text: model.text(),
})

export default SupplierProduct
