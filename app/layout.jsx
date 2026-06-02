import "../styles.css";

export const metadata = {
  title: "MedMKP MVP",
  description: "Concierge procurement MVP for healthcare supply reorders.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
