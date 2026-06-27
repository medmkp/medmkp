# TraceDDS Cart Agent

Headless buying agent. Logs into suppliers as the practice (using credentials
stored encrypted in the backend) and builds carts on their behalf, so a buyer
gets a ready-to-checkout cart instead of a list of links to open by hand.

It runs **on the home NUC** (residential IP, no Render memory limits) as a
standalone Node process — it talks to the Medusa backend only over HTTP via the
shared-secret `/tracedds/agent/*` endpoints and never touches the database.

## How it works

1. Backend enqueues a `cart_build_job` when a buyer clicks "Build cart".
2. This runner polls `POST /tracedds/agent/claim`, which returns the job plus the
   **decrypted** supplier login (held in memory only).
3. The supplier adapter (`suppliers/<slug>.mjs`) drives Playwright: log in, then
   add each line to the cart. SCA/B2B carts persist to the account, so the buyer
   sees the cart when they log in themselves.
4. The runner reports per-line results + the cart URL via
   `POST /tracedds/agent/result`. The drawer polls and shows status.

## Setup (NUC)

```sh
cd cart-agent
npm install
npx playwright install chromium

export TRACEDDS_BACKEND_URL="https://tracedds-medusa.onrender.com"
export CART_AGENT_TOKEN="<same secret as the backend env>"

npm start          # daemon: drains the queue, then polls every 15s
npm run once       # process one job and exit (use from cron/systemd timer)
```

`CART_AGENT_HEADFUL=1 npm run once` watches the browser — use this to confirm a
new supplier's selectors against the live site.

## Adding a supplier

Drop a module in `suppliers/` exporting `{ login(page, cred), addLine(page,
line), cartUrl }` and register it in `suppliers/index.mjs`. The runner stays
supplier-agnostic. **First run for any supplier must be verified headful** — the
selectors in each adapter are best-effort and themes vary.

## Security

`/tracedds/agent/claim` returns plaintext passwords, gated only by
`CART_AGENT_TOKEN`. Keep that secret off the public internet, rotate it if it
leaks, and run this process only on trusted hardware.
