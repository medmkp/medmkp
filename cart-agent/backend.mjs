// Thin HTTP client for the backend's agent seam. The runner never touches the
// database directly — it claims jobs and reports results over the shared-secret
// endpoints (/medmkp/agent/*).

const BASE = (process.env.MEDMKP_BACKEND_URL || "").replace(/\/$/, "");
const TOKEN = process.env.CART_AGENT_TOKEN || "";

function assertConfigured() {
  if (!BASE) throw new Error("MEDMKP_BACKEND_URL is not set");
  if (!TOKEN) throw new Error("CART_AGENT_TOKEN is not set");
}

async function call(path, body) {
  assertConfigured();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Claim the next queued job, or null if the queue is empty. The returned job
// carries the DECRYPTED supplier login — keep it in memory only.
export async function claimJob() {
  const { job } = await call("/medmkp/agent/claim", {});
  return job || null;
}

// Report the outcome of a job back to the backend.
export async function reportResult(payload) {
  return call("/medmkp/agent/result", payload);
}
