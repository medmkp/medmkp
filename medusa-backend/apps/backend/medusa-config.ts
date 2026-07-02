import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

function intEnv(name: string, fallback: number) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const databaseDriverOptions =
  {
    pool: {
      min: intEnv("DB_POOL_MIN", 1),
      max: intEnv("DB_POOL_MAX", 20),
      acquireTimeoutMillis: intEnv("DB_POOL_ACQUIRE_TIMEOUT_MS", 60000),
      idleTimeoutMillis: intEnv("DB_POOL_IDLE_TIMEOUT_MS", 30000),
      createRetryIntervalMillis: intEnv("DB_POOL_CREATE_RETRY_INTERVAL_MS", 200),
    },
    ...(process.env.DB_SSL === "true"
      ? {
          connection: {
            ssl: {
              rejectUnauthorized: false,
            },
          },
        }
      : {}),
  }

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseDriverOptions,
    redisUrl: process.env.REDIS_URL,

    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    // Hosting the admin dashboard in the API process needs ~2GB RAM (Medusa's
    // own requirement); on the 512MB Render instance that tips `medusa start`
    // into a heap OOM. Disable it in prod via DISABLE_ADMIN=true. Only the /app
    // dashboard UI is dropped — the /admin/* REST API is unaffected — and local
    // dev (no env var) keeps the dashboard.
    disable: process.env.DISABLE_ADMIN === "true",
  },
  modules: [
    {
      resolve: "./src/modules/medmkp",
    },
  ],
})
