import "../styles.css";
import DevBadge from "./DevBadge";

export const metadata = {
  title: "MedMKP",
  description: "Concierge procurement MVP for healthcare supply reorders.",
  appleWebApp: {
    capable: true,
    title: "MedMKP",
    statusBarStyle: "default",
  },
  // Legacy alias so older iOS (pre-Safari 16.4) also launches standalone.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <DevBadge />
      </body>
    </html>
  );
}
