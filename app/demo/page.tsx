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
          Deterministic scenarios built from <strong>synthetic</strong> documents and <strong>synthetic</strong> port records in each port&apos;s live data format
          (Finnish port-call records, or AIS port arrivals for Indian ports).
          Move the demo clock forward to see how the cover is assessed. The clock moves; the original evidence timestamps never change.
        </p>
      </div>
      <div className="card overflow-hidden grid md:grid-cols-2 text-sm">
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="tag text-sea">Preview mode</span>
          </div>
          <h2 className="font-display text-lg font-semibold">This page only checks the rules</h2>
          <p className="text-ink-2">
            Each check runs the same assessment the live evaluator uses, against the scenario&apos;s records, and shows what it would decide.
            It is a dry run.
          </p>
          <ul className="space-y-1.5">
            {["No cover is bought", "No test funds move", "Nothing is written on-chain or to Arkiv"].map((t) => (
              <li key={t} className="flex items-center gap-2 text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sea" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="p-5 space-y-3 bg-paper-2/60 border-t md:border-t-0 md:border-l border-line">
          <div className="flex items-center gap-2">
            <span className="tag text-signal">Full run</span>
          </div>
          <h2 className="font-display text-lg font-semibold">Run the whole flow on a local chain</h2>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {["Buy cover", "Collect evidence", "Submit report", "Payout or closure", "Arkiv records"].map((step, i, all) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-[#fffdf8] px-2.5 py-1 font-medium">
                  <span className="mono text-muted">{i + 1}</span>
                  {step}
                </span>
                {i < all.length - 1 && <span className="text-muted" aria-hidden>→</span>}
              </li>
            ))}
          </ol>
          <pre className="mono text-xs bg-ink text-paper rounded-lg px-3 py-2">
            <span className="text-muted select-none">$ </span>pnpm demo:local
          </pre>
          <p className="text-xs text-muted">
            Why local: the scenario deadlines are in December 2026. Public test networks run on real time, so a contract there can&apos;t
            see that date yet. A local chain lets the demo jump its clock forward.
          </p>
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
                  <dt className="text-muted">To</dt><dd>{s.port?.name ?? s.shipment.destinationLocode} ({s.shipment.destinationLocode})</dd>
                  <dt className="text-muted">Arrival data</dt><dd>{s.source ? `${s.source.description} (${s.source.name})` : "—"}</dd>
                  <dt className="text-muted">Agreed deadline</dt><dd>{fmtDate(s.shipment.agreedArrivalDeadline)}</dd>
                  <dt className="text-muted">Document</dt><dd><a className="underline" href={`/samples/${s.document}`} target="_blank">{s.document}</a></dd>
                </dl>
                <div>
                  <div className="text-xs font-semibold text-muted uppercase mb-1">Synthetic port records</div>
                  {s.observations.map((o: any) => (
                    <div key={o.retrievedAt} className="text-xs mono bg-paper-2 rounded p-2 mb-1">
                      retrieved {o.retrievedAt}
                      {o.records.length === 0 && <div>· no arrival recorded</div>}
                      {o.records.map((r: any) => (
                        <div key={r.digest}>
                          · {r.portLocode} status “{r.sourceStatus}” {r.eventTimestamp ? `arrived ${r.eventTimestamp}` : "no arrival time"} {r.latestEta ? `ETA ${r.latestEta}` : ""}
                        </div>
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
