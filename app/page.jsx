"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CatalogCategoryView, CatalogSearchView, CatalogSupplierView, CatalogView, ProductDetail, SearchResults } from "./catalog";
import { BrandMark, Icon, IconSprite } from "./icons";
import { APP_STATE_KEY, DEFAULT_BUYING_PREFS, FREE_SCAN_KEY, FREE_SCAN_LIMIT, NAV_COLLAPSED_KEY, SHOPIFY_STOCK_MAX_ITEMS, SHOPIFY_STOCK_SESSION_KEY, UPLOAD_TIMEOUT_MS, applyLiveStock, buildShippingByName, computePlanTotals, deriveListStatus, deriveMatchRows, groupRowsBySupplier, isPlanIncluded, lookupScannedProduct, makeScanDraftItem, mapSearchOffer, mergeDraftState, money, newItemId, parseAttributes, pathForView, shopifyStockKey, slimHandoffRow, statusFromItem, traceApi, viewFromPath } from "./lib";
import { AddLocationView, LocationDetailView, LocationsBoardView } from "./locations";
import { ScanSessionsView, ScanSessionView } from "./scansessions";
import { MobileBottomNav, MobileMoreSheet } from "./mobilebottom";
import { MobileTodayView } from "./mobiletoday";
import { EvidenceView, EvidenceBinderView } from "./evidence";
import { NeedsAttentionView, NEEDS_ATTENTION_BADGE } from "./needsattention";
import { AboutPage, ForgotPasswordPage, LoggedOutLanding, LoginPage, MobileScanItemView, PricingPage, PublicScanView, ResetPasswordPage, SampleReorderList, SignupPage } from "./marketing";
import { CartBuilderModal, HistoryDetail, HistoryView, ProcurementPlanView, SupplierHandoffView } from "./procurement";
import { CurrentReorderList, SavingsView } from "./reorder";
import { SettingsView } from "./settings";
import StyleGuide from "./styleguide";
import { ConfirmModal } from "./ui";

