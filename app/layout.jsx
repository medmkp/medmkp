import "../styles.css";
import DevBadge from "./DevBadge";

export const metadata = {
  title: "MedMKP",
  description: "Concierge procurement MVP for healthcare supply reorders.",
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
