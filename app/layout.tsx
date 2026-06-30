import type { Metadata } from "next";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/500.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "VédettSarok – Autizmus- és ADHD-barát helyek iránytűje",
  description:
    "Közösségi helykereső és értékelő alkalmazás autizmus- és ADHD-barát helyekhez magyar családoknak.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hu">
      <body className="flex min-h-screen flex-col bg-sni-bg font-sans antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
