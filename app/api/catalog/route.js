import { NextResponse } from "next/server";

const fallbackCategories = [
  ["Therapy bands", "Therapy Band Roll, Latex-Free, Medium Resistance, 50 yd", "Integrated Medical", 5799, 2],
  ["Tape", "Kinesiology Tape, 2 in x 16 ft, Case of 6", "Integrated Medical", 7499, 1],
  ["Electrodes", "Reusable Electrodes, 2 x 2 in, Pack of 40", "Therapy Direct Supply", 2895, 1],
  ["Table paper", "Exam Table Paper, Smooth, 21 in x 225 ft, Case of 12", "Integrated Medical", 6495, 1],
  ["Gloves", "Nitrile Exam Gloves, Medium, 1,000 ct", "Therapy Direct Supply", 11900, 1],
  ["Disinfectant wipes", "Disinfectant Wipes, Healthcare Grade, 160 ct, Case of 12", "Integrated Medical", 10450, 1],
  ["Hot/cold packs", "Reusable Hot/Cold Pack, Standard, Case of 12", "Integrated Medical", 8425, 1],
  ["Face cradle covers", "Disposable Face Cradle Covers, 100 ct", "Therapy Direct Supply", 1795, 1],
  ["Towels", "Clinic Hand Towels, 16 x 27 in, 24 ct", "Integrated Medical", 3895, 1],
  ["Foam rollers", "Foam Roller, 6 x 36 in, Medium Density", "Therapy Direct Supply", 2495, 1],
].map(([name, productName, supplierName, unitPriceCents, supplierCount]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  name,
  supplier_count: supplierCount,
  best_value_item: {
    name: productName,
    supplier_name: supplierName,
    unit_price_cents: unitPriceCents,
    lead_time_days: 4,
    inventory_status: "in_stock",
    comparable_score: 90,
  },
}));

export async function GET() {
  const medusaUrl = process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000";

  try {
    const response = await fetch(`${medusaUrl}/medmkp/categories`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    const body = await response.json();
    return NextResponse.json({
      categories: body.categories || fallbackCategories,
      source: "medusa",
    });
  } catch (error) {
    return NextResponse.json({
      categories: fallbackCategories,
      source: "fallback",
      warning: "Medusa backend is not reachable; showing fallback demo catalog.",
    });
  }
}
