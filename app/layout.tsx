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
              <a href="https://github.com/fassko/skjol" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span className="underline">Source on GitHub</span>
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
