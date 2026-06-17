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
