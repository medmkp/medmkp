import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Pool } from "pg"
import { matchInvoice, type LineItemInput } from "../../../../../matching/line-items"
import { assertEntitled } from "../../../../../utils/practice"

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set")
    }
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: /localhost|127\.0\.0\.1/.test(databaseUrl) ? undefined : { rejectUnauthorized: false },
      max: 10,
    })
  }
  return pool
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  // Paid-tier gate (dark by default): auth is enforced by middleware; this only
  // 402s an unentitled practice when BILLING_ENFORCE is on.
  if (!(await assertEntitled(req, res))) return

  const body = (req.body ?? {}) as {
    vendor_name?: string
    line_items?: LineItemInput[]
  }

  const lineItems = Array.isArray(body.line_items) ? body.line_items : []
  if (!lineItems.length) {
    res.status(400).json({ error: "line_items is required" })
    return
  }
  if (lineItems.some((item) => !item || typeof item.description !== "string" || !item.description.trim())) {
    res.status(400).json({ error: "every line item needs a description" })
    return
  }

  const result = await matchInvoice(getPool(), body.vendor_name, lineItems.slice(0, 200))
  const matches = result.line_items

  const totals = matches.reduce(
    (acc, match) => {
      const qty = match.input.qty ?? 1
      if (match.input.unit_price_cents != null) {
        acc.invoice_cents += match.input.unit_price_cents * qty
      }
      if (match.best_offer && match.input.unit_price_cents != null) {
        acc.suggested_cents += Math.min(
          match.best_offer.comparable_price_cents,
          match.input.unit_price_cents
        ) * qty
      } else if (match.input.unit_price_cents != null) {
        acc.suggested_cents += match.input.unit_price_cents * qty
      }
      acc.savings_cents += match.savings_cents
      return acc
    },
    { invoice_cents: 0, suggested_cents: 0, savings_cents: 0 }
  )

  res.json({
    vendor_supplier_id: result.vendor_supplier_id,
    catalog_products: result.catalog_products,
    line_items: matches,
    summary: {
      ...totals,
      matched: matches.filter((match) => match.match_status !== "unmatched").length,
      exact: matches.filter((match) => match.match_status === "exact").length,
      variant: matches.filter((match) => match.match_status === "variant").length,
      needs_review: matches.filter((match) => match.match_status === "needs_review").length,
      unmatched: matches.filter((match) => match.match_status === "unmatched").length,
    },
  })
}
