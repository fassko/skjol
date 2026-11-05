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

export function TestFunds({ currency = "USDC" }: { currency?: string }) {
  return <span className="tag text-signal">Test {currency}</span>;
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

/** Judge-visible Arkiv ↔ Swarm strip: entity link + ciphertext URL (unreadable without the key). */
export function StorageStrip(p: {
  arkivKey?: string | null;
  arkivUrl?: string | null;
  storage: {
    mode: string;
    reference?: string;
    size?: number;
    tagUid?: number | null;
    ciphertextUrl?: string | null;
    label?: string;
  };
}) {
  const swarmName =
    p.storage.mode === "local-dev" ? "Local dev storage (not Swarm)" : p.storage.label ?? (p.storage.mode === "bee" ? "Own Bee node" : "Swarm gateway");
  return (
    <div className="rounded-lg bg-paper-2 p-3 text-xs space-y-1.5">
      <div className="font-semibold text-ink">Storage — Arkiv + Swarm</div>
      <div>
        Via: <span className="mono">{swarmName}</span>
        {p.storage.size != null && <span className="text-muted"> · {p.storage.size} bytes</span>}
        {p.storage.tagUid != null && <span className="text-muted"> · Bee tag {p.storage.tagUid}</span>}
      </div>
      {p.arkivKey && (
        <div>
          Arkiv entity:{" "}
          {p.arkivUrl ? <ExtLink href={p.arkivUrl}>{p.arkivKey.slice(0, 18)}…</ExtLink> : <span className="mono break-all">{p.arkivKey}</span>}
        </div>
      )}
      {p.storage.reference && (
        <div className="mono break-all text-muted">Swarm ref: {p.storage.reference}</div>
      )}
      {p.storage.ciphertextUrl && (
        <div>
          <ExtLink href={p.storage.ciphertextUrl}>Open ciphertext on Swarm</ExtLink>
          <span className="text-muted"> (unreadable without the key)</span>
        </div>
      )}
      <p className="text-muted">Ciphertext only on Swarm; the reference is sealed in the Arkiv entity. The decryption key never leaves the server.</p>
    </div>
  );
}
