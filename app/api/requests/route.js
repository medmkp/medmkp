import { NextResponse } from "next/server";
import { MEDUSA_URL } from "../../../lib/medusaAuth";
import { bearer } from "../../../lib/medusaProxy";
import { createRequest, listRequests } from "../../../lib/requestStore";
import { parseInvoicePdf } from "../../../lib/invoiceParser";
import { parseInvoiceCsv } from "../../../lib/csvParser";

export async function GET() {
  const requests = await listRequests();
  return NextResponse.json({ requests });
}

// Bound the match call so a slow/unreachable Medusa (e.g. a cold catalog index
// that's still building) can't hang the upload request forever — on timeout we
// fall back to returning the parsed line items unmatched.
const MATCH_TIMEOUT_MS = 150000;

async function matchLineItems(vendor, lineItems, token) {
  try {
    // Forward the caller's Medusa session as a Bearer credential — /medmkp/invoices/match
    // is now customer-authed, so an unauthenticated call correctly 401s (and we fall
    // back to unmatched line items below).
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${MEDUSA_URL}/medmkp/invoices/match`, {
      method: "POST",
      headers,
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
      signal: AbortSignal.timeout(MATCH_TIMEOUT_MS),
    });

    // 402 = the practice isn't entitled to invoice matching (a paid Practice
    // feature). Surface it verbatim so the upload flow can raise the paywall,
    // rather than silently degrading to an unmatched import.
    if (response.status === 402) {
      return { locked: true };
    }

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    return { ...(await response.json()), source: "medusa" };
  } catch {
    return null;
  }
}

// Normalize a Medusa offer into the flat shape the reorder list consumes.
// supplier-product name + supplier name feed the "Best matched product"
// column; price_cents / unit_price_cents feed "Best price".
function toOffer(offer) {
  return {
    name: offer.name,
    supplier: offer.supplier_name,
    supplierId: offer.supplier_id,
    sku: offer.sku,
    brand: offer.brand || "",
    price: (offer.price_cents ?? 0) / 100,
    comparablePrice: (offer.comparable_price_cents ?? offer.price_cents ?? 0) / 100,
    perUnit: offer.unit_price_cents != null ? offer.unit_price_cents / 100 : null,
    packQty: offer.pack_quantity ?? null,
    packSize: offer.pack_size || "",
    imageUrl: offer.image_url || "",
    productUrl: offer.product_url || "",
    availability: offer.availability || "unknown",
  };
}

// Flatten one matched line item. "product"/"canonicalName" is the canonical
// catalog product (the Item column); "bestOffer"/"offers" are the supplier
// products we can buy it from. Offers come pre-sorted by comparable price.
function toUiLineItem(match, vendor, source) {
  const item = match.input;
  // Collapse duplicate catalog rows (same supplier + SKU) so alternatives
  // don't list the same offer twice.
  const seen = new Set();
  const offers = (match.offers || []).map(toOffer).filter((offer) => {
    const key = `${offer.supplier}|${offer.sku}|${offer.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const best = offers[0] || null;
  const matched = match.match_status !== "unmatched";
  const imageUrl = match.display_image_url || best?.imageUrl || match.matched_supplier_product?.image_url || "";

  return {
    source,
    product: matched ? match.canonical_product?.name || best?.name || item.description : null,
    canonicalName: matched ? match.canonical_product?.name || best?.name || null : null,
    // Handle (or id, which the canonical-products lookup also resolves) used to
    // open this match's catalog page from the detail drawer.
    canonicalHandle: matched ? match.canonical_product?.handle || match.canonical_product?.id || null : null,
    imageUrl,
    extractedFrom: item.description,
    sku: item.sku || "",
    qty: item.qty || 1,
    unit: item.unit || "each",
    oldVendor: vendor || "",
    oldUnitPrice: (item.unit_price_cents ?? 0) / 100,
    // The practice's current per-pack price (the savings anchor). Null when the
    // invoice didn't carry a price, so the UI can prompt for it.
    paidUnitPrice: item.unit_price_cents != null ? item.unit_price_cents / 100 : null,
    matchStatus: match.match_status,
    confidence: (match.confidence || 0) / 100,
    matchReason: match.match_reason || "",
    bestOffer: best,
    offers,
  };
}

function unmatchedUiLineItem(item, vendor, source) {
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
    source
  );
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || file.size === 0) {
    return NextResponse.json({ error: "Upload a PDF or CSV invoice." }, { status: 400 });
  }

  const fileName = (file.name || "").toLowerCase();
  const isCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || fileName.endsWith(".csv");
  const source = isCsv ? "csv" : "pdf";

  let parsed;
  try {
    parsed = isCsv ? parseInvoiceCsv(await file.text()) : await parseInvoicePdf(await file.arrayBuffer());
  } catch (error) {
    return NextResponse.json(
      isCsv
        ? { error: "Could not read that CSV. Include a header row with item, qty, and price columns." }
        : { error: "Could not read that PDF. Try a text-based invoice PDF (not a scan)." },
      { status: 422 }
    );
  }

  if (!parsed.lineItems.length) {
    return NextResponse.json(
      { error: `No line items found in that ${isCsv ? "CSV" : "PDF"}. Make sure it lists items with quantities and prices.` },
      { status: 422 }
    );
  }

  const vendor = String(formData.get("supplierName") || "") || parsed.vendor;
  const token = await bearer();
  const matched = await matchLineItems(vendor, parsed.lineItems, token);

  if (matched?.locked) {
    return NextResponse.json(
      { error: "Invoice matching is a Practice feature.", locked: true },
      { status: 402 }
    );
  }

  const lineItems = matched
    ? matched.line_items.map((match) => toUiLineItem(match, vendor, source))
    : parsed.lineItems.map((item) => unmatchedUiLineItem(item, vendor, source));

  const procurementRequest = await createRequest({
    file,
    clinic: String(formData.get("clinic") || "Unknown clinic"),
    buyer: String(formData.get("buyer") || "Unknown buyer"),
    shippingAddress: String(formData.get("shippingAddress") || ""),
    preference: String(formData.get("preference") || "Exact brand if possible, alternatives allowed"),
    vendor,
    invoiceNumber: parsed.invoiceNumber,
    source,
    lineItems,
    matchSummary: matched?.summary || null,
    matchSource: matched ? "medusa" : "unavailable",
  });

  return NextResponse.json({ request: procurementRequest }, { status: 201 });
}
