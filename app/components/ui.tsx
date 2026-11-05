import type { ReactNode } from "react";

export function DataLabel({ label }: { label: "live" | "recorded" | "synthetic" | "customer" | string }) {
  const styles: Record<string, string> = {
    live: "text-ok",
    recorded: "text-sea",
    synthetic: "text-warn",
    customer: "text-ink-2",
  };
  const text: Record<string, string> = { live: "Live data", recorded: "Recorded data", synthetic: "Synthetic data", customer: "Your document" };
  return <span className={`tag ${styles[label] ?? "text-muted"}`}>{text[label] ?? label}</span>;
}

export function TestFunds() {
  return <span className="tag text-signal">Test USDC</span>;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  active: { text: "Active", cls: "bg-sea-soft text-sea" },
  paid_out: { text: "Paid out", cls: "bg-[#e3f1e5] text-ok" },
  closed_no_payout: { text: "Closed — arrived in time", cls: "bg-paper-2 text-ink-2" },
  resolved_by_review: { text: "Resolved by review", cls: "bg-paper-2 text-ink-2" },
  ARRIVAL_CONFIRMED: { text: "Arrival recorded", cls: "bg-[#e3f1e5] text-ok" },
  PENDING_NO_ARRIVAL: { text: "Waiting for arrival", cls: "bg-sea-soft text-sea" },
  PENDING_STALE: { text: "Data out of date", cls: "bg-[#fbf0dc] text-warn" },
  PENDING_CONFLICT: { text: "Conflicting records", cls: "bg-[#fbf0dc] text-warn" },
  SOURCE_UNAVAILABLE: { text: "Data unavailable", cls: "bg-[#fde8e6] text-bad" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { text: status || "—", cls: "bg-paper-2 text-ink-2" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.text}</span>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="rounded-lg border border-bad/30 bg-[#fde8e6] text-bad text-sm px-3 py-2">{error}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
      <span className="h-2 w-2 rounded-full bg-signal pulse" />
      {label ?? "Working…"}
    </span>
  );
}

export function ExtLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-ink">
      {children} ↗
    </a>
  );
}
