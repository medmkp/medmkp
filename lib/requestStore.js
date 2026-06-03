import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.VERCEL
  ? path.join(tmpdir(), "medmkp")
  : path.join(process.cwd(), ".data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.json");

const seededLineItems = [
  {
    product: "Resistance Band Roll, Yellow",
    extractedFrom: "TheraBand Yellow 50 yd",
    qty: 12,
    unit: "rolls",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 48.2,
    neededBy: "May 24",
    status: "Parsed",
    outreach: "4 / 5",
    selected: {
      supplier: "Rehab Supply Co.",
      unitPrice: 42.5,
      total: 510,
      reason: "Exact brand, 2-day delivery",
    },
    lowest: "Clinical Direct · $39.90",
    fastest: "OrthoPro · 1 day",
    bestValue: "Rehab Supply Co. · $42.50",
  },
  {
    product: "Kinesiology Tape, Beige",
    extractedFrom: "K-tape beige 6 pack",
    qty: 18,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 62.75,
    neededBy: "May 24",
    status: "Needs review",
    outreach: "3 / 5",
    selected: {
      supplier: "MotionMed",
      unitPrice: 58.25,
      total: 1048.5,
      reason: "Fastest delivery, vetted brand",
    },
    lowest: "Summit Therapy · $52.40",
    fastest: "MotionMed · 1 day",
    bestValue: "MotionMed · $58.25",
  },
  {
    product: "Reusable Electrodes, 2 x 2",
    extractedFrom: "Reusable electrodes 2x2",
    qty: 20,
    unit: "packs",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 38.4,
    neededBy: "May 28",
    status: "Parsed",
    outreach: "5 / 5",
    selected: {
      supplier: "NeuroStim Supply",
      unitPrice: 34.2,
      total: 684,
      reason: "Exact spec, top reliability",
    },
    lowest: "MotionMed · $29.95",
    fastest: "NeuroStim · 1 day",
    bestValue: "NeuroStim · $34.20",
  },
  {
    product: "Exam Table Paper, Smooth",
    extractedFrom: "Table paper smooth, 12 rolls",
    qty: 10,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 71.1,
    neededBy: "May 30",
    status: "Parsed",
    outreach: "4 / 5",
    selected: {
      supplier: "Clinical Direct",
      unitPrice: 63.5,
      total: 635,
      reason: "Lowest total with 2-day delivery",
    },
    lowest: "OrthoPro · $60.80",
    fastest: "Rehab Supply Co. · 1 day",
    bestValue: "Clinical Direct · $63.50",
  },
  {
    product: "Nitrile Exam Gloves, Medium",
    extractedFrom: "Nitrile gloves M",
    qty: 24,
    unit: "boxes",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 9.6,
    neededBy: "May 30",
    status: "Alternative",
    outreach: "5 / 5",
    selected: {
      supplier: "PrimeMed Distributors",
      unitPrice: 8.75,
      total: 210,
      reason: "Vetted equivalent, lower unit cost",
    },
    lowest: "PrimeMed · $8.75",
    fastest: "HealthPro · 2 days",
    bestValue: "PrimeMed · $8.75",
  },
  {
    product: "Reusable Cold Pack, Standard",
    extractedFrom: "Cold pack standard 12 pack",
    qty: 9,
    unit: "cases",
    oldVendor: "Integrated Medical",
    oldUnitPrice: 83.25,
    neededBy: "Jun 2",
    status: "Parsed",
    outreach: "3 / 5",
    selected: {
      supplier: "OrthoPro Wholesale",
      unitPrice: 72,
      total: 648,
      reason: "Best value, sufficient stock",
    },
    lowest: "Summit Therapy · $68.50",
    fastest: "Rehab Supply Co. · 1 day",
    bestValue: "OrthoPro · $72.00",
  },
];

export const suppliers = [
  { name: "Rehab Supply Co.", signal: "EIN verified · PT catalog · 97% on-time" },
  { name: "Clinical Direct", signal: "ACH ready · 2-day Southeast lanes" },
  { name: "NeuroStim Supply", signal: "Electrotherapy specialist · certificate current" },
  { name: "PrimeMed Distributors", signal: "Thomasnet sourced · glove alternatives" },
  { name: "OrthoPro Wholesale", signal: "Bulk therapy equipment · stock confirmed" },
];

async function ensureStore() {
  await mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await readFile(REQUESTS_FILE, "utf8");
  } catch {
    await writeFile(REQUESTS_FILE, JSON.stringify([seedRequest()], null, 2));
  }
}

function seedRequest() {
  return {
    id: "req_seed_northline",
    clinic: "Northline Rehab",
    buyer: "Alex Kim",
    shippingAddress: "500 Healthcare Blvd, Nashville, TN",
    preference: "Exact brand if possible, alternatives allowed",
    sourceFileName: "Northline_Rehab_May_Reorder.pdf",
    storedFilePath: null,
    status: "parsed",
    createdAt: new Date("2026-06-01T12:00:00.000Z").toISOString(),
    lineItems: seededLineItems,
  };
}

async function readRequests() {
  await ensureStore();
  const body = await readFile(REQUESTS_FILE, "utf8");
  return JSON.parse(body);
}

async function writeRequests(requests) {
  await ensureStore();
  await writeFile(REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function listRequests() {
  const requests = await readRequests();
  return requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createRequest({ file, clinic, buyer, shippingAddress, preference }) {
  const requests = await readRequests();
  const id = `req_${randomUUID()}`;
  const storedFileName = `${id}_${sanitizeFileName(file.name || "upload")}`;
  const storedFilePath = path.join(UPLOAD_DIR, storedFileName);
  const bytes = Buffer.from(await file.arrayBuffer());

  await writeFile(storedFilePath, bytes);

  const procurementRequest = {
    id,
    clinic,
    buyer,
    shippingAddress,
    preference,
    sourceFileName: file.name || "upload",
    storedFilePath,
    status: "parsed",
    createdAt: new Date().toISOString(),
    lineItems: seededLineItems.map((item) => ({ ...item })),
  };

  requests.unshift(procurementRequest);
  await writeRequests(requests);

  return procurementRequest;
}
