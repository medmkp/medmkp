# TraceDDS

TraceDDS is an early B2B dental-supply spend optimization prototype for dental practices and DSOs.

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
- Visual direction based on the supplied TraceDDS Figma export: white procurement dashboard, blue brand accent, compact cards, and operational status tables.

## Run Locally

TraceDDS currently has three runnable pieces:

- Docker infrastructure: Postgres and Redis.
- Medusa backend: commerce backend, admin app, and TraceDDS API routes.
- Next.js frontend: the clickable buyer/admin prototype.

### 1. Start Docker Infrastructure

From the repo root:

```bash
cd /path/to/tracedds
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

You should see `tracedds-postgres` and `tracedds-redis` as healthy.

### 2. Prepare the Medusa Database

From the Medusa workspace:

```bash
cd /path/to/tracedds/medusa-backend
npm run db:migrate
```

`db:migrate` is safe to rerun. Medusa tracks which migrations have already
been applied.

Catalog data comes from the supplier ingestion pipeline (see
`docs/SUPPLIER_INGESTION.md`) followed by `npm run products:match -- --commit`
(see `docs/PRODUCT_MATCHING.md`), or from importing an existing catalog dump.

### 3. Create the Local Medusa Admin User

The TraceDDS seed data does not create an admin login. Create the local admin
user separately:

```bash
cd /path/to/tracedds/medusa-backend
npm run admin:create
```

Local admin credentials:

```text
Email: admin@tracedds.local
Password: tracedds-admin
```

If the user already exists, Medusa may return an error. That is okay; use the
existing credentials above.

### 4. Start the Medusa Backend

In a dedicated terminal:

```bash
cd /path/to/tracedds/medusa-backend
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

Prototype TraceDDS API endpoints:

```text
http://127.0.0.1:9000/tracedds/categories
http://127.0.0.1:9000/tracedds/requests
http://127.0.0.1:9000/tracedds/quotes
```

If you see `EADDRINUSE` for port `9000`, another Medusa/Node process is already
running. Check it with:

```bash
lsof -nP -iTCP:9000 -sTCP:LISTEN
```

### 5. Start the Next.js Frontend

In a separate terminal, from the repo root:

```bash
cd /path/to/tracedds
npm run dev
```

Next usually starts at:

```text
http://localhost:3000
```

If port `3000` is busy, Next will print the alternate port, often `3001`.

### 6. Password Reset

The web app has a forgot/reset-password flow (`/forgot-password`, `/reset-password`)
on top of Medusa's email/password auth. Set `TRACEDDS_FRONTEND_URL` on the Medusa
backend (local `.env` and Render) so reset links point at the web app. Until a
notification provider is configured, the reset link is written to the Medusa logs
by the `auth.password_reset` subscriber, so the flow can be completed in development.

### Quick Health Check

With Docker and Medusa running:

```bash
docker compose ps
curl http://127.0.0.1:9000/tracedds/categories
curl http://localhost:3000
```

If all three respond, infrastructure, backend, and frontend are up.

## Worktree Dev Instances

Each git worktree can run its own isolated frontend `next dev` on a unique port,
with an in-app badge showing which branch and database it is pointed at — so you
can verify a feature in one worktree without it clashing with another.

Once per clone, install the hook:

```bash
npm run wt:setup
```

From then on, every `git worktree add` auto-writes a gitignored `.env.local` for
the new worktree with a unique port (range `3001`–`3099`), a backend target, and
the branch name. To run it:

```bash
npm run dev        # next dev on this worktree's assigned port
```

A fixed badge appears in the bottom-left of the app:

```text
claude/my-feature · DB: PROD · :3042
```

It is **red** when the worktree points at the prod backend and **blue** when it
points at local Medusa. New worktrees default to **prod** so `npm run dev` shows
real data with no local Postgres/Medusa — which means writes hit prod data; the
red badge is the reminder. Switch targets any time (restart `npm run dev` to
apply):

