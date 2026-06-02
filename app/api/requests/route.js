import { NextResponse } from "next/server";
import { createRequest, listRequests } from "../../../lib/requestStore";

export async function GET() {
  const requests = await listRequests();
  return NextResponse.json({ requests });
}

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string" || file.size === 0) {
    return NextResponse.json({ error: "Upload a PDF, image, CSV, or spreadsheet." }, { status: 400 });
  }

  const procurementRequest = await createRequest({
    file,
    clinic: String(formData.get("clinic") || "Unknown clinic"),
    buyer: String(formData.get("buyer") || "Unknown buyer"),
    shippingAddress: String(formData.get("shippingAddress") || ""),
    preference: String(formData.get("preference") || "Exact brand if possible, alternatives allowed"),
  });

  return NextResponse.json({ request: procurementRequest }, { status: 201 });
}
