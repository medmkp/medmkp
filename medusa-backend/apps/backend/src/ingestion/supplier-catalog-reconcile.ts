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

// ---------------------------------------------------------------------------
// Streaming reconcile (for large catalogs)
// ---------------------------------------------------------------------------

/**
 * `reconcileSupplierCatalog` above takes the WHOLE desired catalog at once. For
 * a small/medium supplier that is fine, but a 60k–120k product catalog (e.g.
 * Patterson) blows the heap: the caller has to hold every parsed row plus the
 * full supplierProducts/matches artifact arrays in memory before a single write
 * (this OOM-killed the first Patterson prod run on the 7 GB NUC).
 *
 * The streaming session keeps the SAME gap-free guarantees (additive upserts
 * first, stale soft-delete last) but lets the caller feed the catalog in
 * batches, so peak memory is one batch + the set of seen ids (cheap strings):
 *
 *   const session = await beginSupplierCatalogReconcile(medmkp, { ... })
 *   for await (const batch of batches) await session.upsertBatch(batch)
 *   const result = await session.finalize()
 *
 * Stale soft-delete is deferred to finalize() because only then is the full set
 * of surviving ids known. The shrink guard runs there too, before any delete —
 * the upserts that already happened are non-destructive, so guarding the delete
 * is sufficient. Pass `softDeleteStale: false` to finalize() to commit the
 * batches additively but skip removals (used when a crawl is too degraded to be
 * trusted as the complete catalog).
 */

export type SupplierCatalogBatch = {
  supplierProducts: Array<Record<string, unknown> & { id: string }>
  canonicalProductMatches: Array<Record<string, unknown> & { id: string }>
  priceSnapshots: Array<Record<string, unknown> & { id: string }>
}

export type SupplierCatalogReconcileSession = {
  upsertBatch: (batch: SupplierCatalogBatch) => Promise<void>
  finalize: (opts?: { softDeleteStale?: boolean }) => Promise<ReconcileResult>
  desiredProductCount: () => number
}

// Per-batch match upsert: create placeholders for genuinely new products and
// restore reappearing ones. Never updates or soft-deletes — the matcher owns
// surviving rows, and stale removal is handled once, in finalize().
async function upsertMatchesBatch(
  medmkp: ReconcileService,
  desired: Array<Record<string, unknown> & { id: string }>,
  chunkSize: number
) {
  if (!desired.length) {
    return { created: 0, restored: 0 }
  }

  const existing = await medmkp.listCanonicalProductMatches(
    { id: desired.map((row) => row.id) },
    { withDeleted: true, select: ["id", "deleted_at"] }
  )
  const active = new Set<string>()
  const deleted = new Set<string>()
  for (const row of existing) {
    ;(isSoftDeleted(row) ? deleted : active).add(row.id)
  }

  const toCreate = desired.filter(
    (row) => !active.has(row.id) && !deleted.has(row.id)
  )
  const toRestore = desired
    .filter((row) => deleted.has(row.id))
    .map((row) => row.id)

  if (toCreate.length) {
    await inChunks(toCreate, chunkSize, (chunk) =>
      medmkp.createCanonicalProductMatches(chunk)
    )
  }
  if (toRestore.length) {
    await inChunks(toRestore, chunkSize, (chunk) =>
      medmkp.restoreCanonicalProductMatches(chunk)
    )
  }

  return { created: toCreate.length, restored: toRestore.length }
}

