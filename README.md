# MedMKP

MedMKP is an early B2B dental-supply spend optimization prototype for dental practices and DSOs.

The MVP currently has two layers:

- A Next.js prototype in `app/` with file-backed upload intake.
- A Medusa v2 backend scaffold in `medusa-backend/` for the marketplace buildout.

The clickable prototype includes:

- Six-screen concierge procurement flow based on Sean's sketch.
- Landing page for the core promise: upload an invoice and get a better reorder quote.
- Invoice/reorder upload form for messy buyer inputs.
- Admin dashboard for parsing SKUs, matching suppliers, and sending RFQs.
- Quote builder that compares supplier responses and highlights best value.
- Buyer quote approval page with savings, brand-match, and alternative-product context.
- Order status page with PO, supplier confirmation, shipment, and reorder reminder states.
- Seeded client-side data for the demo request, supplier RFQs, quote chart, and order timeline.
- Visual direction based on the supplied MedMKP Figma export: white procurement dashboard, blue brand accent, compact cards, and operational status tables.

## Run Locally

MedMKP currently has three runnable pieces:

- Docker infrastructure: Postgres and Redis.
- Medusa backend: commerce backend, admin app, and MedMKP API routes.
- Next.js frontend: the clickable buyer/admin prototype.

### 1. Start Docker Infrastructure

From the repo root:

```bash
cd /Users/patrice/code/medmkp
docker compose up -d
```

This starts:

- Postgres: `127.0.0.1:55432`
- Redis: `127.0.0.1:6379`

Postgres intentionally uses port `55432` instead of `5432` to avoid colliding
with Supabase or other local Postgres projects.

Check that infrastructure is running:

```bash
docker compose ps
```

You should see `medmkp-postgres` and `medmkp-redis` as healthy.

### 2. Prepare the Medusa Database

From the Medusa workspace:

```bash
cd /Users/patrice/code/medmkp/medusa-backend
npm run db:migrate
```

`db:migrate` is safe to rerun. Medusa tracks which migrations have already
been applied.

Catalog data comes from the supplier ingestion pipeline (see
`SUPPLIER_INGESTION.md`) followed by `npm run products:match -- --commit`
(see `PRODUCT_MATCHING.md`), or from importing an existing catalog dump.

### 3. Create the Local Medusa Admin User

The MedMKP seed data does not create an admin login. Create the local admin
user separately:

```bash
cd /Users/patrice/code/medmkp/medusa-backend
npm run admin:create
```

Local admin credentials:

```text
Email: admin@medmkp.local
Password: medmkp-admin
```

If the user already exists, Medusa may return an error. That is okay; use the
existing credentials above.

### 4. Start the Medusa Backend

In a dedicated terminal:

```bash
cd /Users/patrice/code/medmkp/medusa-backend
npm run dev:medusa
```

Medusa should start at:

```text
http://127.0.0.1:9000
```

Medusa admin:

```text
http://127.0.0.1:9000/app
```

Prototype MedMKP API endpoints:

```text
http://127.0.0.1:9000/medmkp/categories
http://127.0.0.1:9000/medmkp/requests
http://127.0.0.1:9000/medmkp/quotes
```

If you see `EADDRINUSE` for port `9000`, another Medusa/Node process is already
running. Check it with:

```bash
lsof -nP -iTCP:9000 -sTCP:LISTEN
```

### 5. Start the Next.js Frontend

In a separate terminal, from the repo root:

```bash
cd /Users/patrice/code/medmkp
npm run dev
```

Next usually starts at:

```text
http://localhost:3000
```

If port `3000` is busy, Next will print the alternate port, often `3001`.

### Quick Health Check

With Docker and Medusa running:

```bash
docker compose ps
curl http://127.0.0.1:9000/medmkp/categories
curl http://localhost:3000
```

If all three respond, infrastructure, backend, and frontend are up.

## Static Demo

Build the Medusa backend:

```bash
cd medusa-backend/apps/backend
npm run build
```

