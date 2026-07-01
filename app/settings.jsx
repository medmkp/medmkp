"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "./icons";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, ITEMS_PER_PAGE_OPTIONS, PRACTICE_PLAN_NAME, SETTINGS_TABS, SETTINGS_TAB_STUBS, TIMEZONE_OPTIONS, UOM_OPTIONS, US_STATES, billingMonthlyLabel, billingRenewalLabel, billingStatusDisplay, formFromMe, meFromForm } from "./lib";
import { BuyingPreferencesCard, MatchSupplier } from "./ui";

export function SettingsView({ me, initialTab = "profile", onMeUpdate, defaultBuyingPrefs, onSaveDefaults, supplierOptions = [], onToast }) {
  const [tab, setTab] = useState(initialTab);
  // Follow the caller's requested tab (e.g. the billing banner deep-links here).
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  return (
    <div className="settings-page">
      <header className="settings-head">
        <h2>Settings</h2>
      </header>
      <nav className="settings-tabs" aria-label="Settings sections">
        {SETTINGS_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`settings-tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "profile" ? (
        <ProfileSettings
          me={me}
          onMeUpdate={onMeUpdate}
          defaultBuyingPrefs={defaultBuyingPrefs}
          onSaveDefaults={onSaveDefaults}
          supplierOptions={supplierOptions}
          onToast={onToast}
        />
      ) : tab === "suppliers" ? (
        <SupplierLoginsSettings onToast={onToast} />
      ) : tab === "billing" ? (
        <BillingSettings me={me} onToast={onToast} />
      ) : (
        <SettingsComingSoon tab={tab} />
      )}
    </div>
  );
}


export function SettingsComingSoon({ tab }) {
  const stub = SETTINGS_TAB_STUBS[tab] || { icon: "icon-settings", title: "Coming soon", body: "This section isn't available yet." };
  return (
    <div className="settings-stub">
      <Icon name={stub.icon} className="settings-stub-icon" />
      <h3>{stub.title}</h3>
      <p>{stub.body}</p>
      <span className="settings-stub-badge">Coming soon</span>
    </div>
  );
}

// Plan & billing tab. Shows the practice's real plan + subscription status from
// `me.subscription` and routes to Stripe: paid practices open the Customer
// Portal ("Manage billing"), free practices start Checkout ("Upgrade to
// Practice"). When the backend doesn't report a subscription yet, the account
// reads as Free — the same graceful-degrade the billing banner uses.
export function BillingSettings({ me, onToast }) {
  const [busy, setBusy] = useState(false);
  const sub = me?.subscription || null;
  const isPaid = Boolean(sub);
  const status = billingStatusDisplay(sub?.status);
  const renews = billingRenewalLabel(sub?.renews_at);
  const price = billingMonthlyLabel(sub?.monthly_fee_cents);

  // Ask the backend for a Stripe URL, then hand off. On failure we surface a
  // toast rather than a dead click; nothing is mutated client-side.
  async function redirectTo(endpoint, label) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.url) {
        window.location.href = data.url;
        return; // leaving the page — keep the button in its busy state
      }
      onToast?.(data?.error || `Couldn’t open ${label}. Please try again.`);
    } catch {
      onToast?.(`Couldn’t open ${label}. Please try again.`);
    }
    setBusy(false);
  }

  const manageBilling = () => redirectTo("/api/billing/portal", "billing");
  const upgrade = () => redirectTo("/api/billing/checkout", "checkout");

  return (
    <section className="set-section">
      <div className="set-section-info">
        <h3>Plan &amp; billing</h3>
        <p>Manage your TraceDDS subscription, update your payment method, and download invoices.</p>
      </div>
      <div className="set-section-body">
        <div className="bill-card">
          <div className="bill-plan">
            <div className="bill-plan-head">
              <span className="bill-plan-name">{isPaid ? PRACTICE_PLAN_NAME : "Free"}</span>
              {status && <span className={`bill-badge bill-badge-${status.tone}`}>{status.label}</span>}
            </div>
            <p className="bill-plan-meta">
              {isPaid
                ? (renews ? `${price} · Renews ${renews}` : price)
                : "Invoice matching and live per-unit savings are Practice features."}
            </p>
          </div>
          {isPaid ? (
            <button className="primary-action compact" type="button" onClick={manageBilling} disabled={busy}>
              <Icon name="icon-credit-card" className="button-icon" />{busy ? "Opening…" : "Manage billing"}
            </button>
          ) : (
            <button className="primary-action compact" type="button" onClick={upgrade} disabled={busy}>
              <Icon name="icon-bolt" className="button-icon" />{busy ? "Redirecting…" : "Upgrade to Practice"}
            </button>
          )}
        </div>
        <p className="settings-hint bill-hint">
          {isPaid
            ? "Manage billing opens the secure Stripe portal, where you can update your card, view past invoices, or cancel."
            : "Upgrade unlocks invoice matching, live per-unit savings, and automated cart building — $149/mo per location, billed by Stripe."}
        </p>
      </div>
    </section>
  );
}

// Manage the per-supplier logins the headless buying agent uses to build carts.
// Passwords are write-only — the API only ever returns a masked username hint.

export function SupplierLoginsSettings({ onToast }) {
  const [suppliers, setSuppliers] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ supplier_id: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);

  function refresh() {
    return fetch("/api/supplier-credentials")
      .then((r) => (r.ok ? r.json() : { credentials: [] }))
      .then(({ credentials }) => setCredentials(credentials || []))
      .catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/suppliers").then((r) => (r.ok ? r.json() : { suppliers: [] })),
      fetch("/api/supplier-credentials").then((r) => (r.ok ? r.json() : { credentials: [] })),
    ])
      .then(([s, c]) => {
        if (cancelled) return;
        setSuppliers(s.suppliers || []);
        setCredentials(c.credentials || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || id;

  function save(e) {
    e.preventDefault();
    if (!form.supplier_id || !form.username || !form.password) {
      onToast("Pick a supplier and enter a username and password");
      return;
    }
    setSaving(true);
    fetch("/api/supplier-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { onToast(data?.error || "Couldn’t save login"); return; }
        onToast(`Saved your ${supplierName(form.supplier_id)} login`);
        setForm({ supplier_id: "", username: "", password: "" });
        return refresh();
      })
      .catch(() => onToast("Couldn’t save login"))
      .finally(() => setSaving(false));
  }

  function remove(supplierId) {
    fetch("/api/supplier-credentials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: supplierId }),
    })
      .then(() => { onToast(`Removed your ${supplierName(supplierId)} login`); return refresh(); })
      .catch(() => onToast("Couldn’t remove login"));
  }

  return (
    <div className="settings-section supplier-logins">
      <div className="settings-card">
        <h3>Supplier logins</h3>
        <p className="settings-hint">
          Save your supplier account logins and we’ll build your carts for you — we sign in and add
          every item, so you just review and check out. Passwords are encrypted and never shown back.
        </p>

        {loading ? (
          <div className="cart-status"><span className="cart-spinner" aria-hidden="true" />Loading…</div>
        ) : (
          <>
            {credentials.length > 0 && (
              <ul className="cred-list">
                {credentials.map((c) => (
                  <li className="cred-row" key={c.supplier_id}>
                    <div className="cred-supplier"><MatchSupplier name={supplierName(c.supplier_id)} /></div>
                    <span className="cred-hint">{c.username_hint}</span>
                    <span className={`cred-status cred-status-${c.last_status}`}>
                      {c.last_status === "ok" ? "Verified" : c.last_status === "auth_failed" ? "Login failed" : c.last_status === "error" ? "Last build errored" : "Not yet used"}
                    </span>
                    <button className="crl-ghost-btn cred-remove" type="button" onClick={() => remove(c.supplier_id)}>
                      <Icon name="icon-trash" className="button-icon" />Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form className="cred-form" onSubmit={save}>
              <h4>{credentials.length ? "Add another login" : "Add a supplier login"}</h4>
              <label>
                <span>Supplier</span>
                <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Username or email</span>
                <input type="text" autoComplete="off" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="you@practice.com" />
              </label>
              <label>
                <span>Password</span>
                <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </label>
              <button className="primary-action compact" type="submit" disabled={saving}>
                <Icon name="icon-lock" className="button-icon" />{saving ? "Saving…" : "Save login"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}


export function ProfileSettings({ me, onMeUpdate, defaultBuyingPrefs, onSaveDefaults, supplierOptions, onToast }) {
  const [form, setForm] = useState(() => formFromMe(me));
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  // Keep the form in sync with the server identity until the buyer starts
  // editing; after that, their in-progress edits win (no clobber on refetch).
  useEffect(() => {
    if (!dirtyRef.current) setForm(formFromMe(me));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
    setSaveStatus("idle");
  }
  function setField(key, value) {
    markDirty();
    setForm((current) => ({ ...current, [key]: value }));
  }
  function setPref(key, value) {
    markDirty();
    setForm((current) => ({ ...current, prefs: { ...current.prefs, [key]: value } }));
  }

  // Explicit save of profile + address + preferences.
  async function save() {
    if (!me || !dirty) return;
    setSaveStatus("saving");
    const payload = {
      customer: { first_name: form.first_name, last_name: form.last_name, phone: form.phone },
      practice: {
        name: form.name,
        ship_address_line1: form.ship_address_line1,
        ship_address_line2: form.ship_address_line2,
        ship_city: form.ship_city,
        ship_state: form.ship_state,
        ship_zip: form.ship_zip,
        ship_country: form.ship_country,
        shipping_notes: form.shipping_notes,
        use_as_billing: form.use_as_billing,
        preferences: form.prefs,
      },
    };
    try {
      const response = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save failed");
      dirtyRef.current = false;
      setDirty(false);
      setSaveStatus("saved");
      onMeUpdate?.(meFromForm(form, me));
      onToast?.("Settings saved");
    } catch {
      setSaveStatus("error");
    }
  }

  return (
    <>
      <section className="set-section">
        <div className="set-section-info">
          <h3>Profile information</h3>
          <p>Update your personal information and how we contact you.</p>
        </div>
        <div className="set-section-body">
          <div className="set-grid cols-2">
            <label className="set-field">
              <span>First name</span>
              <input type="text" value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} />
            </label>
            <label className="set-field">
              <span>Last name</span>
              <input type="text" value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} />
            </label>
            <label className="set-field">
              <span>Work email</span>
              <input type="email" value={form.email} readOnly title="Your login email — contact support to change it." />
            </label>
            <label className="set-field">
              <span>Phone number</span>
              <input type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="(212) 555-0187" />
            </label>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="set-section-info">
          <h3>Default shipping address</h3>
          <p>This address will be used to calculate shipping costs and delivery estimates.</p>
        </div>
        <div className="set-section-body">
          <div className="set-ship">
            <div className="set-ship-main">
              <label className="set-field">
                <span>Company / Practice name</span>
                <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </label>
              <label className="set-field">
                <span>Address line 1</span>
                <input type="text" value={form.ship_address_line1} onChange={(e) => setField("ship_address_line1", e.target.value)} />
              </label>
              <label className="set-field">
                <span>Address line 2 <em>(optional)</em></span>
                <input type="text" value={form.ship_address_line2} onChange={(e) => setField("ship_address_line2", e.target.value)} />
              </label>
              <div className="set-grid cols-3">
                <label className="set-field">
                  <span>City</span>
                  <input type="text" value={form.ship_city} onChange={(e) => setField("ship_city", e.target.value)} />
                </label>
                <label className="set-field">
                  <span>State / Province</span>
                  <select value={form.ship_state} onChange={(e) => setField("ship_state", e.target.value)}>
                    <option value="">—</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="set-field">
                  <span>ZIP / Postal code</span>
                  <input type="text" value={form.ship_zip} onChange={(e) => setField("ship_zip", e.target.value)} />
                </label>
              </div>
              <label className="set-field">
                <span>Country</span>
                <select value={form.ship_country} onChange={(e) => setField("ship_country", e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="set-check">
                <input type="checkbox" checked={form.use_as_billing} onChange={(e) => setField("use_as_billing", e.target.checked)} />
                <span>
                  Use as billing address
                  <small>Billing address is used for invoices and tax calculations.</small>
                </span>
              </label>
            </div>
            <div className="set-ship-aside">
              <label className="set-field">
                <span>Shipping notes <em>(optional)</em></span>
                <textarea
                  rows={4}
                  maxLength={200}
                  value={form.shipping_notes}
                  onChange={(e) => setField("shipping_notes", e.target.value)}
                  placeholder="e.g., Gate code, suite number, receiving hours, etc."
                />
                <small className="set-counter">{form.shipping_notes.length} / 200</small>
              </label>
            </div>
          </div>
        </div>
      </section>

      <ChangePasswordSection onToast={onToast} />

      <section className="set-section">
        <div className="set-section-info">
          <h3>Preferences</h3>
          <p>Set your default preferences for a better shopping experience.</p>
        </div>
        <div className="set-section-body">
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Default currency</span>
              <select value={form.prefs.currency} onChange={(e) => setPref("currency", e.target.value)}>
                {CURRENCY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="set-field">
              <span>Items per page</span>
              <select value={form.prefs.itemsPerPage} onChange={(e) => setPref("itemsPerPage", e.target.value)}>
                {ITEMS_PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="set-field">
              <span>Default UOM</span>
              <select value={form.prefs.defaultUom} onChange={(e) => setPref("defaultUom", e.target.value)}>
                {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Timezone</span>
              <select value={form.prefs.timezone} onChange={(e) => setPref("timezone", e.target.value)}>
                {TIMEZONE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="set-toggles">
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.emailOrderConfirmations} onChange={(e) => setPref("emailOrderConfirmations", e.target.checked)} />
              <span>Email me order confirmations</span>
            </label>
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.emailBackInStock} onChange={(e) => setPref("emailBackInStock", e.target.checked)} />
              <span>Email me when items are back in stock</span>
            </label>
            <label className="set-check">
              <input type="checkbox" checked={form.prefs.showPricingWithTax} onChange={(e) => setPref("showPricingWithTax", e.target.checked)} />
              <span>Show pricing with tax (if applicable)</span>
            </label>
          </div>
        </div>
      </section>

      <section className="set-section">
        <div className="set-section-info">
          <h3>Default buying preferences</h3>
          <p>New reorder lists start from these defaults. You can still tweak them per list on Home.</p>
        </div>
        <div className="set-section-body">
          <BuyingPreferencesCard
            title="Default Buying Preferences"
            savedMessage="Default preferences saved"
            prefs={defaultBuyingPrefs}
            supplierOptions={supplierOptions}
            onSave={onSaveDefaults}
            onToast={onToast}
          />
        </div>
      </section>

      <footer className="settings-foot">
        <span className={`settings-savestate ${saveStatus}`}>
          {saveStatus === "saving" && "Saving…"}
          {saveStatus === "saved" && !dirty && "All changes saved"}
          {saveStatus === "error" && "Couldn't save — please try again"}
          {dirty && saveStatus !== "saving" && "You have unsaved changes"}
        </span>
        <div className="settings-foot-actions">
          <button className="primary-action compact" type="button" onClick={save} disabled={!dirty || saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </footer>
    </>
  );
}


export function ChangePasswordSection({ onToast }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not update your password.");
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      onToast?.("Password updated");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="set-section">
      <div className="set-section-info">
        <h3>Change password</h3>
        <p>Choose a strong password to keep your account secure.</p>
      </div>
      <div className="set-section-body">
        <form className="set-pw-form" onSubmit={submit}>
          <div className="set-grid cols-3">
            <label className="set-field">
              <span>Current password</span>
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="set-field">
              <span>New password</span>
              <div className="set-input-wrap">
                <input type={showNext ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                <button type="button" className="set-eye" aria-label={showNext ? "Hide password" : "Show password"} onClick={() => setShowNext((v) => !v)}>
                  <Icon name={showNext ? "icon-eye-off" : "icon-eye"} className="button-icon" />
                </button>
              </div>
            </label>
            <label className="set-field">
              <span>Confirm new password</span>
              <div className="set-input-wrap">
                <input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <button type="button" className="set-eye" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm((v) => !v)}>
                  <Icon name={showConfirm ? "icon-eye-off" : "icon-eye"} className="button-icon" />
                </button>
              </div>
            </label>
          </div>
          {error && <p className="set-pw-error">{error}</p>}
          <div className="set-pw-actions">
            <button className="primary-action compact" type="submit" disabled={submitting || !current || !next || !confirm}>
              {submitting ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

