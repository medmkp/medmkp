export const SURFACES = {
  // live
  home: "live", reorderList: "live", history: "live", historyDetail: "live",
  catalog: "live", catalogSearch: "live", catalogCategory: "live",
  catalogSupplier: "live", productDetail: "live", settings: "live",
  billingReturn: "live", scanner: "live",
  // paid (reachable as normal in THIS issue; paywall behavior is a separate issue)
  plan: "paid", handoff: "paid",
  // dormant
  dashboard: "dormant", locations: "dormant", locationDetail: "dormant",
  locationAdd: "dormant", officeLayout: "dormant", qrLabels: "dormant",
  savings: "dormant", evidence: "dormant", evidenceReview: "dormant",
  evidenceViewer: "dormant", evidenceRedline: "dormant", evidenceBinder: "dormant",
  reports: "dormant",
};
export const isLive = (v) => (SURFACES[v] || "live") !== "dormant";
export const isDormant = (v) => SURFACES[v] === "dormant";
export const isPaid = (v) => SURFACES[v] === "paid";