The Medusa backend runs against local Postgres and Redis from
`docker-compose.yml`. Postgres is published on `127.0.0.1:55432` to avoid
colliding with Supabase or other local Postgres projects. Its first MedMKP
routes are available under unauthenticated prototype endpoints:

- `GET /medmkp/categories`
- `GET /medmkp/requests`
- `GET /medmkp/quotes`

The same handlers are also mounted under Medusa-shaped paths, where Medusa's
normal auth applies:

- `GET /store/medmkp/categories`
- `GET /admin/medmkp/requests`
- `GET /admin/medmkp/quotes`

### Product Model

MedMKP uses Medusa's native Product model for canonical buyer-facing products.
Supplier-specific listings live in the MedMKP module as catalog items/offers.

```text
Medusa Product = canonical product buyers search and compare
MedMKP Supplier = vendor/distributor record
MedMKP Catalog Item = supplier-specific SKU, price, stock, lead time, and score
```

For example, a buyer should see one canonical dental product, with
multiple supplier offers underneath it:

```text
Nitrile Exam Gloves, Medium, 100/Box
  -> Dental City / DC-GLV-NTR-M / $6.49 / 3 days
  -> Pearson Dental / A19-1006 / $7.10 / 5 days
```

Canonical products are generated from the ingested supplier catalogs by the
product matching pipeline (`npm run products:match`, see
`PRODUCT_MATCHING.md`).

## Deploy

MedMKP is deployed as two services from the same GitHub repo:

```text
Vercel: Next.js frontend at the repo root
Render: Medusa backend from medusa-backend/apps/backend/
Render Postgres: database for Medusa
```

### Frontend on Vercel

Create a Vercel project from this repo:

```text
Repository: medmkp/medmkp-demo
Root directory: ./
Framework: Next.js
Build command: npm run build
```

Set this Vercel environment variable after the Render backend exists:

```text
MEDUSA_BACKEND_URL=https://medmkp.com
```

The frontend does not call Medusa directly from browser code. It calls the local
Next route `GET /api/catalog`, which proxies to `MEDUSA_BACKEND_URL`.

### Backend on Render

The repo includes [render.yaml](./render.yaml) for a Render Blueprint.

Create a Render Blueprint from this repo:

```text
Repository: medmkp/medmkp-demo
Blueprint file: render.yaml
```

The Blueprint creates:

- `medmkp-medusa`: Medusa web service
- `medmkp-postgres`: managed Postgres database

Render runs Medusa migrations before each deploy:

```bash
npm run db:migrate
```

If you create the Render web service manually instead of using the Blueprint,
use this configuration:

```text
Root directory: medusa-backend/apps/backend
Build command: npm install --include=dev --no-audit --no-fund --loglevel=info --foreground-scripts && npm run build
Pre-deploy command: npm run db:migrate
Start command: npm start
```

The start command must bind Medusa to Render's assigned port. The backend
`npm start` script already does this with:

```bash
sh ./scripts/start-render.sh
```

The start script locates `.medusa/server/public/admin/index.html`, changes into
the built Medusa server directory, and then starts Medusa on Render's injected
`$PORT`.

The Medusa backend is pinned to Node `20.x`. If Render logs show Node `26.x`,
redeploy from the latest `main` commit or set `NODE_VERSION=20` on the Render
web service.

Create a Medusa admin user after the first deploy:

```bash
cd medusa-backend/apps/backend
npm run admin:create
```

For local development, this creates:

```text
Email: admin@medmkp.local
Password: medmkp-admin
```

For a real hosted demo, replace those credentials after deploy with a stronger
account/password before sharing the admin URL.

### Deploy Order

1. Push `main` to GitHub.
2. Create the Render Blueprint.
3. Wait for Render to deploy `medmkp-medusa`.
4. Run `admin:create` once from Render Shell or a one-off job.
5. Create the Vercel frontend project.
6. Set `MEDUSA_BACKEND_URL` in Vercel to the Render backend URL.
7. Redeploy Vercel.

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
