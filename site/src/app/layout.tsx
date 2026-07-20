import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cortex Registry — Apps for your knowledge graph",
  description:
    "The public catalog of apps that run inside a Cortex instance. Sandboxed, least-privilege, sha256-pinned — install from your admin panel in one click.",
  metadataBase: new URL("https://registry.cortex.eco"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
