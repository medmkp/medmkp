const LOCAL_DB_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "host.docker.internal",
])

export function assertDestructiveDbOperationAllowed(
  operation: string,
  databaseUrl = process.env.DATABASE_URL || ""
) {
  if (process.env.ALLOW_REMOTE_DB_DESTRUCTIVE === "true") {
    return
  }
  let host = ""
  try {
    host = new URL(databaseUrl).hostname
  } catch {
    throw new Error(
      `Refusing "${operation}": DATABASE_URL is missing or unparseable, so the target database cannot be verified as local.`
    )
  }

  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(
      `Refusing "${operation}": DATABASE_URL points at remote host "${host}". ` +
        `This operation modifies data and is blocked outside local databases. ` +
        `If you really intend to run it against this database, set ALLOW_REMOTE_DB_DESTRUCTIVE=true.`
    )
  }
}
