// Per-worktree dev badge. Server component: reads MEDMKP_* from process.env
// (set in .env.local by scripts/worktree-init.sh) and renders a small fixed
// pill so you can tell, at a glance, which branch + DB this instance is on.
// Never rendered in a production build (next build/start, Vercel) regardless of
// env; also a no-op when MEDMKP_BRANCH is unset (e.g. the main checkout).

// Ask the backend which DB it's really on. A locally-run backend frequently
// points DATABASE_URL at the prod Render Postgres, so "which backend URL the
// frontend uses" (MEDMKP_DB_TARGET) is NOT the same as "which database the data
// comes from". Fall back to the worktree label when the backend is unreachable.
async function resolveDbTarget() {
  const base = process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000";
  try {
    const res = await fetch(`${base}/medmkp/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const body = await res.json();
      if (body?.db?.target && body.db.target !== "unknown") {
        return { target: body.db.target, host: body.db.host || null };
      }
    }
  } catch {
    // backend down / slow — fall through to a best-effort guess below
  }
  // Old backend (pre-db-field) or unreachable: a remote backend URL is necessarily
  // the prod Render DB; otherwise trust the worktree label.
  const base2 = process.env.MEDUSA_BACKEND_URL || "";
  const isRemote = base2 !== "" && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base2);
  if (isRemote) return { target: "prod", host: null };
  return { target: (process.env.MEDMKP_DB_TARGET || "local").toLowerCase(), host: null };
}

export default async function DevBadge() {
  if (process.env.NODE_ENV === "production") return null;

  const branch = process.env.MEDMKP_BRANCH;
  if (!branch) return null;

  const port = process.env.MEDMKP_PORT || "";
  const { target, host } = await resolveDbTarget();
  const isProd = target === "prod";

  return (
    <div
      title={`branch ${branch} · DB ${target}${host ? ` (${host})` : ""}${port ? ` · port ${port}` : ""}`}
      style={{
        position: "fixed",
        bottom: 10,
        left: 10,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px",
        borderRadius: 9999,
        background: isProd ? "#b91c1c" : "#1e40af",
        color: "#fff",
        font: "600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
        boxShadow: "0 2px 8px rgba(0,0,0,.35)",
        pointerEvents: "none",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", opacity: 0.9 }} />
      <span>{branch}</span>
      <span style={{ opacity: 0.85 }}>· DB: {isProd ? "PROD" : "LOCAL"}</span>
      {port ? <span style={{ opacity: 0.7 }}>· :{port}</span> : null}
    </div>
  );
}
