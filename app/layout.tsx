import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import { LanguageProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Panel Schedule",
  description:
    "Realtime panel schedule dari Revit — tabel, SLD, dan export (Supabase + Next.js) · "
    + "Realtime panel schedule from Revit — table, SLD, and exports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="id" = bahasa default saat render server; LanguageProvider yang
    // menyesuaikannya di browser sesuai pilihan user.
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-100 text-neutral-900">
        <LanguageProvider>
          <AuthGate>{children}</AuthGate>
        </LanguageProvider>
      </body>
    </html>
  );
}
