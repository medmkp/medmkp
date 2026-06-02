import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  medmkpCatalogItems,
  medmkpQuotes,
  medmkpSuppliers,
} from "../../../../seed/medmkp-fixtures"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    quotes: medmkpQuotes.map((quote) => ({
      ...quote,
      supplier: medmkpSuppliers.find((supplier) => supplier.id === quote.supplier_id),
      line_items: medmkpCatalogItems.slice(0, 3),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    procurement_request_id?: string
    supplier_id?: string
  }

  res.status(202).json({
    quote: {
      id: `mq_demo_${Date.now()}`,
      procurement_request_id:
        body.procurement_request_id ?? "mpr_northline_rehab_june",
      supplier_id: body.supplier_id ?? "msup_integrated_medical",
      status: "draft",
      subtotal_cents: 0,
      estimated_shipping_cents: 0,
      platform_fee_cents: 0,
      estimated_savings_cents: 0,
      lead_time_days: 0,
      replacement_policy: "buyer_flexible",
    },
  })
}
