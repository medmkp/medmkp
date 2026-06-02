# MedMKP MVP

MedMKP is an early B2B medical-supply marketplace prototype for PT, chiro, and rehab offices.

The MVP currently runs as a dependency-free browser app:

- Buyer marketplace with category search, offer comparison, best-match scoring, and draft buy orders.
- Seller workspace with offer, stock, delivery, and catalog-review status.
- Admin catalog operations queue for product normalization.
- Local cart persistence via `localStorage`.
- Visual direction based on the supplied MedMKP Figma export: white procurement dashboard, blue brand accent, compact cards, and operational status tables.

## Run

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Product Direction

The key marketplace rule is to separate canonical products from seller offers:

```text
Seller SKU -> Canonical Product -> Comparable Offer -> Buy Order
```

That lets buyers compare price, stock, delivery time, seller trust, and compliance status for a single normalized product instead of sorting through duplicate listings.

## Next Build Slice

1. Add real buyer and seller organization auth.
2. Move mock data into Postgres.
3. Add seller offer intake.
4. Add admin catalog approval persistence.
5. Replace local cart with real buy order creation.
6. Add Stripe Connect seller onboarding and payout records.
