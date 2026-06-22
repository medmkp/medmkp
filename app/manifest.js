// Web App Manifest for Android/Chrome installability.
// Next.js auto-emits <link rel="manifest" href="/manifest.webmanifest">.
export default function manifest() {
  return {
    name: "TraceDDS",
    short_name: "TraceDDS",
    description: "Supply traceability and audit-readiness for dental practices.",
    // Installed app opens on the reorder list (the authed home), not the
    // logged-out landing. scope is the whole origin so auth redirects and
    // logout stay inside the standalone window.
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2F5BD6",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
