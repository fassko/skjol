"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate } from "../components/api";
import { ConnectStep } from "../components/cover-steps";
import { useSession } from "../components/session";
import { DataLabel, ErrorNote, Section, Spinner, StatusPill } from "../components/ui";

interface PolicySummary { policyId: string; status: string; vesselName: string | null; port: string; deadline: string; payout: string; premium: string; lastEvaluation: string; productId: string; thresholdHours: number }
interface ShipmentSummary { shipmentId: string; status: string; dataLabel: string; fileName: string; vessel: string; createdAtSec: number }

export default function PoliciesPage() {
  const { session, loading } = useSession();
  const [policies, setPolicies] = useState<PolicySummary[] | null>(null);
  const [shipments, setShipments] = useState<ShipmentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    api<{ policies: PolicySummary[] }>("/api/policies").then((r) => setPolicies(r.policies)).catch((e) => setError(e.message));
    api<{ shipments: ShipmentSummary[] }>("/api/shipments").then((r) => setShipments(r.shipments)).catch(() => setShipments([]));
  }, [session]);

  if (loading) return <Spinner />;
  if (!session) return <Section title="Sign in to see your shipments"><ConnectStep /></Section>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My shipments</h1>
          <p className="text-ink-2 text-sm">Read from the app’s Arkiv records; payments and terms are confirmed on Arc.</p>
        </div>
        <Link href="/cover" className="btn btn-signal">New cover</Link>
      </div>
      <ErrorNote error={error} />
      {!policies ? (
        <Spinner label="Loading your policies…" />
      ) : policies.length === 0 ? (
        <div className="card p-6 text-ink-2 text-sm">No active cover yet. Purchases appear here within a minute.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {policies.map((p) => (
            <Link key={p.policyId} href={`/policies/${p.policyId}`} className="card p-5 hover:border-ink transition-colors space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-display text-xl font-semibold">{p.vesselName ?? "Vessel"}</div>
                <StatusPill status={p.status} />
              </div>
              <div className="text-sm text-ink-2">To {p.port} · deadline {fmtDate(p.deadline)}</div>
              <div className="text-sm">Payout <strong>{p.payout} test USDC</strong> if more than {p.thresholdHours >= 1 ? `${p.thresholdHours} h` : `${Math.round(p.thresholdHours * 60)} min`} late</div>
              {p.lastEvaluation && <div className="text-xs">Last check: <StatusPill status={p.lastEvaluation} /></div>}
            </Link>
          ))}
        </div>
      )}
      {shipments && shipments.some((s) => s.status !== "insured") && (
        <Section title="Documents without cover">
          <ul className="text-sm divide-y divide-line">
            {shipments.filter((s) => s.status !== "insured").map((s) => (
              <li key={s.shipmentId} className="py-2 flex items-center gap-3">
                <span className="flex-1">{s.vessel || s.fileName}</span>
                <DataLabel label={s.dataLabel} />
                <span className="text-xs text-muted">{s.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
