"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { billingReturnState, isEntitled } from "./lib";

// How the post-checkout "Activating…" state polls for entitlement. Stripe fires
// the entitlement-flipping webhook out of band, so on a fast return we may beat
// it — poll a few times, then fall back to a calm "almost there" reassurance
// (never a stale lock) rather than spinning forever.
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 12000;

// Only ever bounce the buyer back to an in-app path we own, so a crafted
// returnTo can't turn this into an open redirect.
function safeReturnTo(returnTo) {
  return typeof returnTo === "string" && returnTo.startsWith("/app") ? returnTo : "/app";
}

// The landing surface a buyer hits after Stripe hosted Checkout. On success we
// poll entitlement and drop them straight into the unlocked app the moment it
// flips; on cancel we show a clean no-charge state that returns them where they
// were with the upgrade path still open.
export function BillingReturnView({ status, returnTo, me, onRefreshMe, onNavigate }) {
  const state = billingReturnState(status);
  const destination = safeReturnTo(returnTo);
  const [phase, setPhase] = useState("polling"); // polling → timeout

  // Keep the latest callbacks/props in refs so the poll effect can run once and
  // isn't torn down (resetting its timer) every time the parent re-renders.
  const navRef = useRef(onNavigate);
  const refreshRef = useRef(onRefreshMe);
  const meRef = useRef(me);
  navRef.current = onNavigate;
  refreshRef.current = onRefreshMe;
  meRef.current = me;

  useEffect(() => {
    if (state !== "activating") return undefined;
    // A webhook that already landed means we're entitled on arrival — unlock now.
    if (isEntitled(meRef.current?.subscription)) {
      navRef.current?.(destination);
      return undefined;
    }

    let done = false;
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      const fresh = await refreshRef.current?.();
      if (done) return;
      if (isEntitled(fresh?.subscription)) {
        done = true;
        window.clearInterval(timer);
        navRef.current?.(destination);
      } else if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        done = true;
        window.clearInterval(timer);
        setPhase("timeout");
      }
    }, POLL_INTERVAL_MS);

    return () => {
      done = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, destination]);

  if (state === "canceled") {
    return (
      <div className="billing-return" role="status" aria-live="polite">
        <div className="billing-return-icon muted">
          <Icon name="icon-x-circle" />
        </div>
        <h1>Checkout canceled — no charge</h1>
        <p>
          You closed checkout before finishing, so nothing was charged. Pick up
          right where you left off, or upgrade whenever you&rsquo;re ready.
        </p>
        <div className="billing-return-actions">
          <button className="primary-action" type="button" onClick={() => onNavigate(destination)}>
            Back to where you were
          </button>
          <button className="secondary-action" type="button" onClick={() => onNavigate("/pricing")}>
            See plans
          </button>
        </div>
      </div>
    );
  }

  if (phase === "timeout") {
    return (
      <div className="billing-return" role="status" aria-live="polite">
        <div className="billing-return-icon ok">
          <Icon name="icon-check-circle" />
        </div>
        <h1>Almost there</h1>
        <p>
          Your payment went through. Activation is taking a moment longer than
          usual — it&rsquo;ll be ready shortly, with nothing more to do on your end.
        </p>
        <div className="billing-return-actions">
          <button className="primary-action" type="button" onClick={() => onNavigate(destination)}>
            Continue to app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-return" role="status" aria-live="polite" aria-busy="true">
      <span className="billing-return-spinner" aria-hidden="true" />
      <h1>Activating your plan…</h1>
      <p>
        Payment received. We&rsquo;re switching on your TraceDDS features — this
        only takes a moment.
      </p>
    </div>
  );
}
