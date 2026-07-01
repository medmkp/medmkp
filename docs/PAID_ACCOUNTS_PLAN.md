# Paid Accounts Plan (thin Stripe path)

**Status:** Planned, not built. Reviewed and CLEARED through `/plan-ceo-review`,
`/plan-eng-review`, and `/plan-design-review` on 2026-06-30 (+ Codex outside voice on
the CEO and eng plans). First two foundation issues filed:
[#519](https://github.com/tracedds/tracedds/issues/519) and
[#520](https://github.com/tracedds/tracedds/issues/520).

Supersedes nothing; implements the Tier-2 paid layer of the tiered-free funnel
(see `docs/TRACEDDS_PIVOT_PLAN.md`). Savings are the lure; compliance + invoice
intelligence are the paid spine.

---

## 1. Strategy

Three tiers, two already shipped:

| Tier | Price | Job | Status |
|---|---|---|---|
| 0 — Public scan | $0, no account | "Am I overpaying on this?" — unlimited single-item price check | Shipped (#486) |
| 1 — Free account | $0, sign up | Save + sync reorder list, scan history, catalog browse | Shipped (the funnel) |
| 2 — Practice (paid) | ~$99 / location / mo | Invoice matching + savings (the system-of-record) | This plan |

**Never meter scans.** The scan is the free lure, costs ~$0 (indexed read), and metering
a chore is anti-aligned. Competitor reality: Alara + the distributors give scanning and
price-comparison away free, so willingness-to-pay for "savings" alone ≈ $0. Practices DO
pay $49–99/location/mo (ZenOne) up to $150–250 (Sowingo) for inventory + compliance.
Per-location is the conventional axis. Affordability anchor: Open Dental at $129–179/location.

**Approach: THIN PAID PATH** (chosen over full funnel / concierge). The binding constraint
is proving willingness-to-pay, not funnel volume. Build the smallest path that can take a
real payment and gate the one feature that already works.

**Success criterion:** first non-founder practice pays real money AND renews once (~30 days).
A founder test card proves the plumbing, not WTP.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| Approach | Thin paid path (not full funnel, not concierge) | Prove WTP before building the machine |
| Gate scope | Gate ONLY invoice-match + savings/reports | Both built + cost real money; don't sell vapor (price alerts / audit export / multi-location are "coming soon") |
| Pricing | Per-location, ~$99/mo entry (page says $199 — revisit) | Under Open Dental's anchor; per-location is the house axis |
| Entitlement | Stripe is source of truth + LIGHTER reconcile | Webhook-only = silent lockout; daily cron/cache = premature |
| Reconcile | Portal-return read + manual admin re-sync + read-through on locked-but-paying; NO cron/cache | Kills the silent lockout without machinery you don't need at 0 customers |
| Error posture | Fail CLOSED + alert on entitlement DB-read error | Deterministic enforcement; a hidden "everyone un-gated" bug is the silent failure to avoid |
| Rollout | Dark-launch flag (`BILLING_ENFORCE`); auth added UNCONDITIONALLY, only the 402 behind the flag | Close the unauth hole now; flag-off = instant rollback |
| Existing users | Cold 402 lock, no special framing (user call) | Simplicity at pre-revenue; regression test + flag are the cheap undo |
| Data access | Subscription via module service / container connection, never a new `pg.Pool` | DRY; the model exists to be used |
| Billing infra | Stripe Billing (Checkout + Customer Portal) directly, NOT Medusa's order-oriented payment module | Medusa payments are cart/order, not subscriptions; hosted Checkout keeps PCI at SAQ-A |

---

## 3. Architecture + the load-bearing finding

```
Browser pricing CTA ─checkout─▶ POST /medmkp/billing/checkout (auth'd; practice_id from session; fixed price id)
                                        │
                                        ▼  Stripe hosted Checkout (no card data on our servers)
gated route ◀─402(flag on)── assertEntitled(req) ◀─reads── practice_subscription (status, stripe ids)
                                        ▲
        POST /medmkp/billing/webhook ───┘  (signature-verified, idempotent on event.id, ordering-tolerant)
        recovery: portal-return read + admin re-sync + read-through on locked-but-paying
```

**KEY PREREQUISITE (eng review, confidence 9/10).** Invoice-match
(`/medmkp/invoices/match` re-exports `src/api/store/medmkp/invoices/match/route.ts`) and
`/medmkp/savings` are **currently UNAUTHENTICATED and resolve no practice** —
`src/api/middlewares.ts` gates reorder-list/me/locations*/scans*/evidence* but NOT
invoices*/savings, and the store invoice-match POST reads only `req.body`. So gating has a
hard prerequisite: add `authenticate("customer")` + practice resolution to those two routes
FIRST, via a shared `assertEntitled(req)` (uses `resolvePracticeId` at `src/utils/practice.ts`).
This also closes a pre-existing unauthenticated heavy-`matchInvoice` hole.

**Second landmine.** The Next FE proxy `app/api/requests/route.js` (`matchLineItems`, ~L21)
calls Medusa with no auth header. Adding auth unconditionally breaks logged-in invoice-match
unless the proxy is reworked to forward the session in the same change. (Folded into #519.)

---

## 4. Implementation tasks + build order

Full task list with effort/files lives in
`~/.gstack/projects/tracedds-tracedds/tasks-{ceo,eng,design}-review-*.jsonl` (30 entries).
Build order:

**Lane A — backend billing spine (sequential; the critical path)**
- E1 — middleware: `authenticate("customer")` for `/medmkp/invoices*` + `/medmkp/savings`; webhook route OUTSIDE auth. **[#519]**
- E2 — shared `assertEntitled(req)` + `entitlement(practiceId)` (module service); 402 in both routes. **[#519]**
- E3 — flag gates only the 402; auth unconditional. **[#519]**
- E11 — subscription access via module service, not raw `pg.Pool`. **[#519]**
- E6/E9 — ALTER `practice_subscription`: full Stripe status enum + `last_reconciled_at`; `processed_webhook_event` (unique event_id); uniqueness on customer/subscription/practice; no-row=free backfill. **[#520]**
- E4 — webhook raw-body setup for Stripe signature verification. *(needs Stripe)*
- E5 — webhook ordering tolerance (event ts/version or fetch current state). *(needs Stripe)*
- E7 — checkout concurrency: deterministic customer reuse + idempotent session. *(needs Stripe)*
- E8 — practice_id metadata on Session/Subscription; quarantine unmappable webhooks. *(needs Stripe)*
- E3-reconcile (D7) — portal-return read + admin re-sync + read-through. *(needs Stripe)*
- E10 — audit log: source, event_id, old/new status, practice_id.
- E13 — v1 Stripe quantity=1, fixed price id; multi-location deferred.

**Lane B — frontend (can parallelize against the 402 contract once E1–E3 land)**
- E14 / G1 — upgrade panel over BLURRED inert content; benefit copy; one `--blue` CTA; no slop; reuse `DetailDrawer`/`ConfirmModal` + tokens.
- G3 — checkout-return "activating" pending state (aria-live) + canceled clean state.
- G4 — mobile lock = bottom sheet (DESIGN.md §16); 44px targets; desktop centered-over-blur.
- G6 — billing settings tab from the existing Settings pattern + `billing` stub; manage-billing entry.
- G2 — past_due = soft banner keeps access during retry; lapsed = read-only history.
- G5 — existing free users get the cold 402 (per decision).

**Tests (after Lane A)**
- E12 — full suite incl. REGRESSION (flag OFF preserves invoice-match; flag ON → 402 free) + chaos drop-webhook recovery.

### Mockup reference
No paywall wireframe exists in `design/SURFACES.md` (net-new surface). The paywall was
mocked inline from DESIGN.md tokens during planning: gated Savings content blurred behind a
centered "Unlock Practice" card (`--blue` CTA, `--green` savings, `#f8faff` app bg, 12px
cards), benefit-led copy, "Not now" escape; mobile = bottom sheet. The gstack raster designer
needs an OpenAI API key (not configured).

---

## 5. Human prerequisite (blocks the Stripe-marked tasks above)

The eng-loop CANNOT do this — it requires account setup:
- Create the Stripe account; generate test + live secret keys.
- Set the webhook signing secret.
- Create the `$99` per-location price; note the price id.
- Use Stripe TEST mode to validate the money path in prod before flipping `BILLING_ENFORCE`.

Until this is done, only #519 and #520 (which need no Stripe) are workable.

---

## 6. Deferred (also in `TODOS.md`)

1. Checkout-abandonment + cancel-return UI states.
2. Post-cancel data = keep history read-only (compliance product must not destroy records).
3. Receipts + failed-payment (dunning) emails + Stripe Tax.
4. Drop the explicit "savings guarantee" for v1 (legal/operational load) or define it fully.
5. Admin view to inspect/fix a practice ↔ Stripe mapping (avoid prod DB surgery).
6. **Acquisition motion** for the pricing CTA — P1 go-to-market, NOT this build. The open
   gating risk: without traffic to the CTA, the thin path is plumbing nobody hits.

---

## 7. Artifact pointers
- Tasks (machine-readable): `~/.gstack/projects/tracedds-tracedds/tasks-*.jsonl`
- Test plan: `~/.gstack/projects/tracedds-tracedds/*-eng-review-test-plan-*.md`
- Decisions: `~/.gstack/projects/tracedds-tracedds/decisions.active.json`
- Deferred work: `TODOS.md`
- Issues: [#519](https://github.com/tracedds/tracedds/issues/519), [#520](https://github.com/tracedds/tracedds/issues/520)
