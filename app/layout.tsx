import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Schedule",
  description:
    "Realtime panel schedule dari Revit — tabel, SLD, dan export (Supabase + Next.js)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-100 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
