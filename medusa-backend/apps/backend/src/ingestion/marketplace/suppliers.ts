// Amazon/Alibaba are search-sourced marketplaces. Their listings are surfaced in
// a dedicated "Also available on" section and kept OUT of the per-unit supplier
// price comparison (wholesale/MOQ pricing would distort the ranking). Supplier
// ids follow `msup_${provider.id}` from the marketplace ingest script's
// ensureSupplier, so they stay in lockstep with the provider registry.
export const MARKETPLACE_SUPPLIER_IDS = new Set(["msup_amazon", "msup_alibaba"])

export function isMarketplaceSupplierId(supplierId: string | null | undefined): boolean {
  return !!supplierId && MARKETPLACE_SUPPLIER_IDS.has(supplierId)
}
