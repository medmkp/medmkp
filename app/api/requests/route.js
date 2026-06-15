import { NextResponse } from "next/server";
import { createRequest, listRequests } from "../../../lib/requestStore";
import { parseInvoicePdf } from "../../../lib/invoiceParser";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export async function GET() {
  const requests = await listRequests();
  return NextResponse.json({ requests });
}

async function matchLineItems(vendor, lineItems) {
  const medusaUrl = process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000";

  try {
    const response = await fetch(`${medusaUrl}/medmkp/invoices/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_name: vendor,
        line_items: lineItems.map((item) => ({
          description: item.description,
          sku: item.sku || undefined,
          qty: item.qty,
          unit: item.unit,
          unit_price_cents: item.unit_price_cents,
        })),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    return { ...(await response.json()), source: "medusa" };
  } catch {
    return null;
  }
}

const STATUS_BY_MATCH = {
  exact: "Parsed",
  variant: "Alternative",
  needs_review: "Needs review",
  unmatched: "No match",
};

const MATCH_TYPE_BY_STATUS = {
  exact: "exact",
  variant: "equivalent",
  needs_review: "needs_review",
  unmatched: "unmatched",
};

function describeMatch(match, savingsPerUnit) {
  if (match.match_status === "unmatched") {
    return "No catalog match yet. Keeping your current item and price until a buyer reviews it.";
  }
  const supplier = match.best_offer?.supplier_name;
  if (savingsPerUnit > 0.005 && supplier) {
    return `${supplier} carries this for ${money.format(savingsPerUnit)} less per ${match.input.unit || "unit"}.`;
  }
  if (supplier) {
    return `Matched in the ${supplier} catalog at a comparable price.`;
  }
  return "Matched to the canonical catalog; no priced offer is available yet.";
}

function toUiLineItem(match, vendor, neededBy) {
  const item = match.input;
  const oldUnitPrice = (item.unit_price_cents ?? 0) / 100;
  const best = match.best_offer;
  const imageUrl = match.display_image_url ||
    best?.image_url ||
    match.offers?.find((offer) => offer.image_url)?.image_url ||
    match.matched_supplier_product?.image_url ||
    "";
  const selectedUnitPrice = best ? Math.min(best.comparable_price_cents / 100, oldUnitPrice || Infinity) : oldUnitPrice;
  const unitPrice = best ? best.comparable_price_cents / 100 : oldUnitPrice;
  const useOffer = Boolean(best) && (oldUnitPrice === 0 || unitPrice <= oldUnitPrice);
  const finalUnitPrice = useOffer ? unitPrice : oldUnitPrice;
  const savingsPerUnit = Math.max(oldUnitPrice - finalUnitPrice, 0);
  const matchType = MATCH_TYPE_BY_STATUS[match.match_status] || "needs_review";
  const lowest = match.offers?.[0];

  return {
    product: match.canonical_product?.name || best?.name || item.description,
    imageUrl,
    extractedFrom: item.description,
    sku: item.sku || "",
    qty: item.qty || 1,
    unit: item.unit || "each",
    oldVendor: vendor || "Current supplier",
    oldUnitPrice,
    neededBy: neededBy || "",
    status: STATUS_BY_MATCH[match.match_status] || "Needs review",
    recommendation: {
      matchType,
      confidence: (match.confidence || 0) / 100,
      priorProductName: item.description,
      recommendedProductName: useOffer ? best.name : item.description,
      imageUrl,
      recommendationReason: describeMatch(match, savingsPerUnit),
      savingsPerUnit,
      matchReason: match.match_reason,
      offers: match.offers || [],
    },
    selected: {
      supplier: useOffer ? best.supplier_name : vendor || "Current supplier",
      sku: useOffer ? best.sku : item.sku || "",
      image_url: useOffer ? best.image_url || imageUrl : imageUrl,
      unitPrice: finalUnitPrice,
      total: Number((finalUnitPrice * (item.qty || 1)).toFixed(2)),
      reason: useOffer
        ? savingsPerUnit > 0
          ? `Best price across ${match.offers.length} supplier offer${match.offers.length === 1 ? "" : "s"}`
          : "Matched supplier offer at parity"
        : "Keeping current item until matched",
    },
    lowest: lowest ? `${lowest.supplier_name} · ${money.format(lowest.comparable_price_cents / 100)}` : "",
    bestValue: best ? `${best.supplier_name} · ${money.format(best.comparable_price_cents / 100)}` : "",
  };
}

function unmatchedUiLineItem(item, vendor, neededBy) {
  return toUiLineItem(
    {
      input: item,
      match_status: "unmatched",
      confidence: 0,
      match_reason: "matching unavailable",
      best_offer: null,
      offers: [],
      canonical_product: null,
    },
    vendor,
    neededBy
  );
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || file.size === 0) {
    return NextResponse.json({ error: "Upload a PDF invoice." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseInvoicePdf(await file.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      { error: "Could not read that PDF. Try a text-based invoice PDF (not a scan)." },
      { status: 422 }
    );
  }

  if (!parsed.lineItems.length) {
    return NextResponse.json(
      { error: "No line items found in that PDF. Make sure it includes an itemized table with quantities and prices." },
      { status: 422 }
    );
  }

  const vendor = String(formData.get("supplierName") || "") || parsed.vendor;
  const neededBy = String(formData.get("neededBy") || "");
  const matched = await matchLineItems(vendor, parsed.lineItems);

  const lineItems = matched
    ? matched.line_items.map((match) => toUiLineItem(match, vendor, neededBy))
    : parsed.lineItems.map((item) => unmatchedUiLineItem(item, vendor, neededBy));

  const procurementRequest = await createRequest({
    file,
    clinic: String(formData.get("clinic") || "Unknown clinic"),
    buyer: String(formData.get("buyer") || "Unknown buyer"),
    shippingAddress: String(formData.get("shippingAddress") || ""),
    preference: String(formData.get("preference") || "Exact brand if possible, alternatives allowed"),
    vendor,
    invoiceNumber: parsed.invoiceNumber,
    lineItems,
    matchSummary: matched?.summary || null,
    matchSource: matched ? "medusa" : "unavailable",
  });

  return NextResponse.json({ request: procurementRequest }, { status: 201 });
}
