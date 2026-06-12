import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MEDMKP_MODULE } from "../../../../modules/medmkp"
import type MedMKPModuleService from "../../../../modules/medmkp/service"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const [quotes, catalogItems, suppliers] = await Promise.all([
    medmkp.listQuotes(),
    medmkp.listCatalogItems(),
    medmkp.listSuppliers(),
  ])

  res.json({
    quotes: quotes.map((quote) => ({
      ...quote,
      supplier: suppliers.find((supplier) => supplier.id === quote.supplier_id),
      line_items: catalogItems.slice(0, 3),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const medmkp = req.scope.resolve<MedMKPModuleService>(MEDMKP_MODULE)
  const body = (req.body ?? {}) as {
    procurement_request_id?: string
    supplier_id?: string
  }
  const quote = await medmkp.createQuotes({
    id: `mq_demo_${Date.now()}`,
    procurement_request_id: body.procurement_request_id ?? "",
    supplier_id: body.supplier_id ?? "",
    status: "draft",
    subtotal_cents: 0,
    estimated_shipping_cents: 0,
    platform_fee_cents: 0,
    estimated_savings_cents: 0,
    lead_time_days: 0,
    replacement_policy: "buyer_flexible",
  })

  res.status(202).json({
    quote,
  })
}
