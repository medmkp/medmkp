import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../modules/medmkp"
import type MedMKPModuleService from "../../../modules/medmkp/service"

const MAX_ITEMS = 60

// POST /medmkp/cart-variants — resolve order lines to the supplier platform's
// stored variant ids (medmkp_supplier_product.external_variant_id) so the cart
// permalink builder can use the exact ingested variant instead of live-guessing
// one from the storefront. Public like the other catalog-read routes.
//
// Body:    { items: [{ product_url, sku }] }
// Returns: { variants: [{ product_url, sku, external_variant_id }] } — only rows
// that actually carry a stored variant id; callers match on sku + product_url
// (a multi-variant Shopify product shares one product_url across its variant
// rows, so sku is what disambiguates).
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { items?: unknown }
  const items = (Array.isArray(body.items) ? body.items : [])
    .slice(0, MAX_ITEMS)
    .filter((item): item is { product_url?: string; sku?: string } => Boolean(item) && typeof item === "object")

  const skus = [...new Set(items.map((item) => item.sku?.trim()).filter((sku): sku is string => Boolean(sku)))]
  if (!skus.length) {
    res.json({ variants: [] })
    return
  }

  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const rows = (await medmkp.listSupplierProducts(
    { sku: skus },
    { select: ["sku", "product_url", "external_variant_id"] }
  )) as { sku: string; product_url: string; external_variant_id: string | null }[]

  res.json({
    variants: rows
      .filter((row) => row.external_variant_id)
      .map((row) => ({
        product_url: row.product_url,
        sku: row.sku,
        external_variant_id: row.external_variant_id,
      })),
  })
}
