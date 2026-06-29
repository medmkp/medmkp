"use client";

import { useState, useEffect, useRef } from "react";
import { BrandMark, Icon } from "./icons";
import { DEFAULT_BUYING_PREFS } from "./lib";
import { CurrentReorderList } from "./reorder";
import { ScanHandoffQr, ScanResultCard, useBarcodeScanner } from "./ui";

export function MobileScanItemView({ onBack, onReview, onScan, scanResult, onClearScanResult, scanCount }) {
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
        onClick={onReview}
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


export function LoggedOutLanding({ onNavigate, authed = false }) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="TraceDDS home">
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
          <h1>Scan your shelves. Trace every supply from <span>cabinet to audit</span>.</h1>
          <p>TraceDDS turns a quick barcode scan into a live inventory for your practice — what&rsquo;s on hand, what&rsquo;s running low, and what&rsquo;s about to expire. Lot numbers and SDS/IFU proof stay audit-ready. And it flags where you&rsquo;re overpaying.</p>
          <div className="landing-actions">
            <button className="primary-action" type="button" onClick={() => onNavigate(authed ? "/app" : "/scan")}>
              <Icon name="icon-scan" className="button-icon" />
              Scan an item <em>FREE</em>
            </button>
            <button className="secondary-action" type="button" onClick={() => onNavigate("/sample")}>
              <Icon name="icon-play" className="button-icon" />
              See a sample report
            </button>
          </div>
          <div className="landing-assurances">
            <span ><Icon name="icon-lock" className="button-icon" style={{ background: '#5fc08a' }} />No login to try</span>
            <span><Icon name="icon-clipboard-check" className="button-icon" />Tracks lots &amp; expirations</span>
            <span><Icon name="icon-shield-check" className="button-icon" />Built for dental audits</span>
          </div>
        </div>

        <div className="landing-col-left">
          <div className="landing-instant" id="what-you-get">
            <h3>What you&rsquo;ll see instantly</h3>
            <div className="instant-grid">
              <div>
                <Icon name="icon-check-circle" className="landing-instant-icon green" />
                <strong>Instant product match</strong>
                <span>High confidence<br />92%</span>
              </div>
              <div>
                <Icon name="icon-clipboard-check" className="landing-instant-icon" />
                <strong>Lot &amp; expiration capture</strong>
                <span>Flag expiring or expired stock</span>
              </div>
              <div>
                <Icon name="icon-shield-check" className="landing-instant-icon" />
                <strong>Compliance proof</strong>
                <span>Link SDS &amp; IFU for audits</span>
              </div>
              <div>
                <Icon name="icon-tag" className="landing-instant-icon" />
                <strong>Price benchmark</strong>
                <span>Typical range + lower-cost matches</span>
              </div>
            </div>
            <p className="landing-instant-note">
              <Icon name="icon-info" className="button-icon" />
              Full inventory, compliance tracking, and exact savings unlock when you add your practice. Public scans show the product, a benchmark price, and what TraceDDS captures.
            </p>
          </div>
        </div>

        <div className="landing-col-right">
          <div className="landing-cta">
            <h2>Turn one scan into your whole practice</h2>
            <div className="landing-cta-body">
              <div>
                <p>Add your office to build a live inventory across every operatory and cabinet — par levels that reorder before you run out, lot and expiration tracking, and an audit binder that&rsquo;s always current. Savings comparisons come standard.</p>
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
              <strong>Scan a shelf</strong>
              <p>Point your phone at any barcode. We identify the item and capture its lot and expiration.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">2</span>
              <Icon name="icon-map-pin" className="landing-step-icon" />
              <strong>Build your inventory</strong>
              <p>Every scan lands in a location &mdash; operatory, cabinet, steri &mdash; with on-hand counts and par levels.</p>
            </article>
            <Icon name="icon-arrow-right" className="landing-step-arrow" />
            <article>
              <span className="landing-step-number">3</span>
              <Icon name="icon-shield-check" className="landing-step-icon" />
              <strong>Stay ready</strong>
              <p>TraceDDS reorders before you run out, flags expiring stock, keeps your audit binder current &mdash; and shows where you&rsquo;re overpaying.</p>
            </article>
          </div>
        </div>
      </section>

      <footer className="trusted-strip">
        <div>
          <span><Icon name="icon-handshake" className="button-icon" />Works with Henry Schein, Patterson, Darby, Net32, and generic barcodes</span>
          <span><Icon name="icon-building" className="button-icon" />Built for dental offices<br /><small>And the audits they have to pass.</small></span>
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
        <button className="topbar-brand" type="button" onClick={() => onNavigate("/")} aria-label="TraceDDS home">
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

// The free, no-login scan funnel reached from the landing "Scan N items free"
// CTA. Reuses the real camera/decoder hook and ScanResultCard so a public scan
// looks exactly like the in-app one; the parent meters the free-scan budget and
// passes it in. When the budget is gone the signup wall slides over the card —
// the final result stays visible for a beat first so the visitor sees the payoff.

export function PublicScanView({ onScan, scanResult, onClearScanResult, itemsChecked = 0, onSignup, onLogin, onHome, onApp, authed = false }) {
  const [manualCode, setManualCode] = useState("");
  const [captured, setCaptured] = useState(false);
  const flashTimer = useRef();

  // Desktop default: hand scanning off to the buyer's phone via a QR (desktop
  // webcams read small item barcodes poorly), with a "use this computer's
  // camera" fallback. Mobile keeps the camera — the phone already is the camera.
  const [mode, setMode] = useState("camera"); // "qr" = phone handoff | "camera" = webcam
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    setIsDesktop(desktop);
    if (desktop) setMode("qr");
  }, []);
  const scanUrl = typeof window !== "undefined" ? `${window.location.origin}/scan` : "";

  const { videoRef, cameraStatus, autoDetect, capture, retry } = useBarcodeScanner({
    active: mode === "camera",
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
    <main className="pscan-page">
      <header className="pscan-header">
        <button className="landing-brand" type="button" onClick={onHome} aria-label="TraceDDS home">
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
          <p>
            {mode === "qr"
              ? <>Point your phone&rsquo;s camera at the code to open the scanner &mdash; phone cameras read item barcodes far better than a laptop webcam. Free to scan, no login required.</>
              : <>Point your camera at any dental supply barcode &mdash; or key in the code &mdash; to identify the item and compare typical prices. Free to scan, no login required.</>}
          </p>
        </div>

        {mode === "qr" ? (
          <div className="pscan-qr">
            <div className="scan-qr-code">
              <ScanHandoffQr url={scanUrl} />
            </div>
            <div className="scan-qr-side">
              <ol className="scan-qr-steps">
                <li><span>1</span> Open your phone&rsquo;s camera and point it at the code.</li>
                <li><span>2</span> Tap the link it shows to open the scanner on your phone.</li>
                <li><span>3</span> Scan any product&rsquo;s barcode to see its price benchmark.</li>
              </ol>
              <button type="button" className="scan-qr-camera-link" onClick={() => setMode("camera")}>
                <Icon name="icon-scan" className="button-icon" />
                Use this computer&rsquo;s camera instead
              </button>
            </div>
          </div>
        ) : (
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
            <span className="pscan-counter">{itemsChecked > 0 ? `${itemsChecked} item${itemsChecked === 1 ? "" : "s"} checked` : "Free to scan"}</span>
          </div>

          <div className="pscan-controls">
            <button
              className="pscan-shutter"
              type="button"
              onClick={capture}
              disabled={cameraStatus !== "ready"}
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
              />
              <button className="secondary-action" type="submit" disabled={!manualCode.trim()}>
                Look up
              </button>
            </form>
          </div>

          <ScanResultCard result={scanResult} onClear={onClearScanResult} onEnterManually={() => {}} />
          {isDesktop && (
            <button type="button" className="scan-qr-back pscan-qr-back" onClick={() => setMode("qr")}>
              <Icon name="icon-chevron-left" className="button-icon" />Scan with your phone instead
            </button>
          )}
        </div>
        )}
      </section>

    </main>
  );
}


export function PublicNav({ onNavigate, active, authed = false }) {
  return (
    <header className="landing-nav">
      <a className="landing-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="TraceDDS home">
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
          <h1>We help dental offices trace every supply &mdash; and stay audit-ready</h1>
          <p>TraceDDS turns a barcode scan into a live inventory: what&rsquo;s on hand, what&rsquo;s expiring, and the lot and compliance records you need when an inspector walks in. It flags where you&rsquo;re overpaying, too.</p>
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
        <a className="auth-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate("/"); }} aria-label="TraceDDS home">
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
    <AuthShell title="Welcome back" subtitle="Sign in to your TraceDDS workspace." onNavigate={onNavigate}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label><span>Email</span><input type="email" placeholder="you@practice.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="auth-error" style={{ color: "#c0392b", fontSize: "0.85rem", margin: 0 }}>{error}</p>}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-alt"><a href="/forgot-password" onClick={(event) => { event.preventDefault(); onNavigate("/forgot-password"); }}>Forgot your password?</a></p>
      <p className="auth-alt">New to TraceDDS? <a href="/signup" onClick={(event) => { event.preventDefault(); onNavigate("/signup"); }}>Create an account</a></p>
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