export default function Home() {
  const uploadFormRef = useRef(null);
  const searchRef = useRef(null);
  const searchWrapRef = useRef(null);
  const userWrapRef = useRef(null);
  const alertsWrapRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [view, setViewState] = useState("landing");
  const [historyId, setHistoryId] = useState(null);
  const [selectedHandoffId, setSelectedHandoffId] = useState(null);
  const [productHandle, setProductHandle] = useState(null);
  const [categorySlug, setCategorySlug] = useState(null);
  const [supplierId, setSupplierId] = useState(null);
  const [locationId, setLocationId] = useState(null);
  const [scanSessionId, setScanSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Whether the mobile "More" overflow sheet is open (the bottom nav itself is
  // persistent; its active tab is derived from `view`, not stored).
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadElapsed, setUploadElapsed] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadAbortRef = useRef(null);
  const uploadCancelledRef = useRef(false);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");
  const [hasUploadedInvoice, setHasUploadedInvoice] = useState(false);
  const [mobileAddItemRoute, setMobileAddItemRoute] = useState(false);
  const [addMode, setAddMode] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [freeScansUsed, setFreeScansUsed] = useState(0);
  const [lastUpload, setLastUpload] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [canonicalResults, setCanonicalResults] = useState([]);
  const [canonicalSource, setCanonicalSource] = useState("idle");
  const [searchLoading, setSearchLoading] = useState(false);
  const [archivedLists, setArchivedLists] = useState([]);
  // Pending confirmation for a destructive whole-list action (archive / clear).
  // Null when no dialog is open; otherwise holds the modal copy + onConfirm.
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [handoffs, setHandoffs] = useState([]);
  // Id of the handoff prepared for the live list, or null. Drives the live
  // list's "Handed off" status and links the archive entry to its handoff.
  const [currentHandoffId, setCurrentHandoffId] = useState(null);
  // Whether the buyer has deliberately advanced the list from "draft" to
  // "review" (the Review & optimize gate). The pill state is still *derived* —
  // this only "sticks" while every item is reviewed (see deriveListStatus + the
  // auto-revert effect below), so the pill can never overstate the list.
  const [listStage, setListStage] = useState("draft");
  const [cartGroup, setCartGroup] = useState(null);
  // Suppliers (by display name) the buyer has confirmed they've placed an order
  // with for the current list. Drives the Review view's collapsed "Order
  // submitted" state; cleared when the list is archived or cleared.
  const [submittedSuppliers, setSubmittedSuppliers] = useState([]);
  const [liveStockByUrl, setLiveStockByUrl] = useState({});
  const liveStockCacheRef = useRef(new Map());
  const liveStockHydratedRef = useRef(false);
  const liveStockRequestsRef = useRef(new Set());
  const [listTouched, setListTouched] = useState(false);
  const [listName, setListName] = useState("June Restock");
  const [buyingPrefs, setBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [defaultBuyingPrefs, setDefaultBuyingPrefs] = useState(DEFAULT_BUYING_PREFS);
  const [supplierOptions, setSupplierOptions] = useState([]);
  // Per-supplier shipping policy keyed by normalized supplier name, used to
  // estimate landed cost on the reorder list. Empty until /api/suppliers loads.
  const [supplierShipping, setSupplierShipping] = useState({});
  const [stateLoaded, setStateLoaded] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const serverLoadStartedRef = useRef(false);
  const saveTimerRef = useRef(null);
  // Holds the most recent state blob (mirrors the debounced save). Lets
  // refreshFromServer merge against the freshest local items, so a manual
  // refresh can't drop items the debounced save hasn't persisted yet.
  const latestBlobRef = useRef(null);
  // True while a debounced save is queued but not yet sent. Lets the
  // pagehide/visibilitychange flush know there are unsaved edits to push.
  const pendingSaveRef = useRef(false);
  // updated_at of the server state we last applied. The 3s poll sends it as
  // ?since= so an unchanged list is a cheap no-op; our own writes bump it, so the
  // next poll re-fetches and re-applies (harmless, and pulls any concurrent edit).
  const lastServerVersionRef = useRef(null);

  // Apply a saved app-state blob (from localStorage or the per-practice server
  // store) to component state.
  const hydrateFromState = (saved) => {
    if (!saved) return;
    const savedDefaults = { ...DEFAULT_BUYING_PREFS, ...(saved.defaultBuyingPrefs || {}) };
    // Backfill ids on lists saved before stable ids existed, so verification
    // decisions have a row to write back to.
    const items = (saved.draftItems || []).map((item) => (item.id ? item : { ...item, id: newItemId() }));
    setDraftItems(items);
    // Removed/cleared items linger as tombstones (included:false) so the deletion
    // survives the cross-device merge; they don't count toward "is this list in
    // progress", so a cleared list reloads as empty.
    const activeCount = items.filter((item) => item.included !== false).length;
    setUploadedDocs(saved.uploadedDocs || []);
    setArchivedLists(saved.archivedLists || []);
    setHandoffs(saved.handoffs || []);
    setCurrentHandoffId(saved.currentHandoffId || null);
    setSubmittedSuppliers(saved.submittedSuppliers || []);
    setListStage(saved.listStage === "review" ? "review" : "draft");
    setListTouched(Boolean(saved.listTouched));
    if (saved.listName) setListName(saved.listName);
    setDefaultBuyingPrefs(savedDefaults);
    // A list with no items is "new", so it starts from the saved defaults;
    // an in-progress list keeps its own working preferences.
    setBuyingPrefs(activeCount ? { ...DEFAULT_BUYING_PREFS, ...(saved.buyingPrefs || {}) } : savedDefaults);
    if (activeCount) setHasUploadedInvoice(true);
  };

  // Hydrate from localStorage first for an instant paint; the per-practice
  // server store (loaded below once auth is known) takes over for cross-device
  // sync. localStorage stays as an offline cache + migration source.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
      if (saved) hydrateFromState(saved);
    } catch {
      // ignore corrupt state
    }
    try {
      const used = parseInt(window.localStorage.getItem(FREE_SCAN_KEY) || "0", 10);
      if (Number.isFinite(used) && used > 0) setFreeScansUsed(used);
    } catch {
      // ignore corrupt state
    }
    try {
      if (window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1") setNavCollapsed(true);
    } catch {
      // ignore corrupt state
    }
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the phone breakpoint so the home view can render scan-first on mobile.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Persist the sidebar collapse preference per-device.
  useEffect(() => {
    if (!stateLoaded) return;
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      // storage unavailable — non-fatal
    }
  }, [stateLoaded, navCollapsed]);

  // Server-authoritative load: the practice's stored list is the single source
  // of truth. Merge the local cache into it once (so a list started offline or
  // on another tab isn't lost), push the union up, then let the 3s poll keep
  // this device in sync. `mergeDraftState(server, local)` keeps the server's
  // scalars (name/prefs) while reconciling items by the one shared rule.
  useEffect(() => {
    if (authed !== true || serverLoadStartedRef.current) return;
    serverLoadStartedRef.current = true;
    (async () => {
      try {
        const response = await fetch(`/api/reorder-list?t=${Date.now()}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const local = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
        if (data && data.state) {
          const merged = mergeDraftState(data.state, local);
          hydrateFromState(merged);
          lastServerVersionRef.current = data.updated_at || null;
          // Push the union only when this device's cache had items, so any
          // local-only work reaches the other devices. The server merge makes it
          // a no-op when local added nothing; skip it entirely on a fresh device.
          if (local && (local.draftItems || []).length) saveNow(merged);
        } else if (local && (local.draftItems || []).some((it) => it.included !== false)) {
          // No server list yet — seed it from the local working list.
          saveNow(local);
        }
      } catch {
        // offline / server down — keep whatever localStorage hydrated.
      }
      setServerReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Live cross-device propagation: while signed in and the tab is visible, poll
  // the server every 3s (the same pattern the paired-scan view uses) and apply
  // any change through the one merge rule. `?since=` makes an unchanged list a
  // cheap no-op. This is what makes a phone scan / delete show up on the desktop
  // on its own — no manual refresh, no debounce-vs-refresh race.
  useEffect(() => {
    if (authed !== true || !serverReady) return;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const since = lastServerVersionRef.current;
        // The unique `t` defeats iOS Safari's habit of serving a cached response
        // for a repeated GET even with cache:"no-store" — without it the phone's
        // poll keeps getting the same stale list and never sees desktop changes.
        const url = `/api/reorder-list?t=${Date.now()}${since ? `&since=${encodeURIComponent(since)}` : ""}`;
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (data.unchanged || !data.state) return;
        lastServerVersionRef.current = data.updated_at || lastServerVersionRef.current;
        const local = latestBlobRef.current || JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
        hydrateFromState(mergeDraftState(local, data.state));
      } catch {
        // transient network error — the next tick retries
      }
    };
    const id = window.setInterval(tick, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, serverReady]);

  // One-time backfill of the catalog brand for matched-but-offer-less items
  // (e.g. Henry Schein, which has no purchasable offer). Lists saved before the
  // brand was captured at scan time still need it so the row can show the
  // supplier logo. Looks up each item's canonical product once and patches in
  // its brand.
  const brandBackfillRef = useRef(false);
  useEffect(() => {
    if (brandBackfillRef.current) return;
    const needs = draftItems.filter((it) =>
      it.canonicalHandle && !it.matchBrand && !it.bestOffer && !(it.offers && it.offers.length));
    if (!needs.length) return;
    brandBackfillRef.current = true;
    (async () => {
      const updates = {};
      await Promise.all(needs.map(async (it) => {
        try {
          const r = await fetch(`/api/canonical-products?handle=${encodeURIComponent(it.canonicalHandle)}`);
          const d = await r.json();
          const brand = parseAttributes(d.canonical_products?.[0]?.attributes_text).brands?.[0];
          if (brand) updates[it.id] = brand;
        } catch {
          // best-effort — a failed lookup just leaves the logo absent
        }
      }));
      if (Object.keys(updates).length) {
        setDraftItems((items) => items.map((it) => (updates[it.id] ? { ...it, matchBrand: updates[it.id] } : it)));
      }
    })();
  }, [draftItems]);

  useEffect(() => {
    if (!stateLoaded) return;
    const blob = { draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, submittedSuppliers, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs };
    latestBlobRef.current = blob;
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(blob));
    } catch {
      // storage full / unavailable — non-fatal
    }
    // Mirror each change to the server promptly. The short window only coalesces
    // a burst (e.g. rapid scans) into one PUT; it still lands well inside the 3s
    // poll cycle. The server merges, so this is never a destructive overwrite.
    // Gated on serverReady so a save can't race ahead of the initial load.
    if (authed === true && serverReady) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = true;
      saveTimerRef.current = setTimeout(() => {
        pendingSaveRef.current = false;
        saveNow(blob);
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLoaded, draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, submittedSuppliers, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs, authed, serverReady]);

  // Flush a pending (debounced) save when the tab is hidden or unloaded, so a
  // refresh/close within the debounce window can't drop the latest edits.
  // Deliberately NOT `keepalive`: the app-state blob (archived lists + handoffs
  // accumulate) can exceed the 64KB keepalive body cap, which fails the request
  // outright with "Failed to fetch". A normal same-origin PUT completes fine on
  // tab-hide; the rare true-unload case is the only gap, and keepalive couldn't
  // cover it past 64KB anyway. localStorage still holds the blob for next load.
  // pagehide covers the bfcache and mobile-Safari cases beforeunload misses.
  useEffect(() => {
    if (authed !== true) return;
    const flush = () => {
      if (!pendingSaveRef.current || !latestBlobRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      try {
        fetch("/api/reorder-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(latestBlobRef.current),
        }).catch(() => {});
        pendingSaveRef.current = false;
      } catch {
        // best-effort; localStorage still holds the blob for next load
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      } else {
        // Tab back in focus (e.g. switching phone -> desktop mid-demo): pull the
        // latest so cross-device scans/clears appear without a manual refresh.
        // refreshFromServer flushes any pending local edits before reading back.
        refreshFromServer();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Supplier names for the preferred-supplier picker, plus each supplier's
  // shipping policy for landed-cost estimates on the reorder list.
  useEffect(() => {
    fetch("/api/suppliers")
      .then((response) => response.json())
      .then(({ suppliers }) => {
        const list = suppliers || [];
        setSupplierOptions(list.map((supplier) => supplier.name));
        setSupplierShipping(buildShippingByName(list));
      })
      .catch(() => {
        setSupplierOptions([]);
        setSupplierShipping({});
      });
  }, []);

  useEffect(() => {
    function syncViewFromLocation() {
      const nextRoute = viewFromPath(window.location.pathname + window.location.search);
      setIsLoggedIn(nextRoute.isLoggedIn);
      setViewState(nextRoute.view);
      setHistoryId(nextRoute.historyId || null);
      setSelectedHandoffId(nextRoute.handoffId || null);
      setProductHandle(nextRoute.productHandle || null);
      setCategorySlug(nextRoute.categorySlug || null);
      setSupplierId(nextRoute.supplierId || null);
      setLocationId(nextRoute.locationId || null);
      setScanSessionId(nextRoute.scanSessionId || null);
      setSearchQuery(nextRoute.searchQuery || "");
      setMobileAddItemRoute(Boolean(nextRoute.mobileAddItemRoute));
      setMenuOpen(false);
    }

    syncViewFromLocation();
    window.addEventListener("popstate", syncViewFromLocation);

    return () => window.removeEventListener("popstate", syncViewFromLocation);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        setAuthed(Boolean(data.authenticated));
        setMe(data.authenticated ? { customer: data.customer || null, practice: data.practice || null } : null);
      })
      .catch(() => setAuthed(false));
  }, []);

  // Keep unauthenticated visitors out of the authenticated app routes, and send
  // already-signed-in visitors from the public free-scan page into the real app.
  useEffect(() => {
    if (authed === false && isLoggedIn) {
      navigate("/login");
    } else if (authed === true && view === "publicScan") {
      navigate("/app");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, isLoggedIn, view]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then(({ categories }) => {
        setCatalog(categories || []);
      })
      .catch(() => {
        setCatalog([]);
      });
  }, []);

  useEffect(() => {
    const query = searchTerm.trim();
    if (!query) {
      setCanonicalResults([]);
      setCanonicalSource("idle");
      setSearchLoading(false);
      return undefined;
    }

    setSearchLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(query)}&limit=8`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then(({ canonical_products: products, source }) => {
          setCanonicalResults(products || []);
          setCanonicalSource(source || "fallback");
          setSearchLoading(false);
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          setCanonicalResults([]);
          setCanonicalSource("fallback");
          setSearchLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  // Close the account menu and search-results dropdown on outside click or Esc,
  // like a normal UI. (A fixed backdrop alone is unreliable here because the
  // sticky/blurred topbar forms its own stacking context.)
  useEffect(() => {
    if (!userMenuOpen && !alertsOpen && !searchTerm.trim()) return undefined;
    const onPointerDown = (event) => {
      if (userMenuOpen && userWrapRef.current && !userWrapRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (alertsOpen && alertsWrapRef.current && !alertsWrapRef.current.contains(event.target)) {
        setAlertsOpen(false);
      }
      if (searchTerm.trim() && searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setSearchTerm("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (userMenuOpen) setUserMenuOpen(false);
      if (alertsOpen) setAlertsOpen(false);
      if (searchTerm.trim()) setSearchTerm("");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, alertsOpen, searchTerm]);

  // Honest progress: creep toward — but never reach — 100% while the request is
  // in flight, so the bar only completes when the server actually responds
  // (no more "100% then frozen"). Also track elapsed time so the modal can
  // surface a "catalog is warming up" hint on a slow first match.
  useEffect(() => {
    if (!uploading) {
      setUploadProgress(0);
      setUploadElapsed(0);
      return undefined;
    }

    setUploadProgress(8);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setUploadElapsed(Date.now() - startedAt);
      setUploadProgress((value) => (value >= 95 ? 95 : value + Math.max(0.4, (95 - value) * 0.06)));
    }, 300);

    return () => window.clearInterval(id);
  }, [uploading]);

  const visibleDraftItems = draftItems.filter((item) => item.documentIds.some((documentId) => uploadedDocs.some((doc) => doc.id === documentId)));
  const activeDraftItems = visibleDraftItems.filter((item) => item.included);
  const activePlanItems = applyLiveStock(activeDraftItems, liveStockByUrl);

  const recordLiveStock = useCallback((entries) => {
    if (!Array.isArray(entries) || !entries.length) return;
    const nextLive = {};
    for (const entry of entries) {
      const key = shopifyStockKey(entry?.productUrl);
      if (!key) continue;
      const available = typeof entry.available === "boolean" ? entry.available : null;
      liveStockCacheRef.current.set(key, available);
      if (available !== null) nextLive[key] = available;
    }
    if (Object.keys(nextLive).length) {
      setLiveStockByUrl((current) => ({ ...current, ...nextLive }));
    }
    try {
      window.sessionStorage.setItem(
        SHOPIFY_STOCK_SESSION_KEY,
        JSON.stringify(Object.fromEntries(liveStockCacheRef.current))
      );
    } catch {
      // Session storage is an optimization; live state still works in memory.
    }
  }, []);

  // On the reorder list or plan, confirm only selected Shopify-looking offers.
  // Successful and failed attempts are cached for the tab session so revisiting
  // either view does not repeatedly hit supplier storefronts.
  useEffect(() => {
    if (view !== "plan" && view !== "home" && view !== "savings") return undefined;

    if (!liveStockHydratedRef.current) {
      liveStockHydratedRef.current = true;
      try {
        const cached = JSON.parse(window.sessionStorage.getItem(SHOPIFY_STOCK_SESSION_KEY) || "{}");
        const cachedLive = {};
        for (const [key, value] of Object.entries(cached || {})) {
          const available = typeof value === "boolean" ? value : null;
          liveStockCacheRef.current.set(key, available);
          if (available !== null) cachedLive[key] = available;
        }
        if (Object.keys(cachedLive).length) setLiveStockByUrl((current) => ({ ...cachedLive, ...current }));
      } catch {
        // Corrupt/unavailable session storage simply starts a fresh cache.
      }
    }

    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    const pendingByKey = new Map();
    for (const row of rows) {
      const key = shopifyStockKey(row.productUrl);
      if (!key || liveStockCacheRef.current.has(key) || liveStockRequestsRef.current.has(key)) continue;
      pendingByKey.set(key, row.productUrl);
      if (pendingByKey.size >= SHOPIFY_STOCK_MAX_ITEMS) break;
    }
    if (!pendingByKey.size) return undefined;

    for (const key of pendingByKey.keys()) liveStockRequestsRef.current.add(key);
    const controller = new AbortController();
    fetch("/api/shopify-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productUrls: [...pendingByKey.values()] }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(({ stock }) => {
        const byKey = new Map((stock || []).map((entry) => [shopifyStockKey(entry.productUrl), entry]));
        recordLiveStock([...pendingByKey].map(([key, productUrl]) => byKey.get(key) || { productUrl, available: null }));
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          recordLiveStock([...pendingByKey.values()].map((productUrl) => ({ productUrl, available: null })));
        }
      })
      .finally(() => {
        for (const key of pendingByKey.keys()) liveStockRequestsRef.current.delete(key);
      });

    return () => controller.abort();
  }, [view, draftItems, uploadedDocs, buyingPrefs, recordLiveStock]);

  // Real summary of the current reorder list for the product-page rail (matches
  // how saveCurrentList tallies items/suppliers/spend).
  const listSummary = useMemo(() => {
    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    const suppliers = new Set(rows.map((row) => row.supplier).filter((name) => name && name !== "—"));
    const spend = rows.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    return { items: rows.length, suppliers: suppliers.size, spend };
  }, [activeDraftItems, buyingPrefs]);

  // Lifecycle status of the live list (Draft → Review & optimize → Handed off)
  // for the Home header pill, derived the same way archives compute their final
  // status. listStage only promotes the pill to "review" while every item is
  // reviewed — the derivation, not the stored flag, is the source of truth.
  const liveListStatus = useMemo(
    () => deriveListStatus(deriveMatchRows(activeDraftItems, buyingPrefs), Boolean(currentHandoffId), listStage, submittedSuppliers),
    [activeDraftItems, buyingPrefs, currentHandoffId, listStage, submittedSuppliers]
  );

  // Real alerts derived from the live list — no fabricated badge. Two honest
  // signals we already compute per line: a selected supplier that's out of stock
  // (urgent, listed first), and a captured "what you pay now" that the cheapest
  // option beats (a savings opportunity). Empty list ⇒ no alerts, no badge.
  const alerts = useMemo(() => {
    const rows = deriveMatchRows(activePlanItems, buyingPrefs);
    const nameOf = (row) => row.canonicalName || row.matchName || row.importedName || "Item";
    const oos = [];
    const drops = [];
    for (const row of rows) {
      if (row.outOfStock) {
        oos.push({
          id: `oos-${row.itemId || row.id}`,
          type: "oos",
          name: nameOf(row),
          supplier: row.supplier,
          switchTo: row.switchTarget?.supplier || null,
        });
      } else if (row.hasPaidPrice && row.lineSavings > 0 && row.paidUnitPrice != null) {
        drops.push({
          id: `drop-${row.itemId || row.id}`,
          type: "drop",
          name: nameOf(row),
          supplier: row.supplier,
          now: row.comparableUnitPrice ?? null,
          was: row.paidUnitPrice,
          save: row.lineSavings,
        });
      }
    }
    return [...oos, ...drops];
  }, [activePlanItems, buyingPrefs]);

  // Auto-revert to "draft" if the list empties out while in "review" (e.g. every
  // item removed), so a freshly-repopulated list starts as a Draft again.
  useEffect(() => {
    if (listStage === "review" && activeDraftItems.length === 0) setListStage("draft");
  }, [activeDraftItems, listStage]);

  // Who's signed in, for the topbar / profile / upload metadata. Falls back to
  // neutral labels until /api/auth/me resolves (or if a field is missing).
  const buyerName = me?.customer
    ? ([me.customer.first_name, me.customer.last_name].filter(Boolean).join(" ") || (me.customer.email || "").split("@")[0] || "")
    : "";
  const practiceName = me?.practice?.name || "";
  const buyerInitials = buyerName
    ? buyerName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()
    : "";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const catalogMatches = useMemo(() => {
    if (!catalog.length) return [];
    if (!normalizedSearch) return catalog.slice(0, 5);

    return catalog.filter((category) => {
      const item = category.best_value_item || {};
      return [category.name, item.name, item.supplier_name, item.sku]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [catalog, normalizedSearch]);
  const searchResults = useMemo(() => {
    if (canonicalSource === "medusa") {
      return canonicalResults.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        supplier_name: product.best_offer?.supplier_name,
        price_cents: product.best_offer?.price_cents,
        per_unit_cents: product.best_offer?.unit_price_cents,
        pack_size: product.best_offer?.pack_size,
        pack_quantity: product.best_offer?.pack_quantity,
        pack_basis: product.best_offer?.pack_basis,
        base_unit: product.base_unit,
        handle: product.handle,
        price_range_cents: product.price_range_cents,
        offer_count: product.offer_count,
      }));
    }

    return catalogMatches.map((category) => {
      const item = category.best_value_item || {};
      return {
        id: category.id,
        name: item.name || category.name,
        category: category.name,
        supplier_name: item.supplier_name,
        price_cents: item.unit_price_cents,
        handle: "",
      };
    });
  }, [canonicalResults, canonicalSource, catalogMatches]);

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    const next = viewFromPath(path);
    setIsLoggedIn(next.isLoggedIn);
    setViewState(next.view);
    setHistoryId(next.historyId || null);
    setSelectedHandoffId(next.handoffId || null);
    setProductHandle(next.productHandle || null);
    setCategorySlug(next.categorySlug || null);
    setSupplierId(next.supplierId || null);
    setLocationId(next.locationId || null);
    setScanSessionId(next.scanSessionId || null);
    setSearchQuery(next.searchQuery || "");
    setMobileAddItemRoute(Boolean(next.mobileAddItemRoute));
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAuthed() {
    setAuthed(true);
    navigate("/app");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthed(false);
    navigate("/");
  }

  function setView(nextView) {
    navigate(pathForView(nextView));
  }

  // Start (or resume) a real scan session for a location and drop into it. With
  // no location, fall back to the Scan Sessions list (which has the picker).
  async function startScanSession(locId) {
    if (!locId) { navigate("/app/scan-sessions"); return; }
    try {
      const { session } = await traceApi.startSession({ location_id: locId });
      navigate(`/app/scan-sessions/${session.id}`);
    } catch {
      showToast("Couldn't start a scan session.");
    }
  }

  function handleScanComplete(code) {
    addScannedItem(code);
  }

  // Logged-out scanning: each real lookup spends one of the free scans, tracked
  // in localStorage. Once the budget is gone, scans are ignored and the view's
  // signup wall takes over. Items still land in the local list, so they carry
  // into the account the moment the visitor signs up.
  async function handlePublicScan(code) {
    if (freeScansUsed >= FREE_SCAN_LIMIT) return;
    const added = await addScannedItem(code);
    if (!added) return;
    setFreeScansUsed((n) => {
      const next = n + 1;
      try { window.localStorage.setItem(FREE_SCAN_KEY, String(next)); } catch {}
      return next;
    });
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  function uploadInvoiceFile(fileInput, file) {
    if (!file || !fileInput || !uploadFormRef.current || uploading) return;

    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel" || name.endsWith(".csv");
    if (!isPdf && !isCsv) {
      showToast("Upload a PDF or CSV invoice");
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    setSelectedInvoiceName(file.name);
    window.setTimeout(() => {
      uploadFormRef.current?.requestSubmit();
    }, 0);
  }

  function handleInvoiceDrop(event) {
    event.preventDefault();
    setIsDraggingInvoice(false);
    uploadInvoiceFile(event.currentTarget.querySelector('input[type="file"]'), event.dataTransfer.files?.[0]);
  }

  async function handleUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    uploadCancelledRef.current = false;
    const timeout = window.setTimeout(() => controller.abort("timeout"), UPLOAD_TIMEOUT_MS);
    setUploadError("");
    setUploading(true);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setUploadError(body.error || `Upload failed (${response.status}). Please try again.`);
        return;
      }

      const { request } = await response.json();
      const documentId = request.id;
      setHasUploadedInvoice(true);
      setListTouched(true);
      setUploadedDocs((docs) => [
        ...docs,
        { id: documentId, name: request.sourceFileName, itemCount: request.lineItems.length },
      ]);
      setDraftItems((items) => {
        // Merge matched lines by canonical product; keep unmatched lines distinct
        // by their raw description (canonical name is null for those).
        const keyOf = (item) => item.product || item.extractedFrom || item.sku || "";
        const byProduct = new Map(items.map((item) => [keyOf(item), item]));

        request.lineItems.forEach((item) => {
          const key = keyOf(item);
          const existing = byProduct.get(key);

          if (existing) {
            const documentQuantities = {
              ...(existing.documentQuantities || {}),
              [documentId]: ((existing.documentQuantities || {})[documentId] || 0) + item.qty,
            };

            byProduct.set(key, {
              ...existing,
              draftQty: existing.draftQty + item.qty,
              included: true,
              updatedAt: Date.now(),
              documentQuantities,
              documentIds: Array.from(new Set([...existing.documentIds, documentId])),
            });
            return;
          }

          byProduct.set(key, {
            ...item,
            id: newItemId(),
            draftQty: item.qty,
            included: true,
            updatedAt: Date.now(),
            documentQuantities: { [documentId]: item.qty },
            documentIds: [documentId],
          });
        });

        return Array.from(byProduct.values());
      });
      setSelectedInvoiceName("");
      setLastUpload({ name: request.sourceFileName, items: request.lineItems, matchSource: request.matchSource });
      form.reset();
      showToast(`${request.lineItems.length} items added to your list`);
    } catch (error) {
      if (uploadCancelledRef.current) {
        // User cancelled — leave the modal on the dropzone, no error.
      } else if (controller.signal.aborted) {
        setUploadError("This is taking longer than expected — the product catalog may be warming up. Please try again in a moment.");
      } else {
        setUploadError("Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      window.clearTimeout(timeout);
      // Only clear shared state if this is still the active upload — a
      // cancel-then-reupload could have superseded it.
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
        uploadCancelledRef.current = false;
        setUploading(false);
      }
    }
  }

  function handleCancelUpload() {
    uploadCancelledRef.current = true;
    uploadAbortRef.current?.abort("cancelled");
  }

  async function addScannedItem(code) {
    setListTouched(true);
    setUploadedDocs((docs) => docs.some((doc) => doc.id === "scan")
      ? docs
      : [...docs, { id: "scan", name: "Barcode scans", itemCount: 0 }]);

    // One instance per product: a code already ON the list (active) re-surfaces
    // so the buyer sees it registered, but never bumps the quantity — they set
    // quantity back on the reorder list. This keeps a barcode lingering in frame
    // (or a deliberate re-scan) from piling up duplicate counts. Match only
    // active items: a removed/cleared item is a tombstone (included:false), and
    // re-scanning it should bring it back, not be rejected as a duplicate.
    const existing = code ? draftItems.find((item) => item.barcode === code && item.included !== false) : null;
    if (existing) {
      setScanResult({ status: statusFromItem(existing), item: existing, isDuplicate: true, qty: existing.draftQty || 1 });
      showToast("Already on your list");
      return false;
    }

    // Re-scanning a removed/cleared item revives its tombstone in place (keeping
    // any qty/notes/price it carried) rather than adding a parallel duplicate.
    const tombstone = code ? draftItems.find((item) => item.barcode === code && item.included === false) : null;
    if (tombstone) {
      const revived = { ...tombstone, included: true, updatedAt: Date.now() };
      setDraftItems((items) => items.map((it) => (it.id === tombstone.id ? revived : it)));
      setScanCount((n) => n + 1);
      setScanResult({ status: statusFromItem(revived), item: revived, isDuplicate: false, qty: revived.draftQty || 1 });
      showToast(`Added ${revived.product || revived.canonicalName || code || "item"}`);
      return true;
    }

    // Resolve against the real catalog: GTIN/UPC barcode first, then exact SKU.
    const product = await lookupScannedProduct(code);
    const item = makeScanDraftItem(code, product);

    setDraftItems((items) => {
      if (code && items.some((it) => it.barcode === code && it.included !== false)) return items; // race guard
      return [...items, item];
    });
    setScanCount((n) => n + 1);
    setScanResult({ status: statusFromItem(item), item, isDuplicate: false, qty: item.draftQty || 1 });
    showToast(product ? `Added ${product.name}` : code ? `Scanned ${code} — needs review` : "Item added");
    return true;
  }

  // Add a catalog product (from the product page) to the current reorder list.
  // Reuses the scan draft shape (offers, best supplier, canonical handle) but
  // tags the source as a catalog add and respects the buyer's chosen quantity.
  function addCatalogItem(product, quantity = 1, unitOfMeasure) {
    if (!product) return;
    setListTouched(true);
    setUploadedDocs((docs) => docs.some((doc) => doc.id === "catalog")
      ? docs
      : [...docs, { id: "catalog", name: "Catalog adds", itemCount: 0 }]);

    const base = makeScanDraftItem(null, product);
    const item = {
      ...base,
      source: "catalog",
      barcode: "",
      draftQty: quantity,
      qty: quantity,
      unit: (unitOfMeasure || base.unit || "ea"),
      documentIds: ["catalog"],
      documentQuantities: { catalog: quantity },
      extractedFrom: product.name || base.product || "Catalog item",
    };
    setDraftItems((items) => [...items, item]);
  }

  function removeDraftItem(target) {
    const id = typeof target === "string" ? target : target?.id;
    if (!id) return;
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, included: false, updatedAt: Date.now() } : item)));
  }

  // Write the latest blob to the server now. The server merges (absence !=
  // deletion, newest-wins, sticky tombstones), so a write is never a destructive
  // overwrite. We deliberately don't adopt the response or bump the version
  // here: the next poll re-fetches and applies it, which also pulls in any
  // concurrent edit from the other device.
  async function saveNow(blob) {
    try {
      await fetch("/api/reorder-list", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(blob),
      });
    } catch {
      // offline — localStorage still holds it; the next change/poll reconciles.
    }
  }

  // Flush a queued (coalesced) save immediately — used before reading the server
  // back so the read reflects this device's latest edits.
  async function flushPendingSave() {
    if (!pendingSaveRef.current || !latestBlobRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    pendingSaveRef.current = false;
    await saveNow(latestBlobRef.current);
  }

  // Pull the practice's latest list and apply it through the one shared merge
  // rule. Used by the manual refresh button and the tab-focus handler; the 3s
  // poll does the same continuously. Keeps local scalars (base = local).
  async function refreshFromServer() {
    if (authed !== true) return;
    await flushPendingSave();
    try {
      const response = await fetch(`/api/reorder-list?t=${Date.now()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!data || !data.state) return;
      lastServerVersionRef.current = data.updated_at || lastServerVersionRef.current;
      const local = latestBlobRef.current || JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");
      hydrateFromState(mergeDraftState(local, data.state));
    } catch {
      // offline / server down — keep current state
    }
  }

  // Persist a buyer's per-item verification decision: chosen offer, quantity,
  // note, and whether it's confirmed. Patch keys are optional.
  function applyMatchDecision(itemId, patch = {}) {
    if (!itemId) return;
    setListTouched(true);
    setDraftItems((items) => items.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item };
      if (patch.selectedOfferKey !== undefined) next.selectedOfferKey = patch.selectedOfferKey;
      if (patch.qty !== undefined) next.draftQty = patch.qty;
      if (patch.note !== undefined) next.note = patch.note;
      if (patch.paidUnitPrice !== undefined) {
        const n = patch.paidUnitPrice === null || patch.paidUnitPrice === "" ? null : Number(patch.paidUnitPrice);
        next.paidUnitPrice = Number.isFinite(n) && n > 0 ? n : null;
      }
      next.updatedAt = Date.now();
      return next;
    }));
  }

  // Apply the landed-cost-optimized plan: set each line's selected offer to the
  // optimizer's choice. Reuses the per-line override mechanism, so the buyer can
  // still re-pick any line afterward.
  function applyOptimizedPlan(assignmentByItemId) {
    if (!assignmentByItemId || !Object.keys(assignmentByItemId).length) return;
    setListTouched(true);
    setDraftItems((items) => items.map((item) => {
      const key = assignmentByItemId[item.id];
      return key ? { ...item, selectedOfferKey: key, updatedAt: Date.now() } : item;
    }));
    showToast("Plan optimized for lowest landed cost");
  }

  // Resolve a No-Match (or re-link any item) by attaching a catalog product and
  // its supplier offers, marking it linked (a confident match).
  function linkProductToItem(itemId, product, options = {}) {
    if (!itemId || !product) return;
    setListTouched(true);
    const offers = (product.offers || []).map(mapSearchOffer);
    const best = offers[0] || (product.best_offer ? mapSearchOffer(product.best_offer) : null);
    setDraftItems((items) => items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        product: product.name,
        canonicalName: product.name,
        canonicalHandle: product.handle || product.id || item.canonicalHandle || "",
        imageUrl: product.image_url || best?.imageUrl || item.imageUrl || "",
        unit: product.base_unit || item.unit || "ea",
        offers,
        bestOffer: best,
        selectedOfferKey: null,
        matchStatus: "exact",
        confidence: product.match?.score ?? 0.95,
        linked: true,
        draftQty: options.qty ?? item.draftQty ?? item.qty ?? 1,
        note: options.note ?? item.note ?? "",
        updatedAt: Date.now(),
      };
    }));
  }

  // Snapshot the current list into Saved lists, then clear it. Rows are stored
  // so the saved list stays readable, and the raw items so it can be reopened.
  function saveCurrentList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to save yet");
      return;
    }
    const rows = deriveMatchRows(activeDraftItems, buyingPrefs);
    // Snapshot the landed total (items + estimated shipping) so History matches
    // the Plan Preview the buyer saw when archiving.
    const totals = computePlanTotals(rows, supplierShipping);
    const now = new Date();
    const entry = {
      id: `list_${now.getTime()}`,
      name: listName || `${now.toLocaleString("en-US", { month: "long" })} Reorder List`,
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      items: rows.length,
      suppliers: totals.suppliers,
      total: money.format(totals.landedTotal),
      // Final lifecycle status + the handoff it was tied to, for the History pill.
      status: deriveListStatus(rows, Boolean(currentHandoffId), listStage, submittedSuppliers),
      handoffId: currentHandoffId,
      rows,
      // Raw inputs so Duplicate can rebuild a working, visible list (items are
      // only shown when their documentIds match a doc in uploadedDocs).
      sourceItems: activeDraftItems,
      sourceDocs: uploadedDocs,
    };
    setArchivedLists((lists) => [entry, ...lists]);
    tombstoneAllItems();
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
    setSubmittedSuppliers([]);
    setListStage("draft");
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List saved");
  }

  // Both whole-list actions are guarded by a confirmation modal so a buyer can't
  // wipe or save-and-clear their list with a single stray menu tap.
  function requestSaveList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to save yet");
      return;
    }
    setConfirmDialog({
      title: "Save this list?",
      body: "The current reorder list will be saved to History and a fresh, empty list will start. You can reopen or duplicate a saved list any time.",
      confirmLabel: "Save list",
      onConfirm: saveCurrentList,
    });
  }

  function requestClearList() {
    if (!activeDraftItems.length) {
      showToast("List is already empty");
      return;
    }
    setConfirmDialog({
      title: "Clear this list?",
      body: "Every item will be removed from your current reorder list. This can't be undone — to keep a copy, archive the list instead.",
      confirmLabel: "Clear list",
      destructive: true,
      onConfirm: clearCurrentList,
    });
  }

  // Clearing a list is a *soft* clear: every item is tombstoned (included:false)
  // rather than dropped from the array. A tombstone is a real, mergeable signal
  // ("this was removed at T"), so the deletion propagates to other devices
  // instead of a stale device re-adding the items it still remembers. Physically
  // emptying the array looks identical to "this device just hasn't seen the new
  // items yet", which is exactly what made cleared items resurrect on refresh.
  function tombstoneAllItems() {
    setDraftItems((items) =>
      items.map((item) => (item.included === false ? item : { ...item, included: false, updatedAt: Date.now() })));
  }

  function clearCurrentList() {
    if (!activeDraftItems.length) {
      showToast("List is already empty");
      return;
    }
    tombstoneAllItems();
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
    setSubmittedSuppliers([]);
    setListStage("draft");
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List cleared");
  }

  // Explicit reverse transition: Review & optimize → Draft (the "Keep editing"
  // affordance). Handoff is intentionally not reversible — see prepareHandoff.
  function backToDraft() {
    setListStage("draft");
  }

  // Advance the gate: Draft → Review & optimize. Only meaningful when the list
  // is fully reviewed; the derivation enforces that the pill agrees.
  function advanceToReview() {
    setListStage("review");
  }

  // Freeze the current plan into a read-only supplier handoff. Captures the
  // best-offer-per-line snapshot (grouped by supplier) so the order details
  // don't drift if prices/preferences change after the buyer commits.
  function prepareHandoff() {
    const rows = deriveMatchRows(activePlanItems, buyingPrefs);
    const included = rows.filter(isPlanIncluded);
    if (!included.length) {
      showToast("Add matched items before preparing a handoff");
      return;
    }
    const groups = groupRowsBySupplier(included.map(slimHandoffRow));
    const total = included.reduce((sum, row) => sum + (row.lineTotal || 0), 0);
    const now = new Date();
    const snapshot = {
      id: `ho_${now.getTime()}`,
      listName,
      createdAt: now.toISOString(),
      createdLabel: now.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      buyer: buyerName,
      practice: practiceName,
      prefs: buyingPrefs,
      groups,
      total,
      itemCount: included.length,
      supplierCount: groups.length,
    };
    setHandoffs((list) => [snapshot, ...list]);
    setCurrentHandoffId(snapshot.id);
    showToast("Supplier handoff prepared");
    navigate(`/app/review/handoff?ho=${snapshot.id}`);
  }

  // Save the live list and return to a fresh Home — the frozen handoff lives on
  // in Saved lists, so saving here doesn't lose the order details.
  function saveFromHandoff() {
    saveCurrentList();
    navigate("/app");
  }

  // The buyer confirms they've placed this supplier's order (from the Build cart
  // modal). We only record that it happened — no order number — which collapses
  // the supplier's block in Review. Closing the modal keeps the flow moving.
  function markOrderSubmitted(group) {
    const supplier = group?.supplier;
    if (!supplier) return;
    setSubmittedSuppliers((list) => (list.includes(supplier) ? list : [...list, supplier]));
    setCartGroup(null);
    showToast(`Marked ${supplier} order as submitted`);
  }

  // Unlock a submitted order so its items can be edited again — the only way out
  // of the locked state.
  function reopenSupplierOrder(supplier) {
    const remaining = submittedSuppliers.filter((name) => name !== supplier);
    setSubmittedSuppliers(remaining);
    // Undoing the last submitted order takes the whole list back to Draft so the
    // buyer reworks it from scratch, rather than landing back in Review.
    if (!remaining.length) setListStage("draft");
    showToast(`Reopened ${supplier} — order no longer marked submitted`);
  }

  // Rename a saved list (live list renames via setListName).
  function renameArchivedList(id, name) {
    setArchivedLists((lists) => lists.map((entry) => (entry.id === id ? { ...entry, name } : entry)));
  }

  // Reopening or duplicating a saved list replaces the current reorder list. If
  // the buyer has unsaved items in flight, offer to save them first so nothing
  // is lost — Save current first / Discard current / Cancel.
  function guardReplaceCurrentList(verb, entryName, proceed) {
    if (!activeDraftItems.length) {
      proceed();
      return;
    }
    const n = activeDraftItems.length;
    setConfirmDialog({
      title: `${verb} "${entryName}"?`,
      body: `Your current reorder list has ${n} unsaved item${n === 1 ? "" : "s"}. Save them to History first so you don't lose them, or discard them to continue.`,
      confirmLabel: "Save current first",
      secondaryLabel: "Discard current",
      onConfirm: () => { saveCurrentList(); proceed(); },
      onSecondary: proceed,
    });
  }

  // Load a saved list's raw items (with fresh ids) and docs as the live reorder
  // list. Shared by reopen (moves the entry out of Saved lists) and duplicate
  // (leaves the original in place, names it a copy).
  function loadSavedListAsCurrent(entry, { copy }) {
    // Fresh updatedAt so a reopened item beats any same-key tombstone left on
    // the server by an earlier clear of the current list.
    setDraftItems(entry.sourceItems.map((item) => ({ ...item, id: newItemId(), included: true, updatedAt: Date.now() })));
    setUploadedDocs(entry.sourceDocs || []);
    setListName(copy ? `${entry.name} (copy)` : entry.name);
    setCurrentHandoffId(null);
    setSubmittedSuppliers([]);
    setListStage("draft");
    setListTouched(true);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    navigate("/app");
  }

  // Reopen a saved list as the editable current list and remove it from Saved
  // lists — it's no longer a past list once it's live again.
  function reopenList(entry) {
    if (!entry?.sourceItems?.length) {
      showToast("This sample list has no items to reopen");
      return;
    }
    guardReplaceCurrentList("Reopen", entry.name, () => {
      loadSavedListAsCurrent(entry, { copy: false });
      setArchivedLists((lists) => lists.filter((e) => e.id !== entry.id));
      showToast(`Reopened "${entry.name}"`);
    });
  }

  // Copy a saved list into a fresh current list; the original stays saved.
  function duplicateList(entry) {
    if (!entry?.sourceItems?.length) {
      showToast("This sample list has no items to duplicate");
      return;
    }
    guardReplaceCurrentList("Duplicate", entry.name, () => {
      loadSavedListAsCurrent(entry, { copy: true });
      showToast(`Duplicated "${entry.name}" to a new list`);
    });
  }

  // Permanently remove a saved list. Confirmed because there's no undo.
  function deleteSavedList(entry) {
    setConfirmDialog({
      title: `Delete "${entry.name}"?`,
      body: "This saved list will be permanently removed. This can't be undone — reopen or duplicate it first if you might need it again.",
      confirmLabel: "Delete list",
      destructive: true,
      onConfirm: () => {
        setArchivedLists((lists) => lists.filter((e) => e.id !== entry.id));
        showToast(`Deleted "${entry.name}"`);
        if (view === "historyDetail") navigate("/app/history");
      },
    });
  }

  // New TraceDDS rail (supply-management IA). Items flagged `soon` are visible
  // but disabled until their phase lands. Catalog + History stay live so nothing
  // from the old IA becomes unreachable (Savings is kept but demoted).
  const navItems = [
    ["dashboard", "icon-home", "Dashboard", true],
    ["needsAttention", "icon-alert-triangle", "Needs attention", false, NEEDS_ATTENTION_BADGE],
    ["home", "icon-cart", "Reorder list"],
    ["locations", "icon-map-pin", "Locations"],
    ["scanSessions", "icon-scan", "Scan sessions"],
    ["savings", "icon-dollar-circle", "Savings"],
    ["evidence", "icon-shield-check", "Evidence"],
    ["reports", "icon-chart", "Reports", true],
    ["catalog", "icon-store", "Catalog"],
    ["history", "icon-clock", "History"],
    ["settings", "icon-settings", "Settings"],
  ];

  // Mobile bottom nav (persistent, per diagrams/mobile-ia.mmd). The bar renders
  // on every authed mobile view, so the active tab is DERIVED from `view` and
  // each drill-down keeps its parent tab lit. "More" destinations live in a sheet.
  const MORE_VIEWS = new Set([
    "evidence", "evidenceBinder", "savings", "history", "historyDetail",
    "catalog", "catalogSearch", "catalogSupplier", "catalogCategory",
    "productDetail", "settings",
  ]);
  const activeMobileTab =
    view === "home" || view === "needsAttention" ? "today"
    : view === "locations" || view === "locationAdd" || view === "locationDetail" ? "locations"
    : view === "scanSessions" || view === "scanSession" ? "scan"
    : view === "reorderList" || view === "plan" || view === "handoff" ? "reorder"
    : MORE_VIEWS.has(view) ? "more"
    : null;
  const onMobileTab = (tab) => {
    if (tab === "more") { setMoreSheetOpen(true); return; }
    setMoreSheetOpen(false);
    if (tab === "today") navigate("/app");
    else if (tab === "locations") navigate("/app/locations");
    else if (tab === "scan") navigate("/app/scan-sessions");
    else if (tab === "reorder") navigate("/app/reorder-list");
  };
  // Visible on every mobile app view except the immersive full-screen scan
  // session and the legacy add-item scan route.
  const showMobileNav = isMobile && !mobileAddItemRoute && view !== "scanSession";

  // The reorder list is the desktop home (`/app`) and, on mobile, a menu
  // destination at `/app/reorder-list`. Defined once and reused in both places.
  const reorderListEl = (
    <CurrentReorderList
      items={activePlanItems}
      listName={listName}
      listStatus={liveListStatus}
      listStage={listStage}
      onAdvanceStage={advanceToReview}
      onRenameList={setListName}
      buyerName={buyerName}
      practiceName={practiceName}
      buyerInitials={buyerInitials}
      email={me?.customer?.email}
      onLogout={handleLogout}
      addMode={addMode}
      onAddMode={setAddMode}
      lastUpload={lastUpload}
      onCloseUpload={() => { setAddMode(""); setLastUpload(null); setUploadError(""); }}
      onUploadAnother={() => { setLastUpload(null); setUploadError(""); }}
      uploadFormRef={uploadFormRef}
      onUpload={handleUpload}
      uploading={uploading}
      uploadProgress={uploadProgress}
      uploadElapsed={uploadElapsed}
      uploadError={uploadError}
      onCancelUpload={handleCancelUpload}
      onClearUploadError={() => setUploadError("")}
      isDraggingInvoice={isDraggingInvoice}
      onDragStateChange={setIsDraggingInvoice}
      onInvoiceDrop={handleInvoiceDrop}
      onInvoiceFile={uploadInvoiceFile}
      selectedInvoiceName={selectedInvoiceName}
      hasUploadedInvoice={hasUploadedInvoice}
      onScan={handleScanComplete}
      scanResult={scanResult}
      onClearScanResult={() => setScanResult(null)}
      scanCount={scanCount}
      searchTerm={searchTerm}
      onSearchTerm={setSearchTerm}
      searchResults={searchResults}
      searchLoading={searchLoading}
      onToast={showToast}
      listTouched={listTouched}
      buyingPrefs={buyingPrefs}
      supplierShipping={supplierShipping}
      onBuyingPrefs={setBuyingPrefs}
      onApplyOptimized={applyOptimizedPlan}
      onArchiveList={requestSaveList}
      onClearList={requestClearList}
      onConfirmMatch={applyMatchDecision}
      onLinkProduct={linkProductToItem}
      onRemoveItem={removeDraftItem}
      onRefresh={refreshFromServer}
      onNavigate={navigate}
    />
  );

  if (!isLoggedIn) {
    return (
      <>
        {view === "pricing" ? <PricingPage onNavigate={navigate} authed={authed === true} />
          : view === "about" ? <AboutPage onNavigate={navigate} authed={authed === true} />
          : view === "login" ? <LoginPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "signup" ? <SignupPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "forgotPassword" ? <ForgotPasswordPage onNavigate={navigate} />
          : view === "resetPassword" ? <ResetPasswordPage onNavigate={navigate} />
          : view === "styleguide" ? <StyleGuide />
          : view === "sample" ? <SampleReorderList onNavigate={navigate} authed={authed === true} />
          : view === "publicScan" ? (
            <PublicScanView
              onScan={handlePublicScan}
              scanResult={scanResult}
              onClearScanResult={() => setScanResult(null)}
              freeScansUsed={freeScansUsed}
              limit={FREE_SCAN_LIMIT}
              onSignup={() => navigate("/signup")}
              onLogin={() => navigate("/login")}
              onHome={() => navigate("/")}
              onApp={() => navigate("/app")}
              authed={authed === true}
            />
          )
          : <LoggedOutLanding onNavigate={navigate} authed={authed === true} />}
        <IconSprite />
      </>
    );
  }

  return (
    <>
      <div className={`app-shell ${menuOpen ? "menu-open" : ""} ${navCollapsed ? "nav-collapsed" : ""} ${mobileAddItemRoute ? "mobile-add-item-shell" : ""}`}>
        <header className="topbar">
          <button className="topbar-brand" type="button" onClick={() => setView("home")} aria-label="TraceDDS home">
            <BrandMark />
          </button>
          <div className="topbar-search-wrap" ref={searchWrapRef}>
            <label className="topbar-search">
              <Icon name="icon-search" className="button-icon" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search products, suppliers…"
                aria-label="Search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { setSearchTerm(""); event.currentTarget.blur(); }
                  else if (event.key === "Enter" && searchTerm.trim()) {
                    event.preventDefault();
                    event.currentTarget.blur();
                    navigate(`/app/catalog/search?q=${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
              />
              <kbd className="topbar-kbd">⌘K</kbd>
            </label>
            {searchTerm.trim() && (
              <SearchResults
                results={searchResults}
                loading={searchLoading}
                query={searchTerm.trim()}
                onNavigate={navigate}
              />
            )}
          </div>
          <div className="topbar-right">
            <div className="topbar-alerts-wrap" ref={alertsWrapRef}>
              <button
                className={`topbar-alerts ${alerts.length ? "has-alerts" : ""}`}
                type="button"
                aria-label={alerts.length ? `Alerts (${alerts.length})` : "Alerts"}
                aria-haspopup="menu"
                aria-expanded={alertsOpen}
                onClick={() => setAlertsOpen((open) => !open)}
              >
                <Icon name="icon-bell" className="button-icon" />
                {alerts.length > 0 && <span className="topbar-badge">{alerts.length > 9 ? "9+" : alerts.length}</span>}
              </button>
              {alertsOpen && (
                <div className="topbar-alerts-menu" role="menu">
                  <div className="topbar-menu-head">
                    <strong>Alerts</strong>
                    <small>{alerts.length ? `${alerts.length} on your reorder list` : "Nothing needs attention"}</small>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="topbar-alerts-empty">
                      <Icon name="icon-check-circle" className="button-icon" />
                      <span>You&rsquo;re all caught up.</span>
                    </div>
                  ) : (
                    <>
                      <ul className="topbar-alerts-list">
                        {alerts.slice(0, 6).map((alert) => (
                          <li key={alert.id} className={`topbar-alert topbar-alert-${alert.type}`}>
                            <Icon name={alert.type === "oos" ? "icon-alert-triangle" : "icon-tag"} className="button-icon" />
                            <div className="topbar-alert-body">
                              {alert.type === "oos" ? (
                                <>
                                  <strong>{alert.name}</strong>
                                  <small>Out of stock at {alert.supplier}{alert.switchTo ? ` — ${alert.switchTo} has it` : ""}</small>
                                </>
                              ) : (
                                <>
                                  <strong>{alert.name}</strong>
                                  <small>
                                    {alert.now != null ? `Now ${money.format(alert.now)}` : "Cheaper now"} · was {money.format(alert.was)} · save {money.format(alert.save)}
                                  </small>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <button
                        className="topbar-alerts-cta"
                        type="button"
                        onClick={() => { setAlertsOpen(false); setView("home"); }}
                      >
                        {alerts.length > 6 ? `View all ${alerts.length} on your list` : "Open reorder list"}
                        <Icon name="icon-arrow-right" className="button-icon" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-user-wrap" ref={userWrapRef}>
              <button
                className="topbar-user"
                type="button"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((open) => !open)}
              >
                <span className="topbar-avatar">{buyerInitials || "··"}</span>
                <span className="topbar-user-id"><strong>{buyerName || "Your account"}</strong><small>{practiceName || "Buyer"}</small></span>
                <Icon name="icon-chevron-down" className={`button-icon ${userMenuOpen ? "rot" : ""}`} />
              </button>
              {userMenuOpen && (
                <div className="topbar-menu" role="menu">
                  <div className="topbar-menu-head">
                    <strong>{buyerName || "Your account"}</strong>
                    <small>{me?.customer?.email || practiceName || "Buyer"}</small>
                  </div>
                  <button role="menuitem" type="button" onClick={() => { setUserMenuOpen(false); setView("settings"); }}>
                    <Icon name="icon-settings" className="button-icon" />
                    Settings
                  </button>
                  <button role="menuitem" type="button" onClick={() => { setUserMenuOpen(false); handleLogout(); }}>
                    <Icon name="icon-logout" className="button-icon" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="app-body">
        <aside className="sidebar">
          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label, soon, count]) => (
              <button
                key={target}
                className={`nav-tab ${target === "settings" ? "nav-tab-bottom" : ""} ${view === target || (target === "locations" && (view === "locationAdd" || view === "locationDetail")) || (target === "scanSessions" && view === "scanSession") || (target === "evidence" && view === "evidenceBinder") ? "active" : ""} ${soon ? "nav-tab-soon" : ""}`}
                type="button"
                onClick={() => { if (!soon) setView(target); }}
                disabled={soon}
                aria-disabled={soon || undefined}
                title={navCollapsed ? label : undefined}
              >
                <Icon name={icon} />
                <strong>{label}</strong>
                {soon && <span className="nav-soon-badge">Soon</span>}
                {!soon && count ? <span className="nav-count-badge">{count}</span> : null}
              </button>
            ))}
          </nav>
          <button
            className="nav-collapse-btn"
            type="button"
            onClick={() => setNavCollapsed((collapsed) => !collapsed)}
            aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={navCollapsed ? "icon-chevron-right" : "icon-chevron-left"} className="button-icon" />
            <span>Collapse</span>
          </button>
        </aside>

        <main className="app-main">
          {view === "home" && (
            mobileAddItemRoute ? (
              <MobileScanItemView
                onBack={() => { setScanResult(null); setMobileAddItemRoute(false); }}
                onScan={handleScanComplete}
                scanResult={scanResult}
                onClearScanResult={() => setScanResult(null)}
                scanCount={scanCount}
              />
            ) : isMobile ? (
              // Mobile home (`/app`) = the Today tab. Locations / Scan / Reorder
              // are their own routes, reached via the persistent bottom nav.
              <MobileTodayView
                onResumeSession={(id) => navigate(`/app/scan-sessions/${id}`)}
                onNavigate={(dest) => {
                  if (dest === "needsAttention") navigate("/app/needs-attention");
                  else navigate(`/app/${dest}`);
                }}
                onToast={showToast}
              />
            ) : (
              reorderListEl
            )
          )}

          {view === "reorderList" && reorderListEl}

          {view === "needsAttention" && <NeedsAttentionView onToast={showToast} />}

          {view === "locations" && (
            <LocationsBoardView
              onStartScan={startScanSession}
              onAddLocation={() => navigate("/app/locations/new")}
              onOpenLocation={(id) => navigate(`/app/locations/${id}`)}
              onToast={showToast}
            />
          )}

          {view === "locationAdd" && (
            <AddLocationView
              onCancel={() => navigate("/app/locations")}
              onSaved={() => navigate("/app/locations")}
              onToast={showToast}
            />
          )}

          {view === "locationDetail" && (
            <LocationDetailView
              locationId={locationId}
              onBack={() => navigate("/app/locations")}
              onStartScan={() => startScanSession(locationId)}
              onToast={showToast}
              onNavigate={navigate}
            />
          )}

          {view === "scanSessions" && (
            <ScanSessionsView
              onOpenSession={(id) => navigate(`/app/scan-sessions/${id}`)}
              onNavigate={navigate}
              onToast={showToast}
              onLogout={handleLogout}
            />
          )}

          {view === "scanSession" && (
            <ScanSessionView
              sessionId={scanSessionId}
              onBack={() => navigate("/app/scan-sessions")}
              onNavigate={navigate}
              onToast={showToast}
              onNavigate={navigate}
            />
          )}

          {view === "evidence" && (
            <EvidenceView
              onBuildPacket={() => navigate("/app/evidence/binder")}
              onToast={showToast}
            />
          )}

          {view === "evidenceBinder" && (
            <EvidenceBinderView onBack={() => navigate("/app/evidence")} />
          )}

          {view === "plan" && (
            <ProcurementPlanView
              items={activePlanItems}
              listName={listName}
              listStatus={liveListStatus}
              onBackToDraft={() => { backToDraft(); navigate("/app"); }}
              buyingPrefs={buyingPrefs}
              supplierShipping={supplierShipping}
              shipToState={me?.practice?.ship_state || ""}
              onBuyingPrefs={setBuyingPrefs}
              onBuildCart={setCartGroup}
              submittedSuppliers={submittedSuppliers}
              onReopenOrder={reopenSupplierOrder}
              onSwitchOffer={applyMatchDecision}
              onConfirmMatch={applyMatchDecision}
              onLinkProduct={linkProductToItem}
              onRemoveItem={removeDraftItem}
              onNavigate={navigate}
              onToast={showToast}
            />
          )}

          {view === "handoff" && (
            <SupplierHandoffView
              handoff={(selectedHandoffId && handoffs.find((h) => h.id === selectedHandoffId)) || handoffs[0] || null}
              onArchive={saveFromHandoff}
              onBuildCart={setCartGroup}
              onNavigate={navigate}
              onToast={showToast}
            />
          )}

          {view === "history" && (
            <HistoryView
              archivedLists={archivedLists}
              onOpen={(id) => navigate(`/app/history/${id}`)}
              onReopen={reopenList}
              onDuplicate={duplicateList}
              onDelete={deleteSavedList}
            />
          )}

          {view === "historyDetail" && (
            <HistoryDetail
              id={historyId}
              archivedLists={archivedLists}
              handoffs={handoffs}
              onBack={() => navigate("/app/history")}
              onRename={renameArchivedList}
              onReopen={reopenList}
              onDuplicate={duplicateList}
              onDelete={deleteSavedList}
              onViewHandoff={(hid) => navigate(`/app/review/handoff?ho=${hid}`)}
            />
          )}

          {view === "savings" && (
            <SavingsView
              rows={deriveMatchRows(activePlanItems, buyingPrefs)}
              archivedLists={archivedLists}
              onNavigate={navigate}
              onImportInvoice={() => { setAddMode("upload"); navigate("/app"); }}
            />
          )}

          {view === "catalog" && <CatalogView onNavigate={navigate} />}

          {view === "catalogSearch" && (
            <CatalogSearchView query={searchQuery} onNavigate={navigate} />
          )}

          {view === "catalogCategory" && (
            <CatalogCategoryView slug={categorySlug} onNavigate={navigate} />
          )}

          {view === "catalogSupplier" && (
            <CatalogSupplierView supplierId={supplierId} onNavigate={navigate} />
          )}

          {view === "productDetail" && (
            <ProductDetail
              handle={productHandle}
              onNavigate={navigate}
              onToast={showToast}
              onAddToList={addCatalogItem}
              listName={listName}
              listSummary={listSummary}
            />
          )}

          {view === "settings" && (
            <SettingsView
              me={me}
              onMeUpdate={setMe}
              defaultBuyingPrefs={defaultBuyingPrefs}
              onSaveDefaults={setDefaultBuyingPrefs}
              supplierOptions={supplierOptions}
              onToast={showToast}
            />
          )}
        </main>
        {showMobileNav && (
          <>
            {moreSheetOpen && (
              <MobileMoreSheet
                onNavigate={(dest) => navigate(`/app/${dest}`)}
                onClose={() => setMoreSheetOpen(false)}
              />
            )}
            <MobileBottomNav activeTab={activeMobileTab} onTab={onMobileTab} />
          </>
        )}
        </div>
      </div>

      {cartGroup && (
        <CartBuilderModal
          group={cartGroup}
          buyingPrefs={buyingPrefs}
          onClose={() => setCartGroup(null)}
          onStockResults={recordLiveStock}
          onSwitchOffer={applyMatchDecision}
          onOrderSubmitted={markOrderSubmitted}
          submitted={submittedSuppliers.includes(cartGroup.supplier)}
          onToast={showToast}
        />
      )}

      {confirmDialog && (
        <ConfirmModal
          {...confirmDialog}
          onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog(null); }}
          onSecondary={confirmDialog.onSecondary ? () => { confirmDialog.onSecondary(); setConfirmDialog(null); } : undefined}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
  );
}

