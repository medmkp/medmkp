"use client";

import { useState, useEffect, useRef } from "react";
import { BrandMark, Icon } from "./icons";
import { DEFAULT_BUYING_PREFS } from "./lib";
import { CurrentReorderList } from "./reorder";
import { ScanResultCard, useBarcodeScanner } from "./ui";

export function MobileScanItemView({ onBack, onScan, scanResult, onClearScanResult, scanCount }) {
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState("scan");
  const [captured, setCaptured] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const flashTimer = useRef();

  useEffect(() => {
    setIsMobile(window.matchMedia("(max-width: 767px)").matches);
  }, []);

  const { videoRef, cameraStatus, autoDetect, retry } = useBarcodeScanner({
    active: isMobile && mode === "scan",
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value) return;
    onScan?.(value);
    setManualCode("");
  }

  return (
    <section className={`mobile-scan-screen ${captured ? "scan-captured" : ""}`} aria-label="Scan barcodes">
      <div className="mobile-camera-stage">
        <video ref={videoRef} className="mobile-camera-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
        {cameraStatus !== "ready" && (
          <div className="camera-permission-state">
            <Icon name="icon-scan" className="mobile-control-icon" />
            <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
            <p>
              {cameraStatus === "requesting"
                ? "Allow camera access to scan item barcodes."
                : "Tap Try again to allow the camera, or use Enter code to key it in."}
            </p>
            {cameraStatus !== "requesting" && (
              <button type="button" className="camera-retry-btn" onClick={retry}>
                <Icon name="icon-refresh" className="button-icon" />
                Try again
              </button>
            )}
          </div>
        )}
        <div className="scan-instruction">
          {captured
            ? "Item added"
            : autoDetect
              ? "Point at a barcode"
              : "Live scanning isn’t supported here — tap Enter code"}
        </div>
        <div className="scan-frame" aria-hidden="true">
          <span className="corner top-left"></span>
          <span className="corner top-right"></span>
          <span className="corner bottom-left"></span>
          <span className="corner bottom-right"></span>
          <span className="scan-line"></span>
        </div>
        <ScanResultCard result={scanResult} className="floating" onClear={onClearScanResult} onEnterManually={() => setMode("manual")} />
      </div>

      <div className="scan-fs-top">
        <button className="scan-fs-close" type="button" onClick={onBack} aria-label="Close scanner">
          <Icon name="icon-x" className="scan-fs-close-icon" />
        </button>
        <button className="scan-fs-enter" type="button" onClick={() => setMode("manual")}>
          <Icon name="icon-plus-circle" className="button-icon" />
          Enter code
        </button>
      </div>

      <button
        className="scan-fs-review"
        type="button"
        onClick={onBack}
        aria-label={scanCount ? `Review ${scanCount} scanned item${scanCount === 1 ? "" : "s"}` : "Review reorder list"}
      >
        <Icon name="icon-scan" className="scan-fs-review-icon" />
        {scanCount > 0 && <span className="scan-fs-badge" aria-hidden="true">{scanCount > 99 ? "99+" : scanCount}</span>}
      </button>

      {mode === "manual" && (
        <div className="scan-fs-manual" role="dialog" aria-label="Enter barcode" aria-modal="true">
          <div className="scan-fs-manual-card">
            <header>
              <strong>Enter code</strong>
              <button type="button" onClick={() => setMode("scan")} aria-label="Back to camera">
                <Icon name="icon-x" className="button-icon" />
              </button>
            </header>
            <form onSubmit={submitManual}>
              <label className="mobile-manual-field">
                <Icon name="icon-scan" className="button-icon" />
                <input
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Enter barcode or SKU"
                  aria-label="Barcode or SKU"
                  value={manualCode}
                  onChange={(event) => setManualCode(event.target.value)}
                />
              </label>
              <button className="primary-action" type="submit" disabled={!manualCode.trim()}>
                <Icon name="icon-search" className="button-icon" />
                Look up
              </button>
            </form>
            <p className="mobile-manual-hint">Type the number printed under the barcode if the camera can’t read it.</p>
            <ScanResultCard result={scanResult} onClear={onClearScanResult} onEnterManually={() => setMode("manual")} />
          </div>
        </div>
      )}
    </section>
  );
}


