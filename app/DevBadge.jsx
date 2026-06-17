// Per-worktree dev badge. Server component: reads MEDMKP_* from process.env
// (set in .env.local by scripts/worktree-init.sh) and renders a small fixed
// pill so you can tell, at a glance, which branch + DB this instance is on.
// Renders nothing when MEDMKP_BRANCH is unset (e.g. the production build).
export default function DevBadge() {
  const branch = process.env.MEDMKP_BRANCH;
  if (!branch) return null;

  const target = (process.env.MEDMKP_DB_TARGET || "local").toLowerCase();
  const port = process.env.MEDMKP_PORT || "";
  const isProd = target === "prod";

  return (
    <div
      title={`branch ${branch} · DB ${target}${port ? ` · port ${port}` : ""}`}
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
