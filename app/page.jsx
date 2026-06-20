"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { CatalogCategoryView, CatalogSearchView, CatalogView, ProductDetail, SearchResults } from "./catalog";
import { BrandMark, Icon, IconSprite } from "./icons";
import { APP_STATE_KEY, DEFAULT_BUYING_PREFS, FREE_SCAN_KEY, FREE_SCAN_LIMIT, NAV_COLLAPSED_KEY, SHOPIFY_STOCK_MAX_ITEMS, SHOPIFY_STOCK_SESSION_KEY, UPLOAD_TIMEOUT_MS, applyLiveStock, buildShippingByName, computePlanTotals, deriveListStatus, deriveMatchRows, groupRowsBySupplier, isPlanIncluded, lookupScannedProduct, makeScanDraftItem, mapSearchOffer, money, newItemId, parseAttributes, pathForView, shopifyStockKey, slimHandoffRow, statusFromItem, viewFromPath } from "./lib";
import { AboutPage, ForgotPasswordPage, LoggedOutLanding, LoginPage, MobileBottomNav, MobileScanItemView, PricingPage, PublicScanView, ResetPasswordPage, SampleReorderList, SignupPage } from "./marketing";
import { CartBuilderModal, HistoryDetail, HistoryView, ProcurementPlanView, SupplierHandoffView } from "./procurement";
import { CurrentReorderList } from "./reorder";
import { SettingsView } from "./settings";
import { ConfirmModal } from "./ui";

