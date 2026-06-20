/**
 * Gap-free supplier catalog reconcile.
 *
 * The original ingestion commit was delete-all-then-create: it removed every
 * existing row for a supplier/source and then re-inserted the fresh crawl in
 * batches. Because that is not a single transaction, a still-valid product was
 * absent from the base tables for the whole re-insert window — so live reads
 * (search / scan / PDP offers) saw the supplier's catalog disappear and
 * reappear during every refresh.
 *
 * This replaces that with the industry-standard diff/upsert + soft-delete:
 *
 *   - update rows whose id already exists  (in place — never absent)
 *   - create genuinely new rows
 *   - restore rows that were previously soft-deleted and have reappeared
 *   - soft-delete only the stale diff (existing − desired), AFTER the new data
 *     is in place
 *
 * Soft-delete (Medusa's deleted_at) is honored everywhere reads happen: the
 * base-table list* calls exclude deleted_at by default and the price/offer
 * materialized views already filter `deleted_at is null`. So at no point is a
 * currently-valid row missing, and no read-side change is required.
 *
 * IDs are deterministic across runs (boundedId over supplier+source+sku), which
 * is what makes the diff possible.
 */

export const CATALOG_SHRINK_FLOOR_RATIO = 0.5
export const CATALOG_SHRINK_GUARD_MIN_EXISTING = 50

export function assertCatalogReplaceNotDestructive(input: {
  supplierId: string
  sourceCatalog: string
  existingCount: number
  newCount: number
  allowCatalogShrink: boolean
}) {
  if (input.allowCatalogShrink) {
    return
  }
  if (
    input.existingCount >= CATALOG_SHRINK_GUARD_MIN_EXISTING &&
    input.newCount < input.existingCount * CATALOG_SHRINK_FLOOR_RATIO
  ) {
    throw new Error(
      `Refusing to replace supplier=${input.supplierId} source=${input.sourceCatalog}: ` +
        `new catalog has ${input.newCount} rows vs ${input.existingCount} existing ` +
        `(>${Math.round((1 - CATALOG_SHRINK_FLOOR_RATIO) * 100)}% shrink). ` +
        `Fix the extraction and re-run, or pass --allow-catalog-shrink to override.`
    )
  }
}

type IdRow = { id: string; deleted_at?: Date | string | null }

// Structural view of the MedMKP module service — only the methods reconcile
// needs, so the helper is unit-testable against a lightweight mock.
export type ReconcileService = {
  listSupplierProducts: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<IdRow[]>
  createSupplierProducts: (rows: unknown[]) => Promise<unknown>
  updateSupplierProducts: (rows: unknown[]) => Promise<unknown>
  softDeleteSupplierProducts: (ids: string[]) => Promise<unknown>
  restoreSupplierProducts: (ids: string[]) => Promise<unknown>

  listSupplierCatalogSources: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<IdRow[]>
  createSupplierCatalogSources: (rows: unknown) => Promise<unknown>
  updateSupplierCatalogSources: (rows: unknown[]) => Promise<unknown>
  softDeleteSupplierCatalogSources: (ids: string[]) => Promise<unknown>
  restoreSupplierCatalogSources: (ids: string[]) => Promise<unknown>

  listCanonicalProductMatches: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<IdRow[]>
  createCanonicalProductMatches: (rows: unknown[]) => Promise<unknown>
  restoreCanonicalProductMatches: (ids: string[]) => Promise<unknown>
  softDeleteCanonicalProductMatches: (ids: string[]) => Promise<unknown>

  listSupplierPriceSnapshots: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<IdRow[]>
  createSupplierPriceSnapshots: (rows: unknown[]) => Promise<unknown>
  updateSupplierPriceSnapshots: (rows: unknown[]) => Promise<unknown>
}

export type ReconcileInput = {
  supplier_id: string
  source_catalog: string
  source: unknown
  supplierProducts: Array<Record<string, unknown> & { id: string }>
  canonicalProductMatches: Array<Record<string, unknown> & { id: string }>
  priceSnapshots: Array<Record<string, unknown> & { id: string }>
}

export type ReconcileResult = {
  supplier_products: {
    created: number
    updated: number
    restored: number
    soft_deleted: number
  }
  canonical_product_matches: {
    created: number
    restored: number
    soft_deleted: number
  }
  price_snapshots: { created: number; updated: number }
}

const DEFAULT_CHUNK = 500

function isSoftDeleted(row: IdRow) {
  return row.deleted_at != null
}

async function inChunks<T>(
  rows: T[],
  size: number,
  fn: (chunk: T[]) => Promise<unknown>
) {
  for (let offset = 0; offset < rows.length; offset += size) {
    await fn(rows.slice(offset, offset + size))
  }
}

