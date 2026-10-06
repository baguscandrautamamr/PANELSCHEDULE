import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import { LanguageProvider } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Panel Schedule",
  description:
    "Panel schedule realtime dari Revit — tabel, SLD, dan export Excel / PDF / DXF · "
    + "Realtime panel schedule from Revit — table, SLD, and Excel / PDF / DXF exports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="id" = bahasa default saat render server; LanguageProvider yang
    // menyesuaikannya di browser sesuai pilihan user.
    <html lang="id" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col app-bg text-slate-900">
        <LanguageProvider>
          <AuthGate>{children}</AuthGate>
        </LanguageProvider>
      </body>
    </html>
  );
}
