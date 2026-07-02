# TODOS

Deferred work. Each item is written down so it isn't a vague intention.

## Relaunch dormant surfaces

Launch trim keeps the code, backend routes, and data in place, but hides these surfaces from the rail and routes them back to `/app` through `app/launchSurfaces.js`:

- [ ] **Needs Attention** — relight by changing `dashboard` from `dormant` to `live`; restore a launch-appropriate CTA if it should be promoted again.
- [ ] **Locations** — relight `locations`, `locationDetail`, `locationAdd`, `officeLayout`, and `qrLabels` together so board/detail/layout/QR links do not strand users.
- [ ] **Savings** — relight `savings` when the launch pricing story includes savings proof again.
- [ ] **Evidence** — relight `evidence`, `evidenceReview`, `evidenceViewer`, `evidenceRedline`, and `evidenceBinder` together; scan evidence writes are paused for launch and need the scanner issue's relaunch decision before this becomes active.
- [ ] **Reports** — relight `reports` once evidence/reporting is back in the product surface.

## Paid accounts — deferred past first-dollar (from /plan-ceo-review 2026-06-30)

These do not block taking the first real payment (the thin paid path ships without them).

- [ ] **Checkout-abandonment + cancel-return UI states** (P2)
  - What: handle "started checkout but didn't finish" and "canceled on Stripe" with a clear state + retry CTA.
  - Why: `checkout_started` is instrumented but there's no abandoned/cancel UX; users who bounce get nothing.
  - Where to start: the post-Checkout return route + the pricing CTA component.

- [ ] **Post-cancel data behavior = keep history read-only** (P2)
  - What: when a subscription lapses/cancels, retain the practice's invoice-match history, saved reports, and exports as read-only rather than hard-locking or deleting.
  - Why: TraceDDS is a compliance system-of-record; destroying a practice's records on a billing lapse is the opposite of the value prop. Decided recommendation: read-only history, re-unlock on resubscribe.

- [ ] **Receipts + failed-payment (dunning) emails + Stripe Tax** (P2)
  - What: enable Stripe's built-in receipts, dunning emails, and Tax; confirm business identity on the account.
  - Why: part of "take real money" properly. Mostly Stripe dashboard config, little code.

- [ ] **Drop the explicit "savings guarantee" for v1 (or fully define it)** (P2)
  - What: remove guarantee language from pricing copy unless you define terms (definitions, exclusions, refund/credit rules, evidence standard, support handling).
  - Why: a guarantee is legally/operationally loaded and clashes with the honesty positioning unless specified. Decided recommendation: drop it for v1, keep "we surface real savings" framing.

- [ ] **Admin view: inspect a practice's Stripe customer/subscription mapping** (P2)
  - What: a minimal internal view (and the manual re-sync action from D7) to inspect and fix a practice ↔ Stripe customer/subscription link.
  - Why: without it, the first failed checkout/webhook complaint becomes production DB surgery.

- [ ] **Acquisition motion for the pricing CTA** (P1, go-to-market — NOT this billing build)
  - What: a concrete motion to get practices to the pricing page / upgrade CTA (outreach, in-app prompts at value moments, pilot list).
  - Why: the thin paid path is plumbing without traffic; the WTP experiment can't run if nobody reaches the CTA. Tracked as the gating risk for the success criterion (first real $ + 1 renewal). This is GTM work, parallel to the build.