/**
 * Generic create/update/restore + soft-delete-stale reconcile keyed by id.
 * Order is chosen so a currently-valid row is never absent: additive writes
 * (create, restore, update) happen before the stale soft-delete.
 */
async function reconcileById<T extends { id: string }>(opts: {
  desired: T[]
  existing: IdRow[]
  create: (rows: T[]) => Promise<unknown>
  update: (rows: T[]) => Promise<unknown>
  restore: (ids: string[]) => Promise<unknown>
  softDelete: (ids: string[]) => Promise<unknown>
  chunkSize: number
}) {
  const activeIds = new Set<string>()
  const deletedIds = new Set<string>()
  for (const row of opts.existing) {
    ;(isSoftDeleted(row) ? deletedIds : activeIds).add(row.id)
  }

  const desiredIds = new Set(opts.desired.map((row) => row.id))
  const toCreate: T[] = []
  const toUpdate: T[] = []
  const toRestore: T[] = []
  for (const row of opts.desired) {
    if (activeIds.has(row.id)) {
      toUpdate.push(row)
    } else if (deletedIds.has(row.id)) {
      toRestore.push(row)
    } else {
      toCreate.push(row)
    }
  }

  const staleIds = [...activeIds].filter((id) => !desiredIds.has(id))

  if (toCreate.length) {
    await inChunks(toCreate, opts.chunkSize, opts.create)
  }
  if (toRestore.length) {
    await inChunks(
      toRestore.map((row) => row.id),
      opts.chunkSize,
      opts.restore
    )
    await inChunks(toRestore, opts.chunkSize, opts.update)
  }
  if (toUpdate.length) {
    await inChunks(toUpdate, opts.chunkSize, opts.update)
  }
  if (staleIds.length) {
    await inChunks(staleIds, opts.chunkSize, opts.softDelete)
  }

  return {
    created: toCreate.length,
    updated: toUpdate.length,
    restored: toRestore.length,
    soft_deleted: staleIds.length,
  }
}

export async function reconcileSupplierCatalog(
  medmkp: ReconcileService,
  input: ReconcileInput,
  options: {
    allowCatalogShrink: boolean
    chunkSize?: number
    log?: (...args: unknown[]) => void
  }
): Promise<ReconcileResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK
  const log = options.log ?? (() => {})
  const filters = {
    supplier_id: input.supplier_id,
    source_catalog: input.source_catalog,
  }

  const [existingProducts, existingSources] = await Promise.all([
    medmkp.listSupplierProducts(filters, { withDeleted: true }),
    medmkp.listSupplierCatalogSources(filters, { withDeleted: true }),
  ])

  const existingActiveProductCount = existingProducts.filter(
    (row) => !isSoftDeleted(row)
  ).length

  assertCatalogReplaceNotDestructive({
    supplierId: input.supplier_id,
    sourceCatalog: input.source_catalog,
    existingCount: existingActiveProductCount,
    newCount: input.supplierProducts.length,
    allowCatalogShrink: options.allowCatalogShrink,
  })

  // Sources first so the fresh source row exists before its products reference it.
  const sources = await reconcileById({
    desired: asArray(input.source) as Array<Record<string, unknown> & { id: string }>,
    existing: existingSources,
    create: (rows) => medmkp.createSupplierCatalogSources(rows),
    update: (rows) => medmkp.updateSupplierCatalogSources(rows),
    restore: (ids) => medmkp.restoreSupplierCatalogSources(ids),
    softDelete: (ids) => medmkp.softDeleteSupplierCatalogSources(ids),
    chunkSize,
  })

  const products = await reconcileById({
    desired: input.supplierProducts,
    existing: existingProducts,
    create: (rows) => medmkp.createSupplierProducts(rows),
    update: (rows) => medmkp.updateSupplierProducts(rows),
    restore: (ids) => medmkp.restoreSupplierProducts(ids),
    softDelete: (ids) => medmkp.softDeleteSupplierProducts(ids),
    chunkSize,
  })

  // Products that are going away in this run — used to scope match soft-deletes.
  const desiredProductIds = new Set(input.supplierProducts.map((row) => row.id))
  const removedProductIds = existingProducts
    .filter((row) => !isSoftDeleted(row) && !desiredProductIds.has(row.id))
    .map((row) => row.id)

  const matches = await reconcileMatches(medmkp, {
    desired: input.canonicalProductMatches,
    desiredProductIds,
    removedProductIds,
    chunkSize,
  })

  const snapshots = await reconcilePriceSnapshots(medmkp, {
    desired: input.priceSnapshots,
    chunkSize,
  })

  log(
    `[catalog-reconcile] supplier=${input.supplier_id} source=${input.source_catalog} ` +
      `products(+${products.created}/~${products.updated}/restore ${products.restored}/-${products.soft_deleted}) ` +
      `matches(+${matches.created}/restore ${matches.restored}/-${matches.soft_deleted}) ` +
      `snapshots(+${snapshots.created}/~${snapshots.updated}) sources(+${sources.created}/~${sources.updated})`
  )

  return {
    supplier_products: products,
    canonical_product_matches: matches,
    price_snapshots: snapshots,
  }
}

