import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const surfacesSource = await readFile(new URL("./launchSurfaces.js", import.meta.url), "utf8");
const libSource = await readFile(new URL("./lib.jsx", import.meta.url), "utf8");

function loadRouteHelpers() {
  const routeStart = libSource.indexOf("export const routeByView");
  const routeEnd = libSource.indexOf("\n\n// A practice is entitled");
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "route helpers source should be present");

  const source = [
    surfacesSource,
    libSource.slice(routeStart, routeEnd),
    "return { SURFACES, isLive, isDormant, isPaid, routeByView, viewFromPath, pathForView };",
  ].join("\n")
    .replaceAll("export const", "const")
    .replaceAll("export function", "function");

  // eslint-disable-next-line no-new-func
  return new Function(source)();
}

const { isLive, isDormant, isPaid, viewFromPath } = loadRouteHelpers();

test("launch registry keeps unknown public views live by default", () => {
  assert.equal(isLive("landing"), true);
  assert.equal(isDormant("landing"), false);
  assert.equal(isPaid("plan"), true);
});

test("dormant authenticated paths resolve to home with a redirect marker", () => {
  for (const path of [
    "/app/needs-attention",
    "/app/locations",
    "/app/locations/office-layout",
    "/app/office-layout",
    "/app/locations/layout",
    "/app/locations/new",
    "/app/locations/qr-labels",
    "/app/locations/front-desk",
    "/app/savings",
    "/app/evidence",
    "/app/evidence/review",
    "/app/evidence/viewer",
    "/app/evidence/redline",
    "/app/evidence/binder",
    "/app/reports",
  ]) {
    assert.deepEqual(
      viewFromPath(path),
      { view: "home", isLoggedIn: true, dormantRedirect: true },
      `${path} should land on launch home`,
    );
  }
});

test("live authenticated paths resolve as before", () => {
  assert.deepEqual(viewFromPath("/app"), { view: "home", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/reorder-list"), { view: "reorderList", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/history"), { view: "history", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/history/abc"), { view: "historyDetail", isLoggedIn: true, historyId: "abc" });
  assert.deepEqual(viewFromPath("/app/catalog"), { view: "catalog", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/catalog/search?q=glove"), { view: "catalogSearch", isLoggedIn: true, searchQuery: "glove" });
  assert.deepEqual(viewFromPath("/app/catalog/supplier/s1"), { view: "catalogSupplier", isLoggedIn: true, supplierId: "s1" });
  assert.deepEqual(viewFromPath("/app/catalog/gloves"), { view: "catalogCategory", isLoggedIn: true, categorySlug: "gloves" });
  assert.deepEqual(viewFromPath("/app/product/prophy"), { view: "productDetail", isLoggedIn: true, productHandle: "prophy" });
  assert.deepEqual(viewFromPath("/app/settings"), { view: "settings", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/review"), { view: "plan", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/review/handoff?ho=ho_1"), { view: "handoff", isLoggedIn: true, handoffId: "ho_1" });
});

test("legacy aliases still resolve before launch filtering", () => {
  assert.deepEqual(viewFromPath("/app/plan"), { view: "plan", isLoggedIn: true });
  assert.deepEqual(viewFromPath("/app/scan-sessions"), { view: "scanner", isLoggedIn: true, scanLocationId: "", scanMode: "" });
  assert.deepEqual(viewFromPath("/app/scan-sessions/old"), { view: "scanner", isLoggedIn: true });
});