export default function Home() {
  const uploadFormRef = useRef(null);
  const searchRef = useRef(null);
  const searchWrapRef = useRef(null);
  const userWrapRef = useRef(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [view, setViewState] = useState("landing");
  const [historyId, setHistoryId] = useState(null);
  const [selectedHandoffId, setSelectedHandoffId] = useState(null);
  const [productHandle, setProductHandle] = useState(null);
  const [categorySlug, setCategorySlug] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  // Apply a saved app-state blob (from localStorage or the per-practice server
  // store) to component state.
  const hydrateFromState = (saved) => {
    if (!saved) return;
    const savedDefaults = { ...DEFAULT_BUYING_PREFS, ...(saved.defaultBuyingPrefs || {}) };
    // Backfill ids on lists saved before stable ids existed, so verification
    // decisions have a row to write back to.
    const items = (saved.draftItems || []).map((item) => (item.id ? item : { ...item, id: newItemId() }));
    setDraftItems(items);
    setUploadedDocs(saved.uploadedDocs || []);
    setArchivedLists(saved.archivedLists || []);
    setHandoffs(saved.handoffs || []);
    setCurrentHandoffId(saved.currentHandoffId || null);
    setListStage(saved.listStage === "review" ? "review" : "draft");
    setListTouched(Boolean(saved.listTouched));
    if (saved.listName) setListName(saved.listName);
    setDefaultBuyingPrefs(savedDefaults);
    // A list with no items is "new", so it starts from the saved defaults;
    // an in-progress list keeps its own working preferences.
    setBuyingPrefs(items.length ? { ...DEFAULT_BUYING_PREFS, ...(saved.buyingPrefs || {}) } : savedDefaults);
    if (items.length) setHasUploadedInvoice(true);
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

  // Persist the sidebar collapse preference per-device.
  useEffect(() => {
    if (!stateLoaded) return;
    try {
      window.localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? "1" : "0");
    } catch {
      // storage unavailable — non-fatal
    }
  }, [stateLoaded, navCollapsed]);

  // Once we know the visitor is signed in, pull the practice's saved list. A
  // server list wins (it's the cross-device source of truth); if there's none
  // yet, migrate any in-progress local list up once so it isn't lost.
  useEffect(() => {
    if (authed !== true || serverLoadStartedRef.current) return;
    serverLoadStartedRef.current = true;
    (async () => {
      try {
        const response = await fetch("/api/reorder-list", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const local = JSON.parse(window.localStorage.getItem(APP_STATE_KEY) || "null");

        if (!data || !data.state) {
          // No server list yet — migrate the local working list up once so it
          // isn't lost on the first cross-device sync.
          if (local && (local.draftItems || []).length) {
            await fetch("/api/reorder-list", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(local),
            });
          }
        } else {
          // Merge — never overwrite. A refresh within the 800ms save debounce
          // (or a keepalive PUT that didn't land / exceeded the 64KB limit) can
          // leave the server stale while localStorage still holds the just-added
          // items — e.g. a fresh invoice upload. Union by item key: keep every
          // server item (cross-device work) and re-add any local item the server
          // doesn't have yet, then push the merged list back up. A pure count
          // comparison can't tell "server is ahead" from "local is ahead", so it
          // would drop one side; the union keeps both.
          const localItems = (local && local.draftItems) || [];
          const serverItems = data.state.draftItems || [];
          const keyOf = (item) => item.product || item.extractedFrom || item.sku || item.id || "";
          const serverKeys = new Set(serverItems.map(keyOf));
          const localOnly = localItems.filter((item) => !serverKeys.has(keyOf(item)));
          // Union uploadedDocs too, else a kept local-only item whose source doc
          // lives only in localStorage would be filtered out of the table
          // (visibleDraftItems requires a matching doc in uploadedDocs).
          const localDocs = (local && local.uploadedDocs) || [];
          const serverDocs = data.state.uploadedDocs || [];
          const serverDocIds = new Set(serverDocs.map((doc) => doc.id));
          const mergedDocs = [...serverDocs, ...localDocs.filter((doc) => !serverDocIds.has(doc.id))];
          const merged = { ...data.state, draftItems: [...serverItems, ...localOnly], uploadedDocs: mergedDocs };
          hydrateFromState(merged);
          // If local contributed items the server lacked, persist the union so
          // the next device/load sees the complete list.
          if (localOnly.length) {
            await fetch("/api/reorder-list", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(merged),
            });
          }
        }
      } catch {
        // offline / server down — keep whatever localStorage hydrated.
      }
      setServerReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

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
    const blob = { draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs };
    latestBlobRef.current = blob;
    try {
      window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(blob));
    } catch {
      // storage full / unavailable — non-fatal
    }
    // Mirror to the server (debounced, last-write-wins). Gated on serverReady so
    // a save can't race ahead of the initial load and clobber the stored list.
    if (authed === true && serverReady) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      pendingSaveRef.current = true;
      saveTimerRef.current = setTimeout(() => {
        pendingSaveRef.current = false;
        fetch("/api/reorder-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(blob),
        }).catch(() => {
          // offline — localStorage still holds it; next change retries.
        });
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateLoaded, draftItems, uploadedDocs, archivedLists, handoffs, currentHandoffId, listStage, listTouched, listName, buyingPrefs, defaultBuyingPrefs, authed, serverReady]);

  // Flush a pending (debounced) save when the tab is hidden or unloaded, so a
  // refresh/close within the 800ms save window can't drop the latest edits.
  // `keepalive` lets the PUT outlive the page; pagehide covers the bfcache and
  // mobile-Safari cases beforeunload misses.
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
          keepalive: true,
        });
        pendingSaveRef.current = false;
      } catch {
        // best-effort; localStorage still holds the blob for next load
      }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
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
    if (!userMenuOpen && !searchTerm.trim()) return undefined;
    const onPointerDown = (event) => {
      if (userMenuOpen && userWrapRef.current && !userWrapRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
      if (searchTerm.trim() && searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setSearchTerm("");
      }
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (userMenuOpen) setUserMenuOpen(false);
      if (searchTerm.trim()) setSearchTerm("");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen, searchTerm]);

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
    if (view !== "plan" && view !== "home") return undefined;

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
  // how archiveCurrentList tallies items/suppliers/spend).
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
    () => deriveListStatus(deriveMatchRows(activeDraftItems, buyingPrefs), Boolean(currentHandoffId), listStage),
    [activeDraftItems, buyingPrefs, currentHandoffId, listStage]
  );

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

  function openMobileScan() {
    setScanResult(null);
    setScanCount(0);
    navigate("/app/scan");
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

    // One instance per product: a code already on the list re-surfaces so the
    // buyer sees it registered, but never bumps the quantity — they set quantity
    // back on the reorder list. This keeps a barcode lingering in frame (or a
    // deliberate re-scan) from piling up duplicate counts.
    const existing = code ? draftItems.find((item) => item.barcode === code) : null;
    if (existing) {
      setScanResult({ status: statusFromItem(existing), item: existing, isDuplicate: true, qty: existing.draftQty || 1 });
      showToast("Already on your list");
      return false;
    }

    // Resolve against the real catalog: GTIN/UPC barcode first, then exact SKU.
    const product = await lookupScannedProduct(code);
    const item = makeScanDraftItem(code, product);

    setDraftItems((items) => {
      if (code && items.some((it) => it.barcode === code)) return items; // race guard
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
    setDraftItems((items) => items.map((item) => (item.id === id ? { ...item, included: false } : item)));
  }

  // Pull the practice's latest list from the server on demand — lets a buyer at
  // their desk see items just scanned on a phone (the list is last-write-wins
  // synced, so a manual refresh is the safe way to merge in cross-device work).
  async function refreshFromServer() {
    if (authed !== true) return;
    try {
      const response = await fetch("/api/reorder-list", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!data || !data.state) return;

      // Merge — never overwrite. The server list may be stale relative to the
      // local working copy (the save is debounced 800ms and can silently fail),
      // so blindly hydrating it would drop items just added here — e.g. a fresh
      // invoice upload. Union the two by item key: keep every server item (this
      // is how phone-scanned items get pulled in) and re-add any local item the
      // server doesn't have yet. Other fields take the server's value.
      const localItems = (latestBlobRef.current?.draftItems) || draftItems || [];
      const serverItems = data.state.draftItems || [];
      const keyOf = (item) => item.product || item.extractedFrom || item.sku || item.id || "";
      const serverKeys = new Set(serverItems.map(keyOf));
      const localOnly = localItems.filter((item) => !serverKeys.has(keyOf(item)));
      // Union uploadedDocs too. A kept local-only item (e.g. a fresh invoice
      // upload the debounced save hasn't pushed yet) references a doc that lives
      // only in localStorage; if we kept the server's uploadedDocs, that item
      // would be filtered out of the table (visibleDraftItems requires a
      // matching doc), so it looks dropped even though it's still in the list.
      const localDocs = (latestBlobRef.current?.uploadedDocs) || uploadedDocs || [];
      const serverDocs = data.state.uploadedDocs || [];
      const serverDocIds = new Set(serverDocs.map((doc) => doc.id));
      const mergedDocs = [...serverDocs, ...localDocs.filter((doc) => !serverDocIds.has(doc.id))];
      const merged = { ...data.state, draftItems: [...serverItems, ...localOnly], uploadedDocs: mergedDocs };
      hydrateFromState(merged);
      // Persist the union so the next load/device sees the complete list
      // instead of re-dropping the local-only items on the next refresh.
      if (localOnly.length) {
        fetch("/api/reorder-list", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(merged),
        }).catch(() => {});
      }
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
      return key ? { ...item, selectedOfferKey: key } : item;
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
      };
    }));
  }

  // Snapshot the current list into History, then clear it. Rows are stored so
  // the archived list stays readable even though it's no longer editable.
  function archiveCurrentList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to archive yet");
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
      status: deriveListStatus(rows, Boolean(currentHandoffId), listStage),
      handoffId: currentHandoffId,
      rows,
      // Raw inputs so Duplicate can rebuild a working, visible list (items are
      // only shown when their documentIds match a doc in uploadedDocs).
      sourceItems: activeDraftItems,
      sourceDocs: uploadedDocs,
    };
    setArchivedLists((lists) => [entry, ...lists]);
    setDraftItems([]);
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
    setListStage("draft");
    setBuyingPrefs(defaultBuyingPrefs);
    showToast("List archived to History");
  }

  // Both whole-list actions are guarded by a confirmation modal so a buyer can't
  // wipe or archive their list with a single stray menu tap.
  function requestArchiveList() {
    if (!activeDraftItems.length) {
      showToast("Nothing to archive yet");
      return;
    }
    setConfirmDialog({
      title: "Archive this list?",
      body: "The current reorder list will be moved to History and a fresh, empty list will start. Archived lists stay viewable but can't be edited.",
      confirmLabel: "Archive list",
      onConfirm: archiveCurrentList,
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

  function clearCurrentList() {
    if (!activeDraftItems.length) {
      showToast("List is already empty");
      return;
    }
    setDraftItems([]);
    setUploadedDocs([]);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    setCurrentHandoffId(null);
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

  // Archive the live list and return to a fresh Home — the frozen handoff lives
  // on in History, so archiving here doesn't lose the order details.
  function archiveFromHandoff() {
    archiveCurrentList();
    navigate("/app");
  }

  // Rename an archived list in History (live list renames via setListName).
  function renameArchivedList(id, name) {
    setArchivedLists((lists) => lists.map((entry) => (entry.id === id ? { ...entry, name } : entry)));
  }

  // Copy an archived list into a fresh Current Reorder List. Restores the raw
  // items (with new ids) and their docs so visibility holds; the original stays
  // in History. Guards against silently overwriting an in-progress live list.
  function duplicateList(entry) {
    if (!entry?.sourceItems?.length) {
      showToast("This sample list has no items to duplicate");
      return;
    }
    if (activeDraftItems.length && !window.confirm(`Replace your current reorder list with a copy of "${entry.name}"?`)) {
      return;
    }
    setDraftItems(entry.sourceItems.map((item) => ({ ...item, id: newItemId() })));
    setUploadedDocs(entry.sourceDocs || []);
    setListName(`${entry.name} (copy)`);
    setCurrentHandoffId(null);
    setListStage("draft");
    setListTouched(true);
    setLastUpload(null);
    setHasUploadedInvoice(false);
    showToast(`Duplicated "${entry.name}" to a new list`);
    navigate("/app");
  }

  const navItems = [
    ["home", "icon-home", "Home"],
    ["catalog", "icon-grid", "Catalog"],
    ["history", "icon-clock", "History / Past Lists"],
    ["settings", "icon-settings", "Settings"],
  ];

  if (!isLoggedIn) {
    return (
      <>
        {view === "pricing" ? <PricingPage onNavigate={navigate} authed={authed === true} />
          : view === "about" ? <AboutPage onNavigate={navigate} authed={authed === true} />
          : view === "login" ? <LoginPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "signup" ? <SignupPage onNavigate={navigate} onAuthed={handleAuthed} />
          : view === "forgotPassword" ? <ForgotPasswordPage onNavigate={navigate} />
          : view === "resetPassword" ? <ResetPasswordPage onNavigate={navigate} />
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
          <button className="topbar-brand" type="button" onClick={() => setView("home")} aria-label="MedMKP home">
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
            <button className="topbar-alerts" type="button" aria-label="Alerts">
              <Icon name="icon-bell" className="button-icon" />
              <span className="topbar-badge">3</span>
            </button>
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
          <div className="sidebar-head">
            <button
              className="nav-collapse-btn"
              type="button"
              onClick={() => setNavCollapsed((collapsed) => !collapsed)}
              aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Icon name="icon-sidebar" className="button-icon" />
            </button>
          </div>
          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label]) => (
              <button
                key={target}
                className={`nav-tab ${target === "settings" ? "nav-tab-bottom" : ""} ${view === target ? "active" : ""}`}
                type="button"
                onClick={() => setView(target)}
                title={navCollapsed ? label : undefined}
              >
                <Icon name={icon} />
                <strong>{label}</strong>
              </button>
            ))}
          </nav>
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
            ) : (
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
                onNavigate={navigate}
                onToast={showToast}
                listTouched={listTouched}
                buyingPrefs={buyingPrefs}
                supplierShipping={supplierShipping}
                onBuyingPrefs={setBuyingPrefs}
                onApplyOptimized={applyOptimizedPlan}
                onArchiveList={requestArchiveList}
                onClearList={requestClearList}
                onConfirmMatch={applyMatchDecision}
                onLinkProduct={linkProductToItem}
                onRemoveItem={removeDraftItem}
                onRefresh={refreshFromServer}
                onNavigate={navigate}
              />
            )
          )}

          {view === "plan" && (
            <ProcurementPlanView
              items={activePlanItems}
              listName={listName}
              listStatus={liveListStatus}
              onBackToDraft={() => { backToDraft(); navigate("/app"); }}
              buyingPrefs={buyingPrefs}
              onBuyingPrefs={setBuyingPrefs}
              onPrepareHandoff={prepareHandoff}
              onBuildCart={setCartGroup}
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
              onArchive={archiveFromHandoff}
              onBuildCart={setCartGroup}
              onNavigate={navigate}
              onToast={showToast}
            />
          )}

          {view === "history" && <HistoryView archivedLists={archivedLists} onOpen={(id) => navigate(`/app/history/${id}`)} />}

          {view === "historyDetail" && (
            <HistoryDetail
              id={historyId}
              archivedLists={archivedLists}
              handoffs={handoffs}
              onBack={() => navigate("/app/history")}
              onRename={renameArchivedList}
              onDuplicate={duplicateList}
              onViewHandoff={(hid) => navigate(`/app/review/handoff?ho=${hid}`)}
            />
          )}

          {view === "catalog" && <CatalogView onNavigate={navigate} />}

          {view === "catalogSearch" && (
            <CatalogSearchView query={searchQuery} onNavigate={navigate} />
          )}

          {view === "catalogCategory" && (
            <CatalogCategoryView slug={categorySlug} onNavigate={navigate} />
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
        <MobileBottomNav
          view={view}
          onNavigate={setView}
          onScan={openMobileScan}
        />
        </div>
      </div>

      {cartGroup && (
        <CartBuilderModal
          group={cartGroup}
          buyingPrefs={buyingPrefs}
          onClose={() => setCartGroup(null)}
          onStockResults={recordLiveStock}
          onSwitchOffer={applyMatchDecision}
          onToast={showToast}
        />
      )}

      {confirmDialog && (
        <ConfirmModal
          {...confirmDialog}
          onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog(null); }}
          onClose={() => setConfirmDialog(null)}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
  );
}