/**
 * Matches are special. The matcher (commitMatchRun) updates the ingestion
 * placeholder rows in place (keyed by supplier_product_id) to attach resolved
 * canonical products, and separately owns the mcpm_auto_%/substitute rows. So
 * ingestion must NOT update or delete matches for surviving products — doing so
 * would wipe the matcher's work. It only:
 *   - creates placeholders for newly-added products,
 *   - restores placeholders for reappearing products,
 *   - soft-deletes ALL match rows tied to removed products (placeholder + the
 *     matcher's auto/substitute rows for that product).
 */
async function reconcileMatches(
  medmkp: ReconcileService,
  opts: {
    desired: Array<Record<string, unknown> & { id: string }>
    desiredProductIds: Set<string>
    removedProductIds: string[]
    chunkSize: number
  }
) {
  const desiredIds = opts.desired.map((row) => row.id)
  const existing = desiredIds.length
    ? await medmkp.listCanonicalProductMatches(
        { id: desiredIds },
        { withDeleted: true, select: ["id", "deleted_at"] }
      )
    : []

  const activeIds = new Set<string>()
  const deletedIds = new Set<string>()
  for (const row of existing) {
    ;(isSoftDeleted(row) ? deletedIds : activeIds).add(row.id)
  }

  const toCreate = opts.desired.filter(
    (row) => !activeIds.has(row.id) && !deletedIds.has(row.id)
  )
  const toRestore = opts.desired
    .filter((row) => deletedIds.has(row.id))
    .map((row) => row.id)

  // Every match row tied to a removed product (placeholder + auto + substitute).
  const staleMatchIds = opts.removedProductIds.length
    ? (
        await medmkp.listCanonicalProductMatches({
          supplier_product_id: opts.removedProductIds,
        })
      ).map((row) => row.id)
    : []

  if (toCreate.length) {
    await inChunks(toCreate, opts.chunkSize, (chunk) =>
      medmkp.createCanonicalProductMatches(chunk)
    )
  }
  if (toRestore.length) {
    await inChunks(toRestore, opts.chunkSize, (chunk) =>
      medmkp.restoreCanonicalProductMatches(chunk)
    )
  }
  if (staleMatchIds.length) {
    await inChunks(staleMatchIds, opts.chunkSize, (chunk) =>
      medmkp.softDeleteCanonicalProductMatches(chunk)
    )
  }

  return {
    created: toCreate.length,
    restored: toRestore.length,
    soft_deleted: staleMatchIds.length,
  }
}

/**
 * Price snapshots are an append-only time series; ids embed captured_at, so a
 * fresh run only ever inserts new ids (and updates on the rare same-timestamp
 * re-run). Nothing is deleted — history is preserved.
 */
async function reconcilePriceSnapshots(
  medmkp: ReconcileService,
  opts: {
    desired: Array<Record<string, unknown> & { id: string }>
    chunkSize: number
  }
) {
  if (!opts.desired.length) {
    return { created: 0, updated: 0 }
  }

  // Snapshot ids embed captured_at, so collisions only happen on a same-window
  // re-run. Look up which desired ids already exist and update those; create the
  // rest. (Never delete — the series is the price history.)
  const desiredIds = opts.desired.map((row) => row.id)
  const existing = await medmkp.listSupplierPriceSnapshots(
    { id: desiredIds },
    { withDeleted: true, select: ["id"] }
  )
  const existingIds = new Set(existing.map((row) => row.id))
  const toCreate = opts.desired.filter((row) => !existingIds.has(row.id))
  const toUpdate = opts.desired.filter((row) => existingIds.has(row.id))

  if (toCreate.length) {
    await inChunks(toCreate, opts.chunkSize, (chunk) =>
      medmkp.createSupplierPriceSnapshots(chunk)
    )
  }
  if (toUpdate.length) {
    await inChunks(toUpdate, opts.chunkSize, (chunk) =>
      medmkp.updateSupplierPriceSnapshots(chunk)
    )
  }

  return { created: toCreate.length, updated: toUpdate.length }
}

function asArray<T>(value: T | T[]): T[] {
  if (value == null) {
    return []
  }
  return Array.isArray(value) ? value : [value]
}
