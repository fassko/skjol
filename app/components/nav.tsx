"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./session";
import { short } from "./api";

const LINKS = [
  { href: "/cover", label: "Get cover" },
  { href: "/policies", label: "My shipments" },
  { href: "/demo", label: "Demo scenarios" },
  { href: "/integrations", label: "How it's built" },
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
        <nav className="hidden md:flex items-center gap-1 text-sm">
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
      <nav className="md:hidden flex gap-1 px-3 pb-2 overflow-x-auto text-xs">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`px-3 py-1 rounded-full whitespace-nowrap ${path.startsWith(l.href) ? "bg-ink text-paper" : "bg-paper-2"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Anchor() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="5" r="2.2" />
      <path d="M12 7.2V21M5 13a7 7 0 0 0 14 0M8 10h8" />
    </svg>
  );
}