export function MobileBottomNav({ view, onNavigate, onScan }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile primary navigation">
      <div className="m-nav-group">
        <button className={view === "home" ? "active" : ""} type="button" onClick={() => onNavigate("home")}>
          <span><Icon name="icon-home" className="mobile-bottom-icon" /></span>Home
        </button>
        <button className={view === "catalog" || view === "catalogCategory" ? "active" : ""} type="button" onClick={() => onNavigate("catalog")}>
          <span><Icon name="icon-grid" className="mobile-bottom-icon" /></span>Catalog
        </button>
      </div>
      <button className="m-nav-fab" type="button" aria-label="Scan barcode" onClick={onScan}>
        <Icon name="icon-scan" className="m-nav-fab-icon" />
      </button>
      <div className="m-nav-group">
        <button className={view === "history" ? "active" : ""} type="button" onClick={() => onNavigate("history")}>
          <span><Icon name="icon-clock" className="mobile-bottom-icon" /></span>Saved
        </button>
        <button className={view === "settings" ? "active" : ""} type="button" onClick={() => onNavigate("settings")}>
          <span><Icon name="icon-settings" className="mobile-bottom-icon" /></span>Settings
        </button>
      </div>
    </nav>
  );
}


export function LoggedOutLanding({ onNavigate, authed = false }) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
          <BrandMark />
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/pricing" onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>Pricing</a>
          <a href="/about" onClick={(event) => { event.preventDefault(); onNavigate("/about"); }}>About</a>
        </nav>
        <div className="landing-nav-actions">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
              <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <section className="landing-main">
        <div className="landing-copy">
          <h1>Scan your dental supplies and spot <span>possible savings</span> in seconds</h1>
          <p>Point your phone at a barcode or enter a SKU to identify the item, compare typical price ranges, and save it to a free starter reorder list. No login required to try it.</p>
          <div className="landing-actions">
            <button className="primary-action" type="button" onClick={() => onNavigate(authed ? "/app" : "/scan")}>
              <Icon name="icon-scan" className="button-icon" />
              Scan 3 items <em>FREE</em>
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/sample")}>
              <Icon name="icon-play" className="button-icon" />
              See sample result
            </button>
          </div>
          <div className="landing-assurances">
            <span ><Icon name="icon-lock" className="button-icon" style={{ background: '#5fc08a' }} />No login</span>
            <span><Icon name="icon-book" className="button-icon" />Dental supply catalog</span>
            <span><Icon name="icon-bolt" className="button-icon" />Fast barcode match</span>
          </div>
        </div>

        <div className="landing-col-left">
          <div className="landing-instant" id="what-you-get">
            <h3>What you&rsquo;ll see instantly</h3>
            <div className="instant-grid">
              <div>
                <Icon name="icon-check-circle" className="landing-instant-icon green" />
                <strong>Product match</strong>
                <span>High confidence<br />92%</span>
              </div>
              <div>
                <Icon name="icon-tag" className="landing-instant-icon" />
                <strong>Typical price range</strong>
                <span>$11.80 &ndash; $13.50<br />per bag</span>
              </div>
              <div>
                <Icon name="icon-shuffle" className="landing-instant-icon" />
                <strong>Possible lower-cost alternatives</strong>
                <span>See 3-6 matches</span>
              </div>
              <div>
                <Icon name="icon-list" className="landing-instant-icon" />
                <strong>Starter reorder list</strong>
                <span>Save items and build your list</span>
              </div>
            </div>
            <p className="landing-instant-note">
              <Icon name="icon-info" className="button-icon" />
              Exact savings require your invoice, last paid price, or office order history. Public scan results show benchmark estimates.
            </p>
          </div>
        </div>

        <div className="landing-col-right">
          <div className="landing-cta">
            <h2>Want office-specific savings?</h2>
            <div className="landing-cta-body">
              <div>
                <p>Upload one invoice or tell us your last paid price to unlock exact savings comparisons, reorder memory, and supplier-aware recommendations.</p>
                <div className="landing-actions">
                  <button className="primary-action" type="button" onClick={() => onNavigate("/signup")}>
                    <Icon name="icon-cloud-upload" className="button-icon" />
                    Start free
                  </button>
                  <button className="secondary-action" type="button" onClick={() => onNavigate("/about")}>
                    <Icon name="icon-chat" className="button-icon" />
                    Talk to us
                  </button>
                </div>
              </div>
              <Icon name="icon-clipboard" className="landing-cta-icon" />
            </div>
          </div>
        </div>

        <div className="landing-steps" id="how-it-works">
          <h2>How it works &mdash; 3 simple steps</h2>
          <div>
            <article>
              <span className="landing-step-number">1</span>
              <Icon name="icon-scan" className="landing-step-icon" />
              <strong>Scan a barcode</strong>
              <p>Use your phone camera to scan any product barcode.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">2</span>
              <Icon name="icon-chart" className="landing-step-icon" />
              <strong>See the item and benchmark</strong>
              <p>We identify the item and show typical price ranges and matches.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">3</span>
              <Icon name="icon-list" className="landing-step-icon" />
              <strong>Save it or continue free</strong>
              <p>Add it to your starter reorder list or keep scanning.</p>
            </article>
          </div>
        </div>
      </section>

      <footer className="trusted-strip">
        <div>
          <span><Icon name="icon-handshake" className="button-icon" />Works with Henry Schein, Patterson, Darby, and generic barcodes</span>
          <span><Icon name="icon-building" className="button-icon" />Built for dental offices<br /><small>Designed around how your office buys.</small></span>
        </div>
      </footer>
    </main>
  );
}