export async function beginSupplierCatalogReconcile(
  medmkp: ReconcileService,
  input: {
    supplier_id: string
    source_catalog: string
    source: unknown
  },
  options: {
    allowCatalogShrink: boolean
    chunkSize?: number
    log?: (...args: unknown[]) => void
  }
): Promise<SupplierCatalogReconcileSession> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK
  const log = options.log ?? (() => {})
  const filters = {
    supplier_id: input.supplier_id,
    source_catalog: input.source_catalog,
  }

  // Only ids + deleted_at are needed to diff — never load full existing rows
  // (the whole point is to stay memory-bounded on a large catalog).
  const [existingProducts, existingSources] = await Promise.all([
    medmkp.listSupplierProducts(filters, {
      withDeleted: true,
      select: ["id", "deleted_at"],
    }),
    medmkp.listSupplierCatalogSources(filters, { withDeleted: true }),
  ])

  const productActive = new Set<string>()
  const productDeleted = new Set<string>()
  for (const row of existingProducts) {
    ;(isSoftDeleted(row) ? productDeleted : productActive).add(row.id)
  }
  const existingActiveProductCount = productActive.size

  // Upsert the source row up-front so product creates have it present.
  await reconcileById({
    desired: asArray(input.source) as Array<
      Record<string, unknown> & { id: string }
    >,
    existing: existingSources,
    create: (rows) => medmkp.createSupplierCatalogSources(rows),
    update: (rows) => medmkp.updateSupplierCatalogSources(rows),
    restore: (ids) => medmkp.restoreSupplierCatalogSources(ids),
    softDelete: (ids) => medmkp.softDeleteSupplierCatalogSources(ids),
    chunkSize,
  })

  const desired = new Set<string>()
  const counts = {
    pCreate: 0,
    pUpdate: 0,
    pRestore: 0,
    mCreate: 0,
    mRestore: 0,
    sCreate: 0,
    sUpdate: 0,
  }

  return {
    desiredProductCount: () => desired.size,

    async upsertBatch(batch) {
      const toCreate: typeof batch.supplierProducts = []
      const toUpdate: typeof batch.supplierProducts = []
      const toRestore: typeof batch.supplierProducts = []
      for (const row of batch.supplierProducts) {
        // A product can recur across batches (same SKU on multiple pages); its
        // id is deterministic, so process it once.
        if (desired.has(row.id)) continue
        desired.add(row.id)
        if (productActive.has(row.id)) toUpdate.push(row)
        else if (productDeleted.has(row.id)) toRestore.push(row)
        else toCreate.push(row)
      }

      if (toCreate.length) {
        await inChunks(toCreate, chunkSize, (rows) =>
          medmkp.createSupplierProducts(rows)
        )
      }
      if (toRestore.length) {
        await inChunks(
          toRestore.map((row) => row.id),
          chunkSize,
          (ids) => medmkp.restoreSupplierProducts(ids)
        )
        await inChunks(toRestore, chunkSize, (rows) =>
          medmkp.updateSupplierProducts(rows)
        )
      }
      if (toUpdate.length) {
        await inChunks(toUpdate, chunkSize, (rows) =>
          medmkp.updateSupplierProducts(rows)
        )
      }
      counts.pCreate += toCreate.length
      counts.pUpdate += toUpdate.length
      counts.pRestore += toRestore.length

      // Only newly created/restored products need their placeholder match
      // touched; scope the per-batch match upsert to those to avoid querying
      // for survivors the matcher already owns.
      const newProductIds = new Set([
        ...toCreate.map((row) => row.id),
        ...toRestore.map((row) => row.id),
      ])
      const matchBatch = batch.canonicalProductMatches.filter((row) =>
        newProductIds.has(row.supplier_product_id as string)
      )
      const matches = await upsertMatchesBatch(medmkp, matchBatch, chunkSize)
      counts.mCreate += matches.created
      counts.mRestore += matches.restored

      const snapshots = await reconcilePriceSnapshots(medmkp, {
        desired: batch.priceSnapshots,
        chunkSize,
      })
      counts.sCreate += snapshots.created
      counts.sUpdate += snapshots.updated
    },

    async finalize(opts) {
      const softDeleteStale = opts?.softDeleteStale ?? true
      let productsSoftDeleted = 0
      let matchesSoftDeleted = 0

      if (softDeleteStale) {
        assertCatalogReplaceNotDestructive({
          supplierId: input.supplier_id,
          sourceCatalog: input.source_catalog,
          existingCount: existingActiveProductCount,
          newCount: desired.size,
          allowCatalogShrink: options.allowCatalogShrink,
        })

        const removed = [...productActive].filter((id) => !desired.has(id))
        if (removed.length) {
          await inChunks(removed, chunkSize, (ids) =>
            medmkp.softDeleteSupplierProducts(ids)
          )
          productsSoftDeleted = removed.length

          const staleMatchIds: string[] = []
          await inChunks(removed, chunkSize, async (chunk) => {
            const rows = await medmkp.listCanonicalProductMatches({
              supplier_product_id: chunk,
            })
            for (const row of rows) staleMatchIds.push(row.id)
          })
          if (staleMatchIds.length) {
            await inChunks(staleMatchIds, chunkSize, (ids) =>
              medmkp.softDeleteCanonicalProductMatches(ids)
            )
            matchesSoftDeleted = staleMatchIds.length
          }
        }
      }

      log(
        `[catalog-reconcile] supplier=${input.supplier_id} source=${input.source_catalog} ` +
          `products(+${counts.pCreate}/~${counts.pUpdate}/restore ${counts.pRestore}/-${productsSoftDeleted}) ` +
          `matches(+${counts.mCreate}/restore ${counts.mRestore}/-${matchesSoftDeleted}) ` +
          `snapshots(+${counts.sCreate}/~${counts.sUpdate})` +
          (softDeleteStale ? "" : " [stale soft-delete SKIPPED]")
      )

      return {
        supplier_products: {
          created: counts.pCreate,
          updated: counts.pUpdate,
          restored: counts.pRestore,
          soft_deleted: productsSoftDeleted,
        },
        canonical_product_matches: {
          created: counts.mCreate,
          restored: counts.mRestore,
          soft_deleted: matchesSoftDeleted,
        },
        price_snapshots: {
          created: counts.sCreate,
          updated: counts.sUpdate,
        },
      }
    },
  }
}