```bash
npm run wt:local   # point at local Medusa (http://127.0.0.1:9000)
npm run wt:prod    # point at the Render prod backend
```

List every worktree's instance:

```bash
npm run wt:list
# PORT    DB     BRANCH                    PATH
# 3042    prod   claude/my-feature         /Users/.../.claude/worktrees/...
```

Notes:

- Isolation is **frontend-only**: the badge controls which backend (and thus
  which DB) this worktree's frontend calls via `MEDUSA_BACKEND_URL`. The backend
  is shared — local mode uses the single Medusa on `:9000` (start it per
  [Run Locally](#run-locally) above); prod mode needs nothing local.
- `.env.local` is read only by Next.js (the frontend); it does not affect the
  Medusa backend, which reads only `.env`.
- The main checkout is unaffected: it keeps running on `:3000` with no badge.
- The hook lives in the shared `.git/hooks`, so `wt:setup` only needs running
  once per clone. A worktree auto-provisions only if its branch contains these
  scripts, so this must be on `main` for new worktrees to inherit it; retrofit an
  existing worktree with `npm run wt:init`.

## Static Demo

Build the Medusa backend:

```bash
cd medusa-backend/apps/backend
npm run build
```

The Medusa backend runs against local Postgres and Redis from
`docker-compose.yml`. Postgres is published on `127.0.0.1:55432` to avoid
colliding with Supabase or other local Postgres projects. Its first TraceDDS
routes are available under unauthenticated prototype endpoints:

- `GET /tracedds/categories`
- `GET /tracedds/requests`
- `GET /tracedds/quotes`

The same handlers are also mounted under Medusa-shaped paths, where Medusa's
normal auth applies:

- `GET /store/tracedds/categories`
- `GET /admin/tracedds/requests`
- `GET /admin/tracedds/quotes`

### Product Model

TraceDDS uses Medusa's native Product model for canonical buyer-facing products.
Supplier-specific listings live in the TraceDDS module as catalog items/offers.

```text
Medusa Product = canonical product buyers search and compare
TraceDDS Supplier = vendor/distributor record
TraceDDS Catalog Item = supplier-specific SKU, price, stock, lead time, and score
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
`docs/PRODUCT_MATCHING.md`).

## Deploy

TraceDDS is deployed as two services from the same GitHub repo:

```text
Vercel: Next.js frontend at the repo root
Render: Medusa backend from medusa-backend/apps/backend/
Render Postgres: database for Medusa
```

### Frontend on Vercel

Create a Vercel project from this repo:

```text
Repository: tracedds/tracedds-demo
Root directory: ./
Framework: Next.js
Build command: npm run build
```

Set this Vercel environment variable after the Render backend exists:

```text
MEDUSA_BACKEND_URL=https://tracedds.vercel.com
```

The frontend does not call Medusa directly from browser code. It calls the local
Next route `GET /api/catalog`, which proxies to `MEDUSA_BACKEND_URL`.

### Backend on Render

The repo includes [render.yaml](./render.yaml) for a Render Blueprint.

Create a Render Blueprint from this repo:

```text
Repository: tracedds/tracedds-demo
Blueprint file: render.yaml
```

The Blueprint creates:

- `tracedds-medusa`: Medusa web service
- `tracedds-postgres`: managed Postgres database

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
Email: admin@tracedds.local
Password: tracedds-admin
```

For a real hosted demo, replace those credentials after deploy with a stronger
account/password before sharing the admin URL.

### Deploy Order

1. Push `main` to GitHub.
2. Create the Render Blueprint.
3. Wait for Render to deploy `tracedds-medusa`.
4. Run `admin:create` once from Render Shell or a one-off job.
5. Create the Vercel frontend project.
6. Set `MEDUSA_BACKEND_URL` in Vercel to the Render backend URL.
7. Redeploy Vercel.

## Product Direction

See [PRODUCT_BRIEF.md](./docs/PRODUCT_BRIEF.md) for the current Sean-notes product brief.

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
