import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  medmkpCatalogItems,
  medmkpQuotes,
  medmkpRequests,
} from "../../../../seed/medmkp-fixtures"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.json({
    requests: medmkpRequests.map((request) => ({
      ...request,
      recommended_items: medmkpCatalogItems.slice(0, 3),
      quotes: medmkpQuotes.filter(
        (quote) => quote.procurement_request_id === request.id
      ),
    })),
  })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    buyer_name?: string
    buyer_email?: string
    source_file_name?: string
    notes?: string
  }

  res.status(202).json({
    request: {
      id: `mpr_demo_${Date.now()}`,
      buyer_name: body.buyer_name ?? "New clinic",
      buyer_facility_type: "pt",
      buyer_email: body.buyer_email ?? "buyer@example.com",
      status: "uploaded",
      source_file_name: body.source_file_name ?? "uploaded-catalog.pdf",
      item_count: 0,
      target_savings_percent: 10,
      notes: body.notes ?? "Pending concierge review.",
    },
  })
}
