// Registry of supplier automation adapters, keyed by supplier slug. Add a new
// supplier by dropping in a module that exports { login, addLine, cartUrl } and
// wiring it here — the runner stays supplier-agnostic.

import * as dcdental from "./dcdental.mjs";
import * as darby from "./darby.mjs";

const ADAPTERS = {
  dcdental,
  // DC Dental's slug in the catalog is the bare domain; accept both forms.
  dcdental_com: dcdental,
  // Darby's catalog slug is "darby-dental"; accept a few spelling variants.
  "darby-dental": darby,
  darby,
  darbydental_com: darby,
};

export function adapterFor(slug) {
  return ADAPTERS[slug] || null;
}
