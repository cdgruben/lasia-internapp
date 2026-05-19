import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Låsia AS internapp",
  description: "Ordre, kalender og timeføring for Låsia AS",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = { themeColor: "#118447", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
