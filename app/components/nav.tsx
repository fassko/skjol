"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./session";
import { short } from "./api";

const LINKS = [
  { href: "/cover", label: "Get cover" },
  { href: "/capital", label: "Capital" },
  { href: "/policies", label: "My shipments" },
  { href: "/agent", label: "Freight agent" },
  { href: "/integrations", label: "How it's built" },
  { href: "/team", label: "Team" },
];

export function Nav() {
  const path = usePathname();
  const { session, loading, signOut } = useSession();
  return (
    <header className="w-full border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold">
          <Anchor /> Skjol
        </Link>
        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-full ${path.startsWith(l.href) ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <a
            href="https://github.com/fassko/skjol"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Skjol on GitHub"
            title="Skjol on GitHub"
            className="p-1.5 rounded-full text-ink-2 hover:bg-paper-2 hover:text-ink"
          >
            <GitHubMark />
          </a>
          {loading ? (
            <span className="h-6 w-24 rounded-full bg-paper-2" aria-hidden />
          ) : session ? (
            <>
              <span className="mono text-xs px-2 py-1 rounded-full bg-sea-soft text-sea">
                {session.demo ? "Demo wallet " : ""}
                {short(session.address, 4)}
              </span>
              <button className="text-muted hover:text-ink text-xs" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/cover" className="btn btn-primary !py-1.5 !text-xs">
              Connect
            </Link>
          )}
        </div>
      </div>
      <nav className="lg:hidden flex gap-1 px-3 pb-2 overflow-x-auto text-xs">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`px-3 py-1 rounded-full whitespace-nowrap ${path.startsWith(l.href) ? "bg-ink text-paper" : "bg-paper-2"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Anchor() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* S-as-anchor: ring + stock + S hanging from the bar + hooked flukes */}
      <circle cx="12" cy="3.35" r="1.8" />
      <path d="M12 5.15v1.35M5 8h14" />
      <path d="M16.85 9.7C16.85 8 15 7.1 12 7.1c-2.55 0-4.5.85-4.5 2.55 0 1.35.8 2.05 2.55 2.65l4.6 1.55c1.75.6 2.55 1.35 2.55 2.8 0 2-2.05 3.2-4.95 3.2-2.85 0-4.9-1.2-4.8-3.55" />
      <path d="M7.2 18.4c-1.2.2-2.4 1-2.95 2.2M16.8 18.4c1.2.2 2.4 1 2.95 2.2" />
    </svg>
  );
}
