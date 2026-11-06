import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Fraunces } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./components/providers";
import { Nav } from "./components/nav";
import { Suspense } from "react";

const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Skjol — Shipment arrival delay cover",
  description: "Parametric vessel-arrival delay protection for small importers. Testnet MVP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>
          <div className="bg-ink text-paper text-xs text-center py-1.5 px-3">
            Testnet demo — all payments use <strong>test USDC</strong> with no real value. Not an insurance offer.
          </div>
          <Suspense fallback={<div className="h-14 border-b border-line" />}>
            <Nav />
          </Suspense>
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
            <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>{children}</Suspense>
          </main>
          <footer className="border-t border-line text-xs text-muted py-4 px-6 text-center space-y-1">
            <p>
              Skjol. Arrival delay protection built for small importers.{" "}
              <a href="https://github.com/fassko/skjol" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                Source on GitHub
              </a>
            </p>
            <p>
              Demo:{" "}
              <Link href="/cover" className="underline hover:text-ink">
                Get cover
              </Link>
              {" · "}
              <Link href="/integrations" className="underline hover:text-ink">
                How it’s built
              </Link>
              {" · "}
              <Link href="/capital" className="underline hover:text-ink">
                Capital
              </Link>
              {" · "}
              <Link href="/agent" className="underline hover:text-ink">
                Freight agent
              </Link>
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
