import type { Pool } from "pg"

// One row of pg_catalog.pg_matviews, narrowed to the two columns we read.
export type MatviewRow = { matviewname: string; ispopulated: boolean }

export type MatviewHealth = {
  // True when every medmkp_* matview has been populated at least once. A
  // materialized view created `WITH NO DATA` (all of ours are) returns rows only
  // after its first REFRESH — until then reads raise
  // "materialized view ... has not been populated" and the callers silently fall
  // back to a slow live query. This flag makes that invisible state observable.
  ok: boolean
  // Names of medmkp_* matviews that exist but have never been refreshed.
  unpopulated: string[]
  // How many medmkp_* matviews were inspected (0 usually means the check itself
  // failed — see `error`).
  checked: number
  // Set when the pg_matviews probe could not run; `ok` stays true because an
  // un-runnable probe is "unknown", not "broken", and we don't want to page on it.
  error?: string
}

// Pure classifier: given the pg_matviews rows for our schema, decide whether any
// medmkp_* matview is deployed-but-never-refreshed. Kept separate from the query
// so it can be unit-tested without a database.
export function summarizeMatviewHealth(rows: MatviewRow[]): MatviewHealth {
  const unpopulated = rows
    .filter((row) => !row.ispopulated)
    .map((row) => row.matviewname)
    .sort()
  return { ok: unpopulated.length === 0, unpopulated, checked: rows.length }
}

// Probe the live database for unpopulated medmkp_* materialized views. Never
// throws — a failed probe returns `{ ok: true, ... error }` so it can't take down
// the health endpoint or false-alarm the health pipeline.
export async function checkMatviewHealth(pool: Pool): Promise<MatviewHealth> {
  try {
    const { rows } = await pool.query<MatviewRow>(
      `SELECT matviewname, ispopulated
         FROM pg_catalog.pg_matviews
        WHERE matviewname LIKE 'medmkp\\_%'`
    )
    return summarizeMatviewHealth(rows)
  } catch (error: any) {
    return {
      ok: true,
      unpopulated: [],
      checked: 0,
      error: error?.message ?? String(error),
    }
  }
}
