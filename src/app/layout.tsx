import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PageAudit - Visual Accessibility & Link Quality Inspector",
  description: "Enter a URL to audit full-page screenshots, heading hierarchy, image alts, and link health.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
