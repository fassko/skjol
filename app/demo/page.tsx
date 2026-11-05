"use client";
import { useEffect, useState } from "react";
import { api, fmtDate } from "../components/api";
import { DataLabel, ErrorNote, Section, Spinner, StatusPill } from "../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DemoPage() {
  const [data, setData] = useState<any>(null);
  const [results, setResults] = useState<Record<string, any[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api("/api/demo/scenarios").then(setData).catch((e) => setError(e.message));
  }, []);

  async function run(id: string, clock: string) {
    setBusy(`${id}@${clock}`);
    try {
      const r = await api<any>("/api/demo/evaluate", { method: "POST", json: { scenarioId: id, clock } });
      setResults((prev) => ({ ...prev, [id]: [...(prev[id] ?? []).filter((x) => x.clock !== clock), r] }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Demo scenarios</h1>
        <p className="text-ink-2 mt-1 max-w-3xl">
          Five deterministic scenarios built from <strong>synthetic</strong> documents and <strong>synthetic</strong> port records in the Digitraffic format.
          Move the demo clock forward to see how the cover is assessed. The clock moves; the original evidence timestamps never change.
        </p>
      </div>
      <div className="card p-4 text-sm bg-sea-soft/40 space-y-1">
        <div><strong>This page previews the rules only</strong> — no purchase, no payment, nothing written.</div>
        <div>
          The full end-to-end run (purchase → evidence → report → payout or closure → Arkiv records) runs on a local chain with <span className="mono">pnpm demo:local</span>,
          because these scenarios are dated December 2026 and real test networks cannot fast-forward time.
        </div>
      </div>
      <ErrorNote error={error} />
      {!data ? (
        <Spinner />
      ) : (
        data.scenarios.map((s: any) => (
          <Section key={s.id} title={s.title} aside={<DataLabel label={s.label} />}>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-3 text-sm">
                <p><strong>Expected:</strong> {s.expected}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted">Vessel</dt><dd>{s.shipment.vesselName} (IMO {s.shipment.vesselImo}, fictitious)</dd>
                  <dt className="text-muted">To</dt><dd>{s.shipment.destinationLocode}</dd>
                  <dt className="text-muted">Agreed deadline</dt><dd>{fmtDate(s.shipment.agreedArrivalDeadline)}</dd>
                  <dt className="text-muted">Document</dt><dd><a className="underline" href={`/samples/${s.document}`} target="_blank">{s.document}</a></dd>
                </dl>
                <div>
                  <div className="text-xs font-semibold text-muted uppercase mb-1">Synthetic port records</div>
                  {s.observations.map((o: any) => (
                    <div key={o.retrievedAt} className="text-xs mono bg-paper-2 rounded p-2 mb-1">
                      retrieved {o.retrievedAt}
                      {o.visits.map((v: any) => (
                        <div key={v.visitId}>· {v.portOfCall} status “{v.status}” {v.ata ? `ATA ${v.ata}` : "no ATA"} {v.eta ? `ETA ${v.eta}` : ""}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-xs font-semibold text-muted uppercase">Advance the demo clock</div>
                <div className="flex flex-wrap gap-2">
                  {s.evaluateAt.map((c: string) => (
                    <button key={c} className="btn btn-ghost !text-xs" disabled={!!busy} onClick={() => run(s.id, c)}>
                      {busy === `${s.id}@${c}` ? "…" : `Check at ${fmtDate(c)}`}
                    </button>
                  ))}
                </div>
                {(results[s.id] ?? []).map((r) => (
                  <div key={r.clock} className="rounded-lg border border-line p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusPill status={r.assessment.status} />
                      {r.assessment.preview && (
                        <span className={`text-xs font-semibold ${r.assessment.preview.payoutEligible ? "text-ok" : "text-ink-2"}`}>
                          {r.assessment.preview.payoutEligible ? "Payout due" : "No payout"}
                        </span>
                      )}
                      <span className="tag text-warn">Demo clock {fmtDate(r.clock)}</span>
                    </div>
                    <p>{r.explanation}</p>
                    <p className="text-xs text-muted">
                      Evidence retrieved {r.observationRetrievedAt ? fmtDate(r.observationRetrievedAt) : "—"} (unchanged). {r.wouldSubmitReport ? "A settlement report would be submitted." : "No report would be submitted; the cover stays active."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        ))
      )}
    </div>
  );
}
