# MedMKP MVP

MedMKP is an early B2B medical-supply marketplace prototype for PT, chiro, and rehab offices.

The MVP currently has three layers:

- A dependency-free browser demo in `index.html`.
- A Next.js prototype in `app/` with file-backed upload intake.
- A Medusa v2 backend scaffold in `medusa-backend/` for the marketplace buildout.

The clickable demo includes:

- Six-screen concierge procurement flow based on Sean's sketch.
- Landing page for the core promise: upload an invoice and get a better reorder quote.
- Invoice/reorder upload form for messy buyer inputs.
- Admin dashboard for parsing SKUs, matching suppliers, and sending RFQs.
- Quote builder that compares supplier responses and highlights best value.
- Buyer quote approval page with savings, brand-match, and alternative-product context.
- Order status page with PO, supplier confirmation, shipment, and reorder reminder states.
- Seeded client-side data for the demo request, supplier RFQs, quote chart, and order timeline.
- Visual direction based on the supplied MedMKP Figma export: white procurement dashboard, blue brand accent, compact cards, and operational status tables.

## Run

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

Run the Next.js prototype:

```bash
npm run dev
```

Run or build the Medusa backend:

```bash
cd medusa-backend/apps/backend
npm run build
```

The Medusa backend was scaffolded with database setup skipped. Its first MedMKP
routes are fixture-backed until we add local Postgres migrations:

- `GET /store/medmkp/categories`
- `GET /admin/medmkp/requests`
- `GET /admin/medmkp/quotes`

## Product Direction

See [PRODUCT_BRIEF.md](./PRODUCT_BRIEF.md) for the current Sean-notes product brief.

The key marketplace rule is to separate canonical products from seller offers:

```text
Seller SKU -> Canonical Product -> Comparable Offer -> Buy Order
```

That lets buyers compare price, stock, delivery time, seller trust, and compliance status for a single normalized product instead of sorting through duplicate listings.

## Next Build Slice

1. Add real buyer and seller organization auth.
2. Move mock data into Postgres.
3. Add buyer upload intake for invoices, reorder lists, catalogs, and free-form needs.
4. Add OCR/document parsing for normalized line items.
5. Add admin RFQ sending and supplier quote-link responses.
6. Add quote approval persistence and order-status tracking.
7. Add supplier catalog/SKU upload and parsing.
8. Add Stripe ACH / Stripe Connect commission tracking.