// Public, unauthenticated preview reached from "See sample result". Renders the
// real CurrentReorderList in its sample state (no items, untouched) inside a
// light public shell, so the demo matches the live app exactly. Actions that
// would mutate a real workspace (upload, scan, archive, clear) nudge the visitor
// to sign up; browsing the list and opening a row work so it feels live. /app
// itself stays auth-guarded — this is the only public window onto the list.

export function SampleReorderList({ onNavigate, authed = false }) {
  const sampleFormRef = useRef(null);
  const [prefs, setPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [toast, setToast] = useState("");
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  };
  const nudge = () => onNavigate("/signup");
  return (
    <div className="app-shell sample-shell">
      <header className="sample-topbar">
        <button className="topbar-brand" type="button" onClick={() => onNavigate("/")} aria-label="MedMKP home">
          <BrandMark />
        </button>
        <span className="sample-tag">Sample reorder list — explore freely</span>
        <div className="topbar-right">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
              <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up free</button>
            </>
          )}
        </div>
      </header>
      <div className="app-body">
        <main className="app-main">
          <CurrentReorderList
            items={[]}
            addMode=""
            onAddMode={nudge}
            lastUpload={null}
            onCloseUpload={() => {}}
            onUploadAnother={() => {}}
            uploadFormRef={sampleFormRef}
            onUpload={nudge}
            uploading={false}
            uploadProgress={0}
            uploadElapsed={0}
            uploadError=""
            onCancelUpload={() => {}}
            onClearUploadError={() => {}}
            isDraggingInvoice={false}
            onDragStateChange={() => {}}
            onInvoiceDrop={nudge}
            onInvoiceFile={nudge}
            selectedInvoiceName=""
            hasUploadedInvoice={false}
            onScan={nudge}
            searchTerm=""
            onSearchTerm={() => {}}
            searchResults={[]}
            searchLoading={false}
            onNavigate={onNavigate}
            onToast={showToast}
            listTouched={false}
            allowSample
            buyingPrefs={prefs}
            onBuyingPrefs={setPrefs}
            onArchiveList={nudge}
            onClearList={nudge}
          />
        </main>
      </div>
      <div className="sample-mobile-cta">
        <span>You&rsquo;re viewing a sample list</span>
        <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up free</button>
      </div>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

