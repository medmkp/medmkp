"use client";

import { useState, useEffect, useMemo } from "react";
import { Icon } from "./icons";
import { AGENT_SUPPLIERS, ARCHIVED_LISTS, CRL_STATUS, STRATEGY_LABELS, availabilityBadge, buildHandoffCsv, buildSupplierOrderText, deriveMatchRows, downloadTextFile, estimateArrival, formatArrival, groupRowsBySupplier, isAgentSupplier, isOrderable, isPlanIncluded, isStrandedOutOfStock, money, mrEa, mrMoney, normSupplierName, pickBestOffer, planSlug, shopifyStockKey, showPerEa, supplierSiteUrl } from "./lib";
import { BuyingPreferencesCard, ListStatusPill, MatchSupplier, ProductThumb } from "./ui";
import { MatchPanel, ReorderRow, ReorderTableHead } from "./reorder";

// The supplier SKU for a row's carted offer: slim handoff rows pin it at
// row.sku; live match rows carry it on the selected offer. The cart paths key
// variant lookups on it (multi-variant products share one product URL).
function cartRowSku(row) {
  return row.sku || (row.offers || []).find((offer) => offer.key === row.selectedOfferKey)?.sku || "";
}

export function CartBuilderModal({ group, buyingPrefs, onClose, onStockResults, onSwitchOffer, onOrderSubmitted, submitted = false, onToast }) {
  const [state, setState] = useState({ status: "loading", result: null });
  const rows = group.rows || [];
  const linkable = rows.filter((row) => row.productUrl);
  const missing = rows.length - linkable.length;

  useEffect(() => {
    if (!linkable.length) {
      setState({ status: "empty", result: null });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", result: null });
    fetch("/api/cart-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier: group.supplier,
        items: linkable.map((row) => ({
          name: row.matchName || row.canonicalName || "",
          qty: row.qty,
          productUrl: row.productUrl,
          sku: cartRowSku(row),
        })),
      }),
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((result) => {
        if (cancelled) return;
        setState({ status: "ready", result });
        onStockResults?.(result.stock || []);
      })
      .catch(() => { if (!cancelled) setState({ status: "error", result: null }); });
    return () => { cancelled = true; };
    // group identity is stable per open; re-resolve only when the supplier changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  // Headless buying-agent path. For suppliers we can drive (AGENT_SUPPLIERS), we
  // either build with a saved login or prompt for one on the fly. `agent.phase`:
  // checking → available (saved login) | prompt (ask on the fly) | off, then
  // queued → running → done/failed/needs_auth once a build is enqueued.
  const [agent, setAgent] = useState({ phase: "checking", job: null });
  const [login, setLogin] = useState({ username: "", password: "", save: false });
  const supplierId = group.supplierId || null;
  const agentEnabled = isAgentSupplier(group.supplier);

  useEffect(() => {
    if (!supplierId || !agentEnabled) { setAgent({ phase: "off", job: null }); return; }
    let cancelled = false;
    setAgent({ phase: "checking", job: null });
    fetch("/api/supplier-credentials")
      .then((r) => (r.ok ? r.json() : { credentials: [] }))
      .then(({ credentials }) => {
        if (cancelled) return;
        const has = (credentials || []).some((c) => c.supplier_id === supplierId);
        // Saved login → one-click; otherwise prompt for it on the fly.
        setAgent({ phase: has ? "available" : "prompt", job: null });
      })
      .catch(() => { if (!cancelled) setAgent({ phase: "prompt", job: null }); });
    return () => { cancelled = true; };
  }, [supplierId, agentEnabled]);

  // Poll a queued/running job until it settles.
  useEffect(() => {
    if (agent.phase !== "queued" && agent.phase !== "running") return;
    const jobId = agent.job?.id;
    if (!jobId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      fetch(`/api/cart-builds?id=${encodeURIComponent(jobId)}`)
        .then((r) => (r.ok ? r.json() : { jobs: [] }))
        .then(({ jobs }) => {
          if (cancelled) return;
          const job = (jobs || [])[0];
          if (!job) return;
          if (job.status === "done") setAgent({ phase: "done", job });
          else if (job.status === "failed") setAgent({ phase: "failed", job });
          else if (job.status === "needs_auth") setAgent({ phase: "needs_auth", job });
          else if (job.status === "running") setAgent((a) => ({ ...a, phase: "running", job }));
        })
        .catch(() => {});
    }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [agent.phase, agent.job?.id]);

  // `creds` carries an on-the-fly login (prompt path); omitted when a saved
  // login already exists.
  function startAgentBuild(creds) {
    const prevPhase = agent.phase;
    setAgent((a) => ({ ...a, phase: "queued" }));
    fetch("/api/cart-builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id: supplierId,
        lines: linkable.map((row) => ({
          name: row.matchName || row.canonicalName || "",
          qty: row.qty,
          productUrl: row.productUrl,
          sku: cartRowSku(row),
        })),
        ...(creds ? { username: creds.username, password: creds.password, save: creds.save } : {}),
      }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !data.job) {
          onToast(data?.error === "needs_credentials" ? "Enter your supplier login to build the cart" : "Couldn’t start the cart build");
          setAgent((a) => ({ ...a, phase: prevPhase }));
          return;
        }
        setAgent({ phase: "running", job: data.job });
      })
      .catch(() => { onToast("Couldn’t start the cart build"); setAgent((a) => ({ ...a, phase: prevPhase })); });
  }

  function submitLoginAndBuild(e) {
    e.preventDefault();
    if (!login.username.trim() || !login.password) { onToast("Enter your username and password"); return; }
    startAgentBuild({ username: login.username.trim(), password: login.password, save: login.save });
  }

  const result = state.result;
  const isAmazon = state.status === "ready" && result?.kind === "amazon-cart";
  const isPrefill = state.status === "ready" && (result?.kind === "shopify-cart" || isAmazon);
  // Per-item add links (Pearson): each link adds its line to the supplier's
  // session cart, so "open" here means "add" — same tabs, real cart at the end.
  const isAddLinks = state.status === "ready" && result?.kind === "add-pages";
  const addUrlByProduct = isAddLinks
    ? new Map((result.items || []).map((item) => [item.productUrl, item.addUrl]))
    : null;

  // Best-effort multi-tab open for the page-by-page path. Browsers block all but
  // the first pop-up, so we nudge the buyer to allow them (per-item links below
  // always work as the reliable fallback).
  function openAll() {
    let opened = 0;
    for (const row of linkable) {
      const url = addUrlByProduct?.get(row.productUrl) || row.productUrl;
      if (window.open(url, "_blank", "noopener")) opened += 1;
    }
    if (opened < linkable.length) onToast("Allow pop-ups to open every product page at once");
  }

  return (
    <div className="crl-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cartModalTitle" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="crl-modal cart-modal">
        <header className="crl-modal-head">
          <div>
            <h3 id="cartModalTitle">Build cart · {group.supplier}</h3>
            <p>{isPrefill
              ? "We can prefill this supplier’s cart in one click — quantities included."
              : isAddLinks
              ? "Each link below adds its item straight to the supplier’s cart — quantities included."
              : "Open each product on the supplier’s site and add it to your cart."}</p>
          </div>
          <button className="crl-modal-close" type="button" aria-label="Close" onClick={onClose}><Icon name="icon-x" className="button-icon" /></button>
        </header>

        <div className="crl-modal-body cart-modal-body">
          {/* Headless buying-agent path — one-click when a login is saved. */}
          {agent.phase === "available" && (
            <div className="cart-agent cart-agent-offer">
              <div className="cart-prefill-icon"><Icon name="icon-bolt" /></div>
              <strong>Build this cart for you</strong>
              <small>We’ll sign in to {group.supplier} with your saved login and add all {linkable.length} item{linkable.length === 1 ? "" : "s"} to your cart.</small>
              <button className="primary-action compact" type="button" onClick={() => startAgentBuild()}>
                <Icon name="icon-cart" className="button-icon" />Build my {group.supplier} cart
              </button>
            </div>
          )}

          {/* On-the-fly login: build without saving the password. */}
          {agent.phase === "prompt" && (
            <form className="cart-agent cart-agent-prompt" onSubmit={submitLoginAndBuild}>
              <div className="cart-prefill-icon"><Icon name="icon-bolt" /></div>
              <strong>Build this cart for you</strong>
              <small>Enter your {group.supplier} login and we’ll add all {linkable.length} item{linkable.length === 1 ? "" : "s"} to your cart. We use it for this order only — it isn’t saved unless you ask.</small>
              <input type="text" autoComplete="off" placeholder={`${group.supplier} username or email`} value={login.username} onChange={(e) => setLogin((l) => ({ ...l, username: e.target.value }))} />
              <input type="password" autoComplete="off" placeholder="Password" value={login.password} onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))} />
              <label className="cart-agent-save">
                <input type="checkbox" checked={login.save} onChange={(e) => setLogin((l) => ({ ...l, save: e.target.checked }))} />
                Save this login so I don’t have to re-enter it
              </label>
              <button className="primary-action compact" type="submit">
                <Icon name="icon-cart" className="button-icon" />Build my {group.supplier} cart
              </button>
            </form>
          )}

          {(agent.phase === "queued" || agent.phase === "running") && (
            <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Signing in to {group.supplier} and adding your items… this can take a minute.</div>
          )}

          {agent.phase === "needs_auth" && (
            <div className="cart-status">That {group.supplier} login didn’t work. Double-check it (or that you have a {group.supplier} account) and try again.</div>
          )}

          {agent.phase === "failed" && (
            <div className="cart-status">Couldn’t finish building your {group.supplier} cart{agent.job?.error ? ` (${agent.job.error})` : ""}. You can open the products below instead.</div>
          )}

          {agent.phase === "done" && (
            <div className="cart-agent cart-agent-done">
              <div className="cart-prefill-icon"><Icon name="icon-cart" /></div>
              <strong>Your {group.supplier} cart is ready</strong>
              {(() => {
                const added = (agent.job?.results || []).filter((r) => r.status === "added").length;
                const issues = (agent.job?.results || []).filter((r) => r.status !== "added");
                return (
                  <>
                    <small>{added} of {agent.job?.results?.length || 0} item{(agent.job?.results?.length || 0) === 1 ? "" : "s"} added to your cart on {group.supplier}.</small>
                    {agent.job?.cart_url && (
                      <a className="primary-action compact" href={agent.job.cart_url} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening your ${group.supplier} cart`)}>
                        <Icon name="icon-cart" className="button-icon" />Open your cart
                      </a>
                    )}
                    {issues.length > 0 && (
                      <ul className="cart-agent-issues">
                        {issues.map((r, i) => (
                          <li key={i}>{r.status === "out_of_stock" ? "Out of stock" : r.status === "not_found" ? "Couldn’t find" : "Couldn’t add"}: {linkable.find((row) => row.productUrl === r.productUrl)?.matchName || r.productUrl}</li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {state.status === "loading" && (
            <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Finding the best way to fill your {group.supplier} cart…</div>
          )}

          {state.status === "empty" && (
            <div className="cart-status">No supplier product links are available for these items yet.</div>
          )}

          {state.status === "error" && (
            <div className="cart-status">Couldn’t reach {group.supplier} to prefill the cart — open each product below instead.</div>
          )}

          {isPrefill && (
            <div className="cart-prefill">
              <div className="cart-prefill-icon"><Icon name="icon-cart" /></div>
              <strong>Your {group.supplier} cart is ready</strong>
              <small>{result.count} item{result.count === 1 ? "" : "s"} with quantities, added to the cart on {group.supplier}.{isAmazon ? " Amazon may ask you to sign in first — your items land in the cart right after." : ""}</small>
              <a className="primary-action compact" href={result.url} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening your ${group.supplier} cart`)}>
                <Icon name="icon-cart" className="button-icon" />Open prefilled cart
              </a>
              {result.leftovers?.length > 0 && (
                <small className="cart-leftover-note">{result.leftovers.length} item{result.leftovers.length === 1 ? "" : "s"} couldn’t be added automatically — review {result.leftovers.length === 1 ? "it" : "them"} below.</small>
              )}
            </div>
          )}

          {isAddLinks && (
            <div className="cart-prefill">
              <div className="cart-prefill-icon"><Icon name="icon-cart" /></div>
              <strong>Fill your {group.supplier} cart</strong>
              <small>{result.count} item{result.count === 1 ? "" : "s"} with quantities — each opened link drops its item into the same {group.supplier} cart.</small>
              <button className="primary-action compact" type="button" onClick={openAll}>
                <Icon name="icon-cart" className="button-icon" />Add all {result.count} item{result.count === 1 ? "" : "s"} to cart
              </button>
              <a className="crl-ghost-btn" href={result.cartUrl} target="_blank" rel="noreferrer">
                <Icon name="icon-link" className="button-icon" />View your {group.supplier} cart
              </a>
            </div>
          )}

          {(state.status === "error" || (state.status === "ready" && !isPrefill && !isAddLinks && !result?.stock?.length)) && linkable.length > 0 && (
            <button className="primary-action compact cart-openall" type="button" onClick={openAll}>
              <Icon name="icon-link" className="button-icon" />Open all {linkable.length} product page{linkable.length === 1 ? "" : "s"}
            </button>
          )}

          {state.status !== "loading" && rows.length > 0 && (
            <ul className="cart-item-list">
              {rows.map((row, index) => {
                const liveResult = result?.stock?.find(
                  (entry) => shopifyStockKey(entry.productUrl) === shopifyStockKey(row.productUrl)
                );
                const liveOutOfStock = liveResult?.available === false;
                const switchTarget = row.switchTarget || (liveOutOfStock
                  ? pickBestOffer((row.offers || []).filter((offer) => offer.key !== row.selectedOfferKey && isOrderable(offer)), buyingPrefs, row)
                  : null);
                return (
                  <li className="cart-item" key={row.id ?? index}>
                    <ProductThumb image={row.image} alt={row.matchName || row.canonicalName} />
                    <span className="cart-item-name">
                      <strong>{row.matchName || row.canonicalName}</strong>
                      <small>{liveOutOfStock ? "Out of stock at this supplier" : `Qty ${row.qty} ${row.uom}${row.matchSub ? ` · ${row.matchSub}` : ""}`}</small>
                    </span>
                    {liveOutOfStock && switchTarget && row.itemId && onSwitchOffer ? (
                      <button
                        className="crl-ghost-btn cart-item-open"
                        type="button"
                        onClick={() => {
                          onSwitchOffer(row.itemId, { selectedOfferKey: switchTarget.key });
                          onToast(`Switched to ${switchTarget.supplier}`);
                          onClose();
                        }}
                      >
                        <Icon name="icon-shuffle" className="button-icon" />Switch
                      </button>
                    ) : liveOutOfStock ? (
                      <span className="cart-item-nolink">Unavailable</span>
                    ) : addUrlByProduct?.get(row.productUrl) ? (
                      <a className="crl-ghost-btn cart-item-open" href={addUrlByProduct.get(row.productUrl)} target="_blank" rel="noreferrer"><Icon name="icon-cart" className="button-icon" />Add to cart</a>
                    ) : row.productUrl ? (
                      <a className="crl-ghost-btn cart-item-open" href={row.productUrl} target="_blank" rel="noreferrer"><Icon name="icon-link" className="button-icon" />Open</a>
                    ) : (
                      <span className="cart-item-nolink">No link</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {missing > 0 && state.status !== "loading" && (
            <small className="cart-missing-note">{missing} item{missing === 1 ? "" : "s"} on this order ha{missing === 1 ? "s" : "ve"} no supplier link — add {missing === 1 ? "it" : "them"} from the supplier’s site directly.</small>
          )}
        </div>

        <footer className="crl-modal-foot">
          <button className="crl-ghost-btn" type="button" onClick={onClose}>Done</button>
          {onOrderSubmitted && (
            submitted ? (
              <span className="cart-submitted-tag"><Icon name="icon-check-circle" className="button-icon" />Order submitted</span>
            ) : (
              <button className="primary-action compact" type="button" onClick={() => onOrderSubmitted(group)}>
                <Icon name="icon-check-circle" className="button-icon" />Mark order submitted
              </button>
            )
          )}
        </footer>
      </div>
    </div>
  );
}

// Read-only product lines for one supplier — thumb, name, qty, per-ea, total,
// with an optional product-detail link. No edit affordances, so it's the shared
// "look but don't touch" rendering for the frozen handoff and a submitted order.
// Passing `onSwitchOffer` opts into the out-of-stock reassign button.

export function SupplierGroupLines({ rows, onNavigate, onSwitchOffer, onToast }) {
  return (
    <div className="pp-group-lines">
      {rows.map((row) => {
        const clickable = Boolean(row.canonicalHandle);
        return (
          <div className="pp-line-wrap" key={row.id}>
            <div
              className={`pp-line ${clickable ? "clickable" : ""}`}
              onClick={clickable ? () => onNavigate?.(`/app/product/${row.canonicalHandle}`) : undefined}
            >
              <ProductThumb image={row.image} alt={row.matchName || row.canonicalName} />
              <span className="pp-line-name">
                <strong>{row.matchName || row.canonicalName}</strong>
                <span className="pp-line-sub">
                  {row.matchSub && <small>{row.matchSub}</small>}
                  {(() => {
                    const badge = availabilityBadge(row.availability, row.liveAvailable);
                    return badge ? (
                      <span
                        className={`pp-stock-badge stock-${badge.tone}`}
                        title={typeof row.liveAvailable === "boolean" ? "Live stock checked this session" : "Stock as of last catalog sync — verify before ordering"}
                      >
                        {badge.label}
                      </span>
                    ) : null;
                  })()}
                </span>
              </span>
              <span className="pp-line-qty"><strong>{row.qty}</strong><small>{row.uom}</small></span>
              <span className="pp-line-ea">{showPerEa(row.perEa, row.price) ? `$${mrEa(row.perEa)} / ea` : ""}</span>
              <span className="pp-line-total">{mrMoney(row.lineTotal || 0)}</span>
            </div>
            {row.outOfStock && row.switchTarget && onSwitchOffer && (
              <div className="pp-line-switch">
                <span className="pp-switch-msg"><Icon name="icon-alert-triangle" className="button-icon" />Out of stock at {row.supplier}</span>
                <button
                  className="pp-switch-btn"
                  type="button"
                  onClick={() => { onSwitchOffer(row.itemId, { selectedOfferKey: row.switchTarget.key }); onToast?.(`Switched to ${row.switchTarget.supplier}`); }}
                >
                  <Icon name="icon-shuffle" className="button-icon" />Switch to {row.switchTarget.supplier} · {mrMoney(row.switchTarget.price)}
                </button>
              </div>
            )}
            {row.outOfStock && !row.switchTarget && (
              <div className="pp-line-switch">
                <span className="pp-switch-msg pp-switch-none"><Icon name="icon-alert-triangle" className="button-icon" />Out of stock — no in-stock supplier carries this item</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// One supplier's order block — shared by the live plan (full rows) and the
// frozen handoff (slim rows). `actions` injects the handoff's copy/open buttons.

export function SupplierGroupCard({ group, onNavigate, onBuildCart, onSwitchOffer, onToast, actions = null }) {
  const buildable = group.rows.some((row) => row.productUrl);
  return (
    <section className="crl-card pp-group">
      <div className="pp-group-head">
        <MatchSupplier name={group.supplier} />
        <span className="pp-group-meta">{group.count} item{group.count === 1 ? "" : "s"} · <strong>{money.format(group.subtotal)}</strong></span>
      </div>
      {(onBuildCart || actions) && (
        <div className="ho-group-actions">
          {onBuildCart && (
            <button className="crl-ghost-btn pp-buildcart-btn" type="button" disabled={!buildable} onClick={() => onBuildCart(group)} title={buildable ? "" : "No supplier product links for these items"}>
              <Icon name="icon-cart" className="button-icon" />Build cart
            </button>
          )}
          {actions}
        </div>
      )}
      <SupplierGroupLines rows={group.rows} onNavigate={onNavigate} onSwitchOffer={onSwitchOffer} onToast={onToast} />
    </section>
  );
}


export function ProcurementPlanView({ items, listName, listStatus = "draft", onBackToDraft, buyingPrefs, onBuyingPrefs, onBuildCart, onSwitchOffer, onConfirmMatch, onLinkProduct, onRemoveItem, onNavigate, onToast, submittedSuppliers = [], onReopenOrder, supplierShipping = {}, shipToState = "" }) {
  // Product-match drawer state — mirrors the reorder list so a row click opens
  // the same MatchPanel, and the drawer replaces the right rail while open.
  const [detail, setDetail] = useState(null);
  const [detailWide, setDetailWide] = useState(false);
  // Which submitted suppliers are expanded to show their (read-only) items. A
  // submitted order collapses by default; the buyer can expand to review what
  // was ordered without being able to change it.
  const [expandedSubmitted, setExpandedSubmitted] = useState(() => new Set());
  const toggleSubmitted = (supplier) => setExpandedSubmitted((prev) => {
    const next = new Set(prev);
    if (next.has(supplier)) next.delete(supplier); else next.add(supplier);
    return next;
  });
  const rows = deriveMatchRows(items || [], buyingPrefs);
  const included = rows.filter(isPlanIncluded);
  // No-match lines plus "out of stock everywhere" lines both land here so the
  // buyer sees why they're not in any supplier order.
  const unresolved = rows.filter((row) => !isPlanIncluded(row) && (row.status === "Not found" || !row.supplier || row.supplier === "—" || isStrandedOutOfStock(row)));
  const groups = groupRowsBySupplier(included);
  // Supplier carts render collapsed on load so the buyer first sees a clean
  // per-supplier summary (name · count · subtotal) and expands the one cart they
  // want to act on. A lone supplier auto-expands — collapsing a single cart is
  // friction with no scanning benefit. Click a header to toggle.
  const [collapsedGroups, setCollapsedGroups] = useState(
    () => new Set(groups.length > 1 ? groups.map((g) => g.supplier) : [])
  );
  const toggleGroup = (supplier) => setCollapsedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(supplier)) next.delete(supplier); else next.add(supplier);
    return next;
  });
  const total = included.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
  const coverage = rows.length ? Math.round((included.length / rows.length) * 100) : 0;
  // Lines out of stock at their selected supplier that DO have an in-stock
  // alternative — the bulk "reassign all" banner targets these.
  const oosReassignable = included.filter((row) => row.outOfStock && row.switchTarget);

  const supplierOptions = useMemo(() => {
    const names = new Set();
    for (const item of items || []) {
      for (const offer of item.offers || []) {
        if (offer.supplier) names.add(offer.supplier);
      }
    }
    return [...names].sort();
  }, [items]);

  return (
    <div className={`crl pp ${detail ? "detail-open" : ""}`}>
      <header className="crl-header pp-header">
        <div className="crl-title crl-title-main">
          <h2>Review</h2>
          <p className="crl-subtitle">
            <span className="crl-listname">{listName}</span>
            <span className="crl-dot" aria-hidden="true">·</span>
            <ListStatusPill status={listStatus} />
            <span className="crl-dot" aria-hidden="true">·</span>
            <span>{included.length} item{included.length === 1 ? "" : "s"} · {groups.length} supplier{groups.length === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div className="crl-header-actions">
          {listStatus === "review" && onBackToDraft && (
            <button className="secondary-action compact" type="button" onClick={onBackToDraft} title="Return to Draft to keep editing this list">
              <Icon name="icon-chevron-left" className="button-icon" />Back to draft
            </button>
          )}
        </div>
      </header>

      <div className={`crl-layout ${detail ? "has-detail" : ""} ${detail && detailWide ? "detail-wide" : ""}`}>
        <div className="crl-main">
          {groups.length === 0 ? (
            <div className="crl-card pp-empty">
              <Icon name="icon-package" className="button-icon" />
              <strong>No matched items yet</strong>
              <p>Match items on your reorder list to review and optimize suppliers, grouped by supplier.</p>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to reorder list</button>
            </div>
          ) : (
            <>
              {oosReassignable.length > 0 && (
                <div className="pp-oos-banner">
                  <span className="pp-oos-banner-msg">
                    <Icon name="icon-alert-triangle" className="button-icon" />
                    <strong>{oosReassignable.length} item{oosReassignable.length === 1 ? " is" : "s are"} out of stock</strong>
                    <span>— reassign to the next in-stock supplier.</span>
                  </span>
                  <button
                    className="pp-oos-banner-btn"
                    type="button"
                    onClick={() => {
                      oosReassignable.forEach((row) => onSwitchOffer?.(row.itemId, { selectedOfferKey: row.switchTarget.key }));
                      onToast?.(`Reassigned ${oosReassignable.length} item${oosReassignable.length === 1 ? "" : "s"} to in-stock suppliers`);
                    }}
                  >
                    <Icon name="icon-shuffle" className="button-icon" />Reassign all
                  </button>
                </div>
              )}
              {/* Same reorder-list table + match drawer, split into one section per
                  supplier. Each section shares the crl-row columns and opens the
                  MatchPanel on row click — it feels like the reorder list, grouped. */}
              {groups.map((group) => {
                const buildable = group.rows.some((row) => row.productUrl);
                const submitted = submittedSuppliers.includes(group.supplier);
                const expanded = expandedSubmitted.has(group.supplier);
                const collapsed = collapsedGroups.has(group.supplier);
                // Ship-time estimate for this supplier's basket: published window
                // refined per-destination, gated on stock. Backordered only when
                // nothing in the group is orderable. Silent when no policy.
                const groupOrderable = group.rows.some((row) => !row.outOfStock);
                const arrivalEst = estimateArrival(
                  supplierShipping?.[normSupplierName(group.supplier)] || null,
                  shipToState,
                  { available: groupOrderable }
                );
                const arrivalLabel = formatArrival(arrivalEst);
                const arrivalBad = arrivalEst?.status === "backordered";
                const arrivalChip = arrivalLabel ? (
                  <span className={`pp-group-eta ${arrivalBad ? "bad" : ""}`} title="Estimated delivery — published transit time, business days, excludes holidays">
                    <Icon name={arrivalBad ? "icon-alert-triangle" : "icon-truck"} className="button-icon" />{arrivalLabel}
                  </span>
                ) : null;
                return (
                  <section className={`crl-card pp-group ${submitted ? "pp-group-submitted" : ""}`} key={group.supplier}>
                    {submitted ? (
                      // Submitted = locked. The header toggles a read-only view of
                      // what was ordered (no edit controls); the ONLY way back to
                      // an editable cart is the explicit "Undo order submitted".
                      <div
                        className="pp-group-head pp-group-head-toggle"
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => toggleSubmitted(group.supplier)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSubmitted(group.supplier); } }}
                      >
                        <MatchSupplier name={group.supplier} />
                        {arrivalChip}
                        <span className="pp-group-meta">{group.count} item{group.count === 1 ? "" : "s"} · <strong>{money.format(group.subtotal)}</strong></span>
                        <span className="pp-submitted-badge"><Icon name="icon-check-circle" className="button-icon" />Order submitted</span>
                        <Icon name={expanded ? "icon-chevron-down" : "icon-chevron-right"} className="button-icon pp-submitted-chevron" />
                      </div>
                    ) : (
                      <div
                        className={`pp-group-head pp-group-head-toggle ${collapsed ? "" : "pp-group-head-open"}`}
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsed}
                        onClick={() => toggleGroup(group.supplier)}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleGroup(group.supplier); } }}
                      >
                        <MatchSupplier name={group.supplier} />
                        {arrivalChip}
                        <span className="pp-group-meta">{group.count} item{group.count === 1 ? "" : "s"} · <strong>{money.format(group.subtotal)}</strong></span>
                        {onBuildCart && (
                          <button className="crl-ghost-btn pp-buildcart-btn" type="button" disabled={!buildable} onClick={(e) => { e.stopPropagation(); onBuildCart(group); }} title={buildable ? "" : "No supplier product links for these items"}>
                            <Icon name="icon-cart" className="button-icon" />Build cart
                          </button>
                        )}
                        <Icon name={collapsed ? "icon-chevron-right" : "icon-chevron-down"} className="button-icon pp-submitted-chevron" />
                      </div>
                    )}
                    {submitted ? (
                      expanded && (
                        <>
                          <SupplierGroupLines rows={group.rows} onNavigate={onNavigate} />
                          <div className="pp-submitted-foot">
                            <span className="pp-submitted-lock"><Icon name="icon-lock" className="button-icon" />Locked after submitting</span>
                            {onReopenOrder && (
                              <button className="crl-ghost-btn pp-undo-submitted" type="button" onClick={() => onReopenOrder(group.supplier)}>
                                <Icon name="icon-refresh" className="button-icon" />Undo order submitted
                              </button>
                            )}
                          </div>
                        </>
                      )
                    ) : !collapsed && (
                      <div className="pp-group-table">
                        <ReorderTableHead />
                        {group.rows.map((row) => (
                          <ReorderRow
                            key={row.id}
                            row={row}
                            active={detail?.row.id === row.id}
                            onOpen={(r, mode) => setDetail({ row: r, mode })}
                            onConfirmMatch={onConfirmMatch}
                            onRemoveItem={onRemoveItem}
                            onToast={onToast}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}

          {unresolved.length > 0 && (
            <section className="crl-card pp-unresolved">
              <div className="crl-card-head">
                <h3 className="pp-unresolved-title">
                  <Icon name="icon-alert-triangle" className="button-icon" />
                  Unresolved items ({unresolved.length})
                </h3>
                <button className="crl-edit-link" type="button" onClick={() => onNavigate("/app")}>Resolve on list</button>
              </div>
              <p className="pp-unresolved-note">These items aren&rsquo;t in any supplier order and won&rsquo;t be included in the supplier handoff.</p>
              <ul className="pp-unresolved-list">
                {unresolved.map((row) => {
                  const stranded = isStrandedOutOfStock(row);
                  return (
                    <li key={row.id}>
                      <ProductThumb image={row.image} alt={row.importedName} />
                      <span className="pp-unresolved-name">
                        <strong>{row.canonicalName || row.importedName}</strong>
                        <small>{stranded ? "Out of stock at every supplier" : `Qty ${row.qty} ${row.uom}`}</small>
                      </span>
                      <span className={`pp-unresolved-tag ${stranded ? "tag-oos" : ""}`}>{stranded ? "Out of stock" : "No match"}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {detail ? (
          <MatchPanel
            key={detail.row.itemId || detail.row.id}
            row={detail.row}
            mode={detail.mode}
            wide={detailWide}
            onToggleWide={() => setDetailWide((value) => !value)}
            onClose={() => { setDetail(null); setDetailWide(false); }}
            onToast={onToast}
            onConfirmMatch={onConfirmMatch}
            onLinkProduct={onLinkProduct}
            onRemoveItem={onRemoveItem}
            onNavigate={onNavigate}
          />
        ) : (
          <aside className="crl-rail">
            <BuyingPreferencesCard
              prefs={buyingPrefs}
              supplierOptions={supplierOptions}
              onSave={onBuyingPrefs}
              onToast={onToast}
            />
            <section className="crl-card">
              <h3>Plan Summary</h3>
              <div className="crl-plan">
                <div><span>Estimated total</span><strong>{money.format(total)}</strong></div>
                <div><span>Suppliers</span><strong>{groups.length}</strong></div>
                <div><span>Coverage</span><strong>{coverage}%</strong></div>
                <div><span>Included items</span><strong>{included.length}</strong></div>
              </div>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}


export function SupplierHandoffView({ handoff, onArchive, onBuildCart, onNavigate, onToast }) {
  if (!handoff) {
    return (
      <div className="crl ho">
        <header className="crl-header"><div className="crl-title crl-title-main"><h2>Supplier Handoff</h2></div></header>
        <div className="crl-card pp-empty">
          <Icon name="icon-handshake" className="button-icon" />
          <strong>No handoff prepared yet</strong>
          <p>Open Review &amp; optimize and prepare a supplier handoff to see frozen order details here.</p>
          <button className="secondary-action compact" type="button" onClick={() => onNavigate("/app/review")}>Open Review &amp; optimize</button>
        </div>
      </div>
    );
  }

  function copyGroup(group) {
    const text = buildSupplierOrderText(group, handoff);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => onToast(`${group.supplier} order details copied`))
        .catch(() => onToast("Couldn’t copy — try again"));
    } else {
      onToast("Clipboard unavailable in this browser");
    }
  }

  function exportCsv() {
    downloadTextFile(`${planSlug(handoff.listName)}-handoff.csv`, buildHandoffCsv(handoff), "text/csv");
    onToast("CSV exported");
  }

  function exportPdf() {
    onToast("Opening print dialog — choose “Save as PDF”");
    setTimeout(() => window.print(), 350);
  }

  return (
    <div className="crl ho">
      <header className="crl-header ho-header">
        <div className="crl-title crl-title-main">
          <button className="history-back" type="button" onClick={() => onNavigate("/app/review")}><Icon name="icon-chevron-left" className="button-icon" />Review &amp; optimize</button>
          <h2>Supplier Handoff</h2>
          <p className="crl-subtitle">
            <span className="ho-frozen-pill"><Icon name="icon-lock" className="button-icon" />Frozen snapshot</span>
            <span className="crl-dot" aria-hidden="true">·</span>
            <span>{handoff.createdLabel}</span>
          </p>
        </div>
        <div className="crl-header-actions ho-export">
          <button className="secondary-action compact" type="button" onClick={exportCsv}><Icon name="icon-table" className="button-icon" />Export CSV</button>
          <button className="secondary-action compact" type="button" onClick={exportPdf}><Icon name="icon-file-text" className="button-icon" />Export PDF</button>
        </div>
      </header>

      <div className="ho-banner">
        <Icon name="icon-lock" className="button-icon" />
        <span>Frozen snapshot of <strong>{handoff.listName}</strong>, captured {handoff.createdLabel}. Prices and selections are locked so your order details won&rsquo;t drift.</span>
      </div>

      <div className="ho-summary">
        <div><small>Suppliers</small><strong>{handoff.supplierCount}</strong></div>
        <div><small>Items</small><strong>{handoff.itemCount}</strong></div>
        <div><small>Estimated total</small><strong>{money.format(handoff.total)}</strong></div>
        <div><small>Strategy</small><strong>{STRATEGY_LABELS[handoff.prefs?.strategy] || "Best price"}</strong></div>
      </div>

      <div className="ho-groups">
        {handoff.groups.map((group) => (
          <SupplierGroupCard
            key={group.supplier}
            group={group}
            onNavigate={onNavigate}
            onBuildCart={onBuildCart}
            actions={(
              <>
                <button className="crl-ghost-btn" type="button" onClick={() => copyGroup(group)}><Icon name="icon-clipboard" className="button-icon" />Copy order details</button>
                <a className="crl-ghost-btn" href={supplierSiteUrl(group.supplier)} target="_blank" rel="noreferrer"><Icon name="icon-store" className="button-icon" />Open website</a>
              </>
            )}
          />
        ))}
      </div>

      <footer className="ho-footer">
        <div className="ho-footer-copy">
          <strong>Order placed?</strong>
          <small>Save this list to your reorder history and start a fresh reorder list. This frozen handoff stays available.</small>
        </div>
        <button className="primary-action compact" type="button" onClick={onArchive}><Icon name="icon-clipboard" className="button-icon" />Save list &amp; start new</button>
      </footer>
    </div>
  );
}


export function ReorderHistoryView({ onOpen, onReopen, onDuplicate, onDelete, archivedLists = [] }) {
  // Show the buyer's real saved lists; fall back to the sample lists only when
  // there are none yet, so the page reads as designed for new accounts.
  const hasReal = archivedLists.length > 0;
  const lists = hasReal ? archivedLists : ARCHIVED_LISTS;
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title"><h2>Reorder history</h2></div>
      </header>
      <div className="history-list">
        {lists.map((list) => {
          const canManage = hasReal && Boolean(list.sourceItems?.length);
          return (
            <div className="history-row" key={list.id}>
              <button className="history-row-main" type="button" onClick={() => onOpen(list.id)}>
                <span className="history-icon"><Icon name="icon-clock" className="button-icon" /></span>
                <span className="history-info">
                  <strong>{list.name}</strong>
                  <small>Saved {list.date} · {list.items} items · {list.suppliers} suppliers</small>
                </span>
                <ListStatusPill status={list.status} />
                <span className="history-total">{list.total}</span>
              </button>
              <div className="history-row-actions">
                {canManage ? (
                  <>
                    <button className="history-action-btn" type="button" title="Reopen as current list" aria-label={`Reopen ${list.name}`} onClick={() => onReopen?.(list)}><Icon name="icon-edit" className="button-icon" /></button>
                    <button className="history-action-btn" type="button" title="Duplicate to a new list" aria-label={`Duplicate ${list.name}`} onClick={() => onDuplicate?.(list)}><Icon name="icon-file-plus" className="button-icon" /></button>
                    <button className="history-action-btn danger" type="button" title="Delete list" aria-label={`Delete ${list.name}`} onClick={() => onDelete?.(list)}><Icon name="icon-trash" className="button-icon" /></button>
                  </>
                ) : (
                  <Icon name="icon-chevron-right" className="button-icon history-chev" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function ReorderHistoryDetail({ id, onBack, archivedLists = [], handoffs = [], onRename, onReopen, onDuplicate, onDelete, onViewHandoff }) {
  const lists = [...archivedLists, ...ARCHIVED_LISTS];
  const list = lists.find((entry) => entry.id === id);
  // No silent fallback to another list: now that deletions propagate across
  // devices, the entry being viewed can vanish mid-view (or its URL can be
  // revisited later) — rendering a different list here would wire the rename
  // input and Delete button to the wrong entry.
  if (!list) {
    return (
      <div className="crl">
        <header className="crl-header">
          <div className="crl-title">
            <button className="history-back" type="button" onClick={onBack}><Icon name="icon-chevron-left" className="button-icon" />Reorder history</button>
            <h2>List not found</h2>
          </div>
        </header>
        <p className="history-detail-note">This saved list is no longer available — it may have been deleted or reopened as the current list on another device.</p>
      </div>
    );
  }
  const rows = list.rows || [];
  // Renaming only persists for real archived entries (not the demo samples).
  const isReal = archivedLists.some((entry) => entry.id === list.id);
  // Reopen/duplicate need the raw source items; demo samples (and lists saved
  // before the snapshot carried them) can't offer either — same gating as the
  // history rows, so the page never promises an action that dead-ends.
  const canRestore = isReal && Boolean(list.sourceItems?.length);
  const linkedHandoff = list.handoffId ? handoffs.find((h) => h.id === list.handoffId) : null;
  return (
    <div className="crl">
      <header className="crl-header">
        <div className="crl-title">
          <button className="history-back" type="button" onClick={onBack}><Icon name="icon-chevron-left" className="button-icon" />Reorder history</button>
          {isReal ? (
            <input
              className="history-rename-input"
              value={list.name}
              onChange={(event) => onRename?.(list.id, event.target.value)}
              aria-label="List name"
              style={{ width: `${Math.max(list.name.length, 8)}ch` }}
            />
          ) : (
            <h2>{list.name}</h2>
          )}
          <ListStatusPill status={list.status} />
        </div>
      </header>
      <div className="history-detail-stats">
        <div><small>Saved</small><strong>{list.date}</strong></div>
        <div><small>Items</small><strong>{list.items}</strong></div>
        <div><small>Suppliers</small><strong>{list.suppliers}</strong></div>
        <div><small>Total</small><strong>{list.total}</strong></div>
      </div>
      {rows.length > 0 && (
        <div className="crl-table history-detail-table">
          <div className="crl-row crl-row-head">
            <span>Item</span>
            <span>Status</span>
            <span>Qty</span>
            <span>Matched product</span>
            <span className="crl-price-h">Price</span>
          </div>
          {rows.map((row) => {
            const status = CRL_STATUS[row.status];
            const notFound = row.status === "Not found";
            return (
              <div className="crl-row" key={row.id}>
                <span className="crl-item">
                  <ProductThumb image={row.image} alt={row.canonicalName || row.importedName} />
                  <span className="crl-item-id">
                    <strong>{row.canonicalName || row.importedName}</strong>
                    {row.canonicalName && <small>From source: {row.importedName}</small>}
                  </span>
                </span>
                <span className={`crl-status ${status.cls}`}><Icon name={status.icon} className="button-icon" />{status.label}</span>
                <span className="crl-qty"><strong>{row.qty}</strong><small>{row.uom}</small></span>
                <span className="crl-match">
                  {notFound ? <strong>No match found</strong> : (<><strong>{row.matchName}</strong><MatchSupplier name={row.supplier !== "—" ? row.supplier : row.matchBrand} /></>)}
                </span>
                <span className="crl-price">
                  {notFound ? <span className="crl-dash">—</span> : row.priceMissing ? (<span className="crl-noprice">Price not listed<small>Login required</small></span>) : (<><strong>{mrMoney(row.price)}</strong>{showPerEa(row.perEa, row.price) && <small>${mrEa(row.perEa)} / ea</small>}</>)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="history-detail-note">This saved list is read-only.{canRestore ? " Reopen it to keep editing as your current list, or duplicate it to start a fresh copy" : ""}{linkedHandoff ? `${canRestore ? ", or" : " You can"} revisit the supplier handoff` : ""}{canRestore || linkedHandoff ? "." : ""}</p>
      <div className="history-detail-actions">
        {canRestore && (
          <>
            <button className="primary-action compact" type="button" onClick={() => onReopen?.(list)}><Icon name="icon-edit" className="button-icon" />Reopen as current list</button>
            <button className="secondary-action compact" type="button" onClick={() => onDuplicate?.(list)}><Icon name="icon-file-plus" className="button-icon" />Duplicate to new list</button>
          </>
        )}
        {linkedHandoff && (
          <button className="secondary-action compact" type="button" onClick={() => onViewHandoff?.(list.handoffId)}><Icon name="icon-handshake" className="button-icon" />View handoff</button>
        )}
        {isReal && (
          <button className="history-delete-btn" type="button" onClick={() => onDelete?.(list)}><Icon name="icon-trash" className="button-icon" />Delete list</button>
        )}
      </div>
    </div>
  );
}
