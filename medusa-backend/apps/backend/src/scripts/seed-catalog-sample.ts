import fs from "fs"
import path from "path"
import { Client } from "pg"
import { assertDestructiveDbOperationAllowed } from "../utils/db-safety"

const DEFAULT_PER_SUPPLIER = 100

function resolveTargetDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  const envPath = path.resolve(__dirname, "../../.env")
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const match = line.match(/^DATABASE_URL=(.+)$/)
      if (match) {
        return match[1].trim()
      }
    }
  }
  throw new Error("DATABASE_URL is not set and could not be read from .env")
}

function resolvePerSupplier(): number {
  const arg = process.argv.find((entry) => entry.startsWith("--per-supplier="))
  const value = arg ? Number(arg.split("=")[1]) : DEFAULT_PER_SUPPLIER
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid --per-supplier value: ${arg}`)
  }
  return value
}

function sslConfig(databaseUrl: string) {
  return /localhost|127\.0\.0\.1/.test(databaseUrl)
    ? undefined
    : { rejectUnauthorized: false }
}

async function copyRows(
  target: Client,
  table: string,
  rows: Record<string, unknown>[]
): Promise<number> {
  if (!rows.length) {
    return 0
  }

  const columns = Object.keys(rows[0])
  const columnSql = columns.map((column) => `"${column}"`).join(", ")
  let inserted = 0

  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200)
    const params: unknown[] = []
    const valuesSql = chunk
      .map(
        (row) =>
          `(${columns
            .map((column) => {
              params.push(row[column])
              return `$${params.length}`
            })
            .join(", ")})`
      )
      .join(", ")

    const result = await target.query(
      `INSERT INTO ${table} (${columnSql}) VALUES ${valuesSql} ON CONFLICT DO NOTHING`,
      params
    )
    inserted += result.rowCount ?? 0
  }

  return inserted
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  if (!sourceUrl) {
    throw new Error(
      "Usage: SOURCE_DATABASE_URL=postgres://... npm run seed:catalog-sample -- [--per-supplier=100]\n" +
        "Copies a sample of supplier catalog data (products, prices, matches, canonical products)\n" +
        "from the source database into DATABASE_URL. The source is opened read-only."
    )
  }
  const targetUrl = resolveTargetDatabaseUrl()
  const perSupplier = resolvePerSupplier()

  assertDestructiveDbOperationAllowed(
    "seed:catalog-sample (writes catalog rows into the target database)",
    targetUrl
  )

  const source = new Client({
    connectionString: sourceUrl,
    ssl: sslConfig(sourceUrl),
  })
  const target = new Client({
    connectionString: targetUrl,
    ssl: sslConfig(targetUrl),
  })
  await source.connect()
  await target.connect()
  await source.query("SET default_transaction_read_only = on")

  try {
    console.log(`Sampling up to ${perSupplier} products per supplier from source...`)
    const suppliers = await source.query(
      "SELECT * FROM medmkp_supplier WHERE deleted_at IS NULL"
    )
    const sources = await source.query(
      "SELECT * FROM medmkp_supplier_catalog_source WHERE deleted_at IS NULL"
    )
    const products = await source.query(
      `WITH snap_ids AS (
         SELECT DISTINCT supplier_product_id
         FROM medmkp_supplier_price_snapshot
         WHERE deleted_at IS NULL
       )
       SELECT p.*
       FROM (
         SELECT p2.id,
           row_number() OVER (
             PARTITION BY p2.supplier_id
             ORDER BY (si.supplier_product_id IS NULL), p2.id
           ) AS rn
         FROM medmkp_supplier_product p2
         LEFT JOIN snap_ids si ON si.supplier_product_id = p2.id
         WHERE p2.deleted_at IS NULL
       ) ranked
       JOIN medmkp_supplier_product p ON p.id = ranked.id
       WHERE ranked.rn <= $1`,
      [perSupplier]
    )

    const productIds = products.rows.map((row) => row.id)
    const snapshots = await source.query(
      `SELECT * FROM medmkp_supplier_price_snapshot
       WHERE deleted_at IS NULL AND supplier_product_id = ANY($1)`,
      [productIds]
    )
    const matches = await source.query(
      `SELECT * FROM medmkp_canonical_product_match
       WHERE deleted_at IS NULL AND supplier_product_id = ANY($1)`,
      [productIds]
    )

    const canonicalIds = [
      ...new Set(
        matches.rows
          .map((row) => row.canonical_product_id)
          .filter((id) => typeof id === "string" && id.length > 0)
      ),
    ]
    const canonicals = canonicalIds.length
      ? await source.query(
          `SELECT * FROM medmkp_canonical_product
           WHERE deleted_at IS NULL AND id = ANY($1)`,
          [canonicalIds]
        )
      : { rows: [] }

    console.log("Copying into target (existing rows are kept, duplicates skipped)...")
    const counts = {
      suppliers: await copyRows(target, "medmkp_supplier", suppliers.rows),
      catalog_sources: await copyRows(
        target,
        "medmkp_supplier_catalog_source",
        sources.rows
      ),
      canonical_products: await copyRows(
        target,
        "medmkp_canonical_product",
        canonicals.rows
      ),
      supplier_products: await copyRows(
        target,
        "medmkp_supplier_product",
        products.rows
      ),
      price_snapshots: await copyRows(
        target,
        "medmkp_supplier_price_snapshot",
        snapshots.rows
      ),
      matches: await copyRows(
        target,
        "medmkp_canonical_product_match",
        matches.rows
      ),
    }

    console.log(
      `Sampled from source: ${products.rows.length} products, ` +
        `${snapshots.rows.length} price snapshots, ${matches.rows.length} matches, ` +
        `${canonicals.rows.length} canonical products.`
    )
    console.log(`Newly inserted into target: ${JSON.stringify(counts, null, 2)}`)
  } finally {
    await source.end()
    await target.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
