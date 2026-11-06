"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "./session";
import { short } from "./api";

/** Using the product. */
const PRODUCT = [
  { href: "/cover", label: "Get cover" },
  { href: "/capital", label: "Capital" },
  { href: "/agent", label: "Freight agent" },
  { href: "/policies", label: "My shipments" },
];

/** What the product is. */
const ABOUT = [
  { href: "/integrations", label: "How it's built" },
  { href: "/team", label: "Team" },
];

function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return links.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      className={`px-3 py-1.5 text-sm rounded-full ${path.startsWith(l.href) ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
    >
      {l.label}
    </Link>
  ));
}

function MenuLinks({ links, onNavigate }: { links: { href: string; label: string }[]; onNavigate: () => void }) {
  const path = usePathname();
  return links.map((l) => (
    <Link
      key={l.href}
      href={l.href}
      onClick={() => window.setTimeout(onNavigate, 0)}
      className={`px-3 py-2.5 rounded-lg text-sm ${path.startsWith(l.href) ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2"}`}
    >
      {l.label}
    </Link>
  ));
}

export function Nav() {
  const { session, loading, signOut } = useSession();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => setOpen(false);

  return (
    <header className="w-full border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-semibold shrink-0">
          <Anchor /> Skjol
        </Link>
        <nav aria-label="Product" className="hidden lg:flex items-center gap-1">
          <NavLinks links={PRODUCT} />
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3 min-w-0">
          <nav aria-label="About" className="hidden lg:flex items-center gap-1 border-l border-line pl-3">
            <NavLinks links={ABOUT} />
          </nav>
          <div className="flex items-center gap-2 text-sm min-w-0">
            {loading ? (
              <span className="h-6 w-24 rounded-full bg-paper-2" aria-hidden />
            ) : session ? (
              <>
                <span className="mono text-xs px-2 py-1 rounded-full bg-sea-soft text-sea truncate">
                  {session.demo ? "Demo wallet " : ""}
                  {short(session.address, 4)}
                </span>
                <button className="text-bad hover:underline text-xs shrink-0" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/cover" className="btn btn-primary !py-1.5 !text-xs shrink-0">
                Connect
              </Link>
            )}
          </div>
          <button
            type="button"
            className="lg:hidden shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-[#fffdf8] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="mobile-nav" className="lg:hidden border-t border-line">
          <div className="max-w-6xl mx-auto px-3 py-3 space-y-3">
            <nav aria-label="Product" className="grid">
              <p className="px-3 pb-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted">Using Skjol</p>
              <MenuLinks links={PRODUCT} onNavigate={close} />
            </nav>
            <nav aria-label="About" className="grid border-t border-line pt-3">
              <p className="px-3 pb-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted">About</p>
              <MenuLinks links={ABOUT} onNavigate={close} />
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
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