// The free, no-login scan funnel reached from the landing "Scan 3 items free"
// CTA. Reuses the real camera/decoder hook and ScanResultCard so a public scan
// looks exactly like the in-app one; the parent meters the free-scan budget and
// passes it in. When the budget is gone the signup wall slides over the card —
// the final result stays visible for a beat first so the visitor sees the payoff.

export function PublicScanView({ onScan, scanResult, onClearScanResult, freeScansUsed, limit, onSignup, onLogin, onHome, onApp, authed = false }) {
  const [manualCode, setManualCode] = useState("");
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();
  const exhausted = freeScansUsed >= limit;
  const remaining = Math.max(0, limit - freeScansUsed);

  // Hold the wall back briefly after the last scan so its result card is seen.
  const [gateVisible, setGateVisible] = useState(false);
  useEffect(() => {
    if (!exhausted) {
      setGateVisible(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGateVisible(true), 1500);
    return () => window.clearTimeout(timer);
  }, [exhausted]);

  const { videoRef, cameraStatus, autoDetect, capture, retry } = useBarcodeScanner({
    active: !exhausted,
    onScan: (code) => {
      onScan?.(code);
      setCaptured(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setCaptured(false), 700);
    },
  });

  function submitManual(event) {
    event.preventDefault();
    const value = manualCode.trim();
    if (!value || exhausted) return;
    onScan?.(value);
    setManualCode("");
  }

  return (
    <main className="pscan-page">
      <header className="pscan-header">
        <button className="landing-brand" type="button" onClick={onHome} aria-label="MedMKP home">
          <BrandMark />
        </button>
        <div className="pscan-header-actions">
          {authed ? (
            <button className="primary-action compact" type="button" onClick={onApp}>Go to my list</button>
          ) : (
            <>
              <button className="secondary-action compact" type="button" onClick={onLogin}>Log in</button>
              <button className="primary-action compact" type="button" onClick={onSignup}>Sign up</button>
            </>
          )}
        </div>
      </header>

      <section className="pscan-body">
        <div className="pscan-intro">
          <h1>Scan a product to see its price benchmark</h1>
          <p>Point your camera at any dental supply barcode &mdash; or key in the code &mdash; to identify the item and compare typical prices. {limit} scans free, no login required.</p>
        </div>

        <div className={`pscan-card ${captured ? "scan-captured" : ""}`}>
          <div className="pscan-stage">
            <video ref={videoRef} className="pscan-video" playsInline muted autoPlay aria-label="Live camera preview"></video>
            {cameraStatus !== "ready" && (
              <div className="pscan-permission">
                <Icon name="icon-scan" className="pscan-permission-icon" />
                <strong>{cameraStatus === "requesting" ? "Camera access needed" : "Camera unavailable"}</strong>
                <p>
                  {cameraStatus === "requesting"
                    ? "Allow camera access to scan a barcode, or type the code below."
                    : "Tap Try again to allow the camera, or type the code below."}
                </p>
                {cameraStatus !== "requesting" && (
                  <button type="button" className="camera-retry-btn" onClick={retry}>
                    <Icon name="icon-refresh" className="button-icon" />
                    Try again
                  </button>
                )}
              </div>
            )}
            <div className="pscan-frame" aria-hidden="true">
              <span className="corner top-left"></span>
              <span className="corner top-right"></span>
              <span className="corner bottom-left"></span>
              <span className="corner bottom-right"></span>
              <span className="scan-line"></span>
            </div>
            <div className="pscan-instruction">
              {captured
                ? "Got it"
                : autoDetect
                  ? "Point at a barcode"
                  : "Align the barcode, then tap Scan"}
            </div>
            <span className="pscan-counter">{remaining} of {limit} free scans left</span>
          </div>

          <div className="pscan-controls">
            <button
              className="pscan-shutter"
              type="button"
              onClick={capture}
              disabled={cameraStatus !== "ready" || exhausted}
            >
              <Icon name="icon-scan" className="button-icon" />
              Scan barcode
            </button>
            <form className="pscan-manual" onSubmit={submitManual}>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="…or enter a barcode / SKU"
                aria-label="Barcode or SKU"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                disabled={exhausted}
              />
              <button className="secondary-action" type="submit" disabled={!manualCode.trim() || exhausted}>
                Look up
              </button>
            </form>
          </div>

          <ScanResultCard result={scanResult} onClear={onClearScanResult} onEnterManually={() => {}} />
        </div>
      </section>

      {gateVisible && (
        <div className="pscan-gate" role="dialog" aria-modal="true" aria-label="Sign up to keep scanning">
          <div className="pscan-gate-card">
            <Icon name="icon-lock" className="pscan-gate-icon" />
            <h2>That&rsquo;s your {limit} free scans</h2>
            <p>Sign up free to keep scanning, save your reorder list, and compare prices across suppliers. Your scanned items are waiting in your list.</p>
            <button className="primary-action" type="button" onClick={onSignup}>
              <Icon name="icon-cloud-upload" className="button-icon" />
              Sign up free
            </button>
            <button className="secondary-action" type="button" onClick={onLogin}>Log in</button>
            <button className="pscan-gate-back" type="button" onClick={onHome}>Back to home</button>
          </div>
        </div>
      )}
    </main>
  );
}


export function PublicNav({ onNavigate, active, authed = false }) {
  return (
    <header className="landing-nav">
      <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
        <BrandMark />
      </a>
      <nav aria-label="Marketing navigation">
        <a href="/#how-it-works" onClick={(event) => { event.preventDefault(); onNavigate("/"); }}>How it works</a>
        <a href="/pricing" className={active === "pricing" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/pricing"); }}>Pricing</a>
        <a href="/about" className={active === "about" ? "active" : ""} onClick={(event) => { event.preventDefault(); onNavigate("/about"); }}>About</a>
      </nav>
      <div className="landing-nav-actions">
        {authed ? (
          <button className="primary-action compact" type="button" onClick={() => onNavigate("/app")}>Go to my list</button>
        ) : (
          <>
            <button className="secondary-action compact" type="button" onClick={() => onNavigate("/login")}>Log in</button>
            <button className="primary-action compact" type="button" onClick={() => onNavigate("/signup")}>Sign up</button>
          </>
        )}
      </div>
    </header>
  );
}


export function PricingPage({ onNavigate, authed = false }) {
  const tiers = [
    { name: "Starter", price: "Free", per: "", blurb: "For trying it out", cta: "Start free", to: "/signup", featured: false, features: ["Scan & search products", "1 reorder list", "Benchmark price ranges"] },
    { name: "Practice", price: "$199", per: "/mo", blurb: "For a single office", cta: "Start free trial", to: "/signup", featured: true, features: ["Unlimited reorder lists", "Invoice upload & matching", "Supplier handoffs", "Price alerts"] },
    { name: "Group", price: "Custom", per: "", blurb: "For multi-location groups", cta: "Contact sales", to: "/about", featured: false, features: ["Everything in Practice", "Multiple locations", "Team roles & approvals", "Priority support"] },
  ];
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="pricing" authed={authed} />
      <div className="public-body">
        <section className="public-hero">
          <h1>Simple pricing for dental offices</h1>
          <p>Start free. Upgrade when you&rsquo;re ready to optimize every reorder.</p>
        </section>
        <section className="pricing-tiers">
          {tiers.map((tier) => (
            <article className={`pricing-card ${tier.featured ? "featured" : ""}`} key={tier.name}>
              {tier.featured && <span className="pricing-badge">Most popular</span>}
              <h3>{tier.name}</h3>
              <div className="pricing-price"><strong>{tier.price}</strong>{tier.per && <small>{tier.per}</small>}</div>
              <p className="pricing-blurb">{tier.blurb}</p>
              <ul className="pricing-features">
                {tier.features.map((feature) => <li key={feature}><Icon name="icon-check" className="button-icon" />{feature}</li>)}
              </ul>
              <button className={tier.featured ? "primary-action" : "secondary-action"} type="button" onClick={() => onNavigate(tier.to)}>{tier.cta}</button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}


export function AboutPage({ onNavigate, authed = false }) {
  return (
    <main className="public-page">
      <PublicNav onNavigate={onNavigate} active="about" authed={authed} />
      <div className="public-body">
        <section className="public-hero">
          <h1>We help dental offices buy supplies smarter</h1>
          <p>MedMKP turns your invoices and barcodes into a clean, matched reorder list, so you can compare prices across suppliers and reorder in minutes instead of hours.</p>
        </section>
        <section className="about-grid">
          <div><Icon name="icon-scan" className="about-icon" /><strong>Scan or upload</strong><p>Capture items by barcode, photo, or invoice upload.</p></div>
          <div><Icon name="icon-shuffle" className="about-icon" /><strong>Match &amp; compare</strong><p>We match to a canonical catalog and surface the best-value supplier.</p></div>
          <div><Icon name="icon-handshake" className="about-icon" /><strong>Hand off &amp; reorder</strong><p>Group by supplier and hand off a ready-to-order plan.</p></div>
        </section>
        <section className="about-cta">
          <h2>Ready to try it?</h2>
          <button className="primary-action" type="button" onClick={() => onNavigate("/signup")}>Create your free account</button>
        </section>
      </div>
    </main>
  );
}


export function AuthShell({ subtitle, children, onNavigate }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="MedMKP home">
          <BrandMark />
        </a>
        {children}
      </div>
    </main>
  );
}


export function LoginPage({ onNavigate, onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not sign in.");
        return;
      }
      onAuthed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your MedMKP workspace." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-alt"><a href="/forgot-password" onClick={(event) => { event.preventDefault(); onNavigate("/forgot-password"); }}>Forgot your password?</a></p>
      <p className="auth-alt">New to MedMKP? <a href="/signup" onClick={(event) => { event.preventDefault(); onNavigate("/signup"); }}>Create an account</a></p>
    </AuthShell>
  );
}


export function SignupPage({ onNavigate, onAuthed }) {
  const [practiceName, setPracticeName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceName, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not create account.");
        return;
      }
      onAuthed();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Start optimizing your dental supply reorders." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label><span>Practice name</span><input type="text" placeholder="Bright Smiles Dental" value={practiceName} onChange={(event) => setPracticeName(event.target.value)} required /></label>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create account"}</button>
      </form>
      <p className="auth-alt">Already have an account? <a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>Log in</a></p>
    </AuthShell>
  );
}


export function ForgotPasswordPage({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* show the same neutral confirmation regardless of outcome */
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <AuthShell onNavigate={onNavigate}>
      {sent ? (
        <>
          <h1>Check your email</h1>
          <p className="auth-sub">
            If an account exists for {email}, we&apos;ve sent a link to reset your password.
            For your security, the link expires soon.
          </p>
          <button className="primary-action" type="button" style={{ marginTop: 20, width: "100%" }} onClick={() => onNavigate("/login")}>Back to sign in</button>
        </>
      ) : (
        <>
          <h1>Reset your password</h1>
          <p className="auth-sub">Enter your email and we&apos;ll send you a secure reset link.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</button>
          </form>
          <p className="auth-alt"><a href="/login" onClick={(event) => { event.preventDefault(); onNavigate("/login"); }}>Back to sign in</a></p>
        </>
      )}
    </AuthShell>
  );
}


export function ResetPasswordPage({ onNavigate }) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    setEmail((params.get("email") || "").toLowerCase());
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not reset your password.");
        return;
      }
      onNavigate("/login");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell onNavigate={onNavigate}>
      <h1>Set a new password</h1>
      {!token || !email ? (
        <>
          <p className="auth-sub">This reset link is invalid or incomplete. Please request a new one.</p>
          <button className="primary-action" type="button" style={{ marginTop: 20, width: "100%" }} onClick={() => onNavigate("/forgot-password")}>Request a new link</button>
        </>
      ) : (
        <>
          <p className="auth-sub">Choose a strong password for your account.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label><span>New password</span><input type="password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <label><span>Confirm password</span><input type="password" placeholder="Re-enter password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
            {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
            <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Updating…" : "Update password"}</button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

