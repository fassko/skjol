"use client";
import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, short } from "../../components/api";
import { BridgeEurc } from "../../components/bridge-eurc";
import { CodeBlock } from "../../components/code-block";
import { DataLabel, ErrorNote, ExtLink, Section, Spinner, StatusPill, TestFunds } from "../../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = any;

export function PolicyDetail({ policyId }: { policyId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/policies/${policyId}`).then(setD).catch((e) => setError(e.message));
  }, [policyId]);
  useEffect(load, [load]);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      setCheckResult(await api(`/api/policies/${policyId}/evaluate`, { method: "POST", json: {} }));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (error && !d) return <ErrorNote error={error} />;
  if (!d) return <Spinner label="Loading policy…" />;

  const settled = d.status === "paid_out" || d.status === "closed_no_payout" || d.status === "resolved_by_review";
  const latest = d.evaluations[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-semibold">{d.vesselName ?? `IMO ${d.vesselImo}`}</h1>
            <StatusPill status={d.status} />
          </div>
          <p className="text-ink-2 mt-1">
            To {d.port} ({d.portLocode}) · agreed deadline <strong>{fmtDate(d.deadline)}</strong>
          </p>
        </div>
        {!settled && d.owned && (
          <button className="btn btn-primary" onClick={check} disabled={checking}>
            {checking ? "Checking port records…" : "Check arrival now"}
          </button>
        )}
      </div>
      <ErrorNote error={error} />

      {settled && <Receipt d={d} />}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Section title="What we know">
          {latest ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2"><StatusPill status={latest.status} />{latest.clockIsDemo && <span className="tag text-warn">Demo clock</span>}</div>
              {latest.explanation ? <p className="leading-relaxed">{latest.explanation}</p> : <p className="text-sm text-muted">Sign in as the policyholder to see the explanation.</p>}
              {latest.explanationSource && <p className="text-xs text-muted">Explanation written by {latest.explanationSource === "ai" ? "the AI assistant from the recorded facts" : "fixed rules"}; the decision itself comes from the policy rules.</p>}
              {latest.latestEta && <p className="text-xs text-ink-2">Latest reported ETA: {fmtDate(latest.latestEta)} (for information — your deadline does not change).</p>}
            </div>
          ) : (
            <p className="text-sm text-ink-2">No arrival check yet. Checks run automatically; you can also check now.</p>
          )}
          {checkResult && (
            <div className="mt-4 text-xs rounded-lg bg-paper-2 p-3 space-y-1">
              <div>Result: <StatusPill status={checkResult.assessment.status} /> · source <DataLabel label={checkResult.origin} /></div>
              <div>{checkResult.note}</div>
              {checkResult.reportTx && <div>Report transaction: <span className="mono">{short(checkResult.reportTx)}</span></div>}
            </div>
          )}
        </Section>

        <Section title="Your cover">
          <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Payout</dt><dd><strong>{d.payout}</strong> {d.currency} <TestFunds currency={d.currency} /></dd>
            <dt className="text-muted">Premium paid</dt><dd>{d.premium} {d.currency}</dd>
            <dt className="text-muted">Threshold</dt><dd>more than {d.thresholdHours >= 1 ? `${d.thresholdHours} hours` : `${Math.round(d.thresholdHours * 60)} minutes`} late</dd>
            <dt className="text-muted">Vessel IMO</dt><dd className="mono">{d.vesselImo}</dd>
            {d.voyageRef && (<><dt className="text-muted">Voyage</dt><dd className="mono">{d.voyageRef}</dd></>)}
            <dt className="text-muted">Purchase</dt><dd><ExtLink href={d.purchaseTxUrl}>{short(d.purchaseTx)}</ExtLink></dd>
            {d.onchain && (<><dt className="text-muted">Contract status</dt><dd>{d.onchain.status.replace(/_/g, " ")}</dd></>)}
          </dl>
          {d.terms && (
            <details className="text-xs mt-3">
              <summary className="cursor-pointer font-semibold">Policy wording</summary>
              <pre className="whitespace-pre-wrap mono mt-2 bg-paper-2 rounded p-2">{d.terms}</pre>
            </details>
          )}
        </Section>
      </div>

      {d.arkiv && <ArkivPanel a={d.arkiv} chain={d.chain} events={d.events} />}

      <Section title="Evidence timeline" aside={<span className="text-xs text-muted">Port-call records and contract events</span>}>
        <Timeline d={d} />
      </Section>
    </div>
  );
}

function Receipt({ d }: { d: Detail }) {
  const paid = d.status === "paid_out";
  const payoutEvent = d.events.find((e: any) => e.kind === "PolicyPaidOut" || e.kind === "PolicyClosedNoPayout" || e.kind === "PolicyResolvedByReview");
  return (
    <div className={`card p-6 border-2 ${paid ? "border-ok" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">Settlement receipt</div>
          <div className="font-display text-3xl font-semibold mt-1">{paid ? `${d.payout} ${d.currency} paid` : "Closed — no payout due"}</div>
          <p className="text-sm text-ink-2 mt-1">
            {d.recordedArrival ? <>Recorded arrival {fmtDate(d.recordedArrival)} vs agreed deadline {fmtDate(d.deadline)}.</> : null}
          </p>
        </div>
        <TestFunds currency={d.currency} />
      </div>
      <dl className="text-sm grid sm:grid-cols-3 gap-3 mt-4">
        <div><dt className="text-muted text-xs">Transaction</dt><dd><ExtLink href={d.settlementTxUrl}>{short(d.settlementTx)}</ExtLink></dd></div>
        <div><dt className="text-muted text-xs">Network</dt><dd>{d.chain.name}</dd></div>
        <div><dt className="text-muted text-xs">Evidence digest</dt><dd className="mono text-xs">{short(d.onchain?.settlementEvidence, 10)}</dd></div>
        {payoutEvent && <div><dt className="text-muted text-xs">Block</dt><dd className="mono text-xs">{payoutEvent.blockNumber}</dd></div>}
        <div><dt className="text-muted text-xs">Reserve</dt><dd>Released back to the pool</dd></div>
      </dl>
      {paid && d.currency === "EURC" && d.owned && (
        <div className="mt-4">
          <BridgeEurc defaultAmount={d.payout} direction="out" title="Move your EURC payout to another chain" />
        </div>
      )}
    </div>
  );
}

const EVENT_TEXT: Record<string, string> = {
  PolicyPurchased: "Cover purchased; payout reserved in the pool",
  EvidenceAccepted: "Arrival evidence accepted by the contract",
  PolicyPaidOut: "Payout sent",
  PolicyClosedNoPayout: "Closed — vessel arrived within the threshold",
  PolicyResolvedByReview: "Resolved by manual review",
  DuplicateReportIgnored: "Repeat report received and ignored (no second payout)",
  ReserveReleased: "Reserved collateral released",
};

function Timeline({ d }: { d: Detail }) {
  const items: { sort: number; node: React.ReactNode }[] = [];
  for (const o of d.observations) {
    items.push({
      sort: Date.parse(o.retrievedAt),
      node: (
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Port record: {o.record.sourceStatus}
            <DataLabel label={o.origin} />
          </div>
          <div className="text-xs text-ink-2">
            {o.eventTime ? <>Recorded arrival {fmtDate(o.eventTime)}. </> : <>No arrival time recorded. </>}
            {o.record.latestEta && <>ETA {fmtDate(o.record.latestEta)}. </>}Retrieved {fmtDate(o.retrievedAt)} from {o.source}.
          </div>
          <div className="text-[11px] mono text-muted">digest {short(o.digest, 10)} · visit {o.record.sourceRecordId}</div>
        </div>
      ),
    });
  }
  for (const e of d.evaluations) {
    items.push({
      sort: Date.parse(e.clock),
      node: (
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Arrival check <StatusPill status={e.status} />
            {e.clockIsDemo && <span className="tag text-warn">Demo clock</span>}
            <span className="tag text-muted">{e.runner === "local-relay" ? "Local demo relay" : e.runner === "app-preview" ? "App check" : e.runner}</span>
          </div>
          <div className="text-xs text-ink-2">At {fmtDate(e.clock)}{e.reasons ? ` · ${e.reasons.join(", ")}` : ""}</div>
          {e.reportTxUrl && <div className="text-xs"><ExtLink href={e.reportTxUrl}>report transaction</ExtLink></div>}
        </div>
      ),
    });
  }
  for (const e of d.events) {
    if (e.kind === "ReserveReleased") continue;
    items.push({
      sort: e.at ? Date.parse(e.at) + 1 : Number.MAX_SAFE_INTEGER, // +1ms: after the check that triggered it
      node: (
        <div>
          <div className="text-sm font-semibold">{EVENT_TEXT[e.kind] ?? e.kind}</div>
          <div className="text-xs text-ink-2">
            {e.at ? `${fmtDate(e.at)} · ` : ""}Block {e.blockNumber} · <ExtLink href={e.txUrl}>{short(e.txHash)}</ExtLink>
          </div>
        </div>
      ),
    });
  }
  items.sort((a, b) => a.sort - b.sort);
  if (!items.length) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ol className="relative border-l-2 border-line ml-2 space-y-5">
      {items.map((it, i) => (
        <li key={i} className="pl-5 relative">
          <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-paper border-2 border-sea" />
          {it.node}
        </li>
      ))}
    </ol>
  );
}

function ArkivPanel({ a, chain, events }: { a: any; chain: any; events: any[] }) {
  const blockOf = (label: string) => events.find((e) => label.endsWith(e.kind));
  return (
    <Section
      title="Saved on Arkiv"
      aside={
        <a className="btn btn-ghost !py-1 !px-3 !text-xs" href={a.explorer} target="_blank" rel="noreferrer">
          Arkiv block explorer ↗
        </a>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-2">
          This shipment’s records live as entities on <strong>{a.network}</strong> (chain ID {a.chainId}). Anyone can read them, so customer details are
          encrypted and links between records use keyed tags. Only entities written by the app’s authorised writer wallets are trusted.
          {a.approxExpiry && <> The policy record is kept until about {fmtDate(a.approxExpiry)} (block {a.expiresAtBlock}) and is renewed while the cover is open. After settlement, the policy and its linked records are kept for 90 days, then expire.</>}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted uppercase tracking-wide">
              <tr className="border-b border-line">
                <th className="py-2 pr-3">Record</th>
                <th className="py-2 pr-3">Entity (Arkiv explorer)</th>
                <th className="py-2 pr-3">Written by</th>
                <th className="py-2 pr-3">Public</th>
                <th className="py-2">Encrypted</th>
              </tr>
            </thead>
            <tbody>
              {a.records.map((r: any, i: number) => {
                const ev = r.label.startsWith("Arc event") ? blockOf(r.label) : null;
                return (
                  <tr key={i} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-ink">{r.label}</div>
                      <div className="mono text-muted">{r.schema}</div>
                      {ev && chain.explorer && (
                        <div className="mt-1 space-x-2">
                          <ExtLink href={`${chain.explorer}/block/${ev.blockNumber}`}>Arc block {ev.blockNumber}</ExtLink>
                          <ExtLink href={ev.txUrl}>Arc tx</ExtLink>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 mono">{r.key ? <ExtLink href={r.url}>{short(r.key, 10)}</ExtLink> : <span className="text-muted">pending</span>}</td>
                    <td className="py-2 pr-3">
                      <div className="capitalize">{r.writer} writer</div>
                      <div className="mono"><ExtLink href={r.writerUrl}>{short(r.writerAddress, 4)}</ExtLink></div>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{r.public.join(", ")}</td>
                    <td className="py-2 text-ink-2">
                      {r.encrypted.length ? r.encrypted.join(", ") : <span className="text-muted">nothing sensitive</span>}
                      {r.blindIndexed.length > 0 && <div className="text-muted mt-1">keyed tags: {r.blindIndexed.join(", ")}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-semibold">Query this policy from Arkiv yourself</summary>
          <div className="mt-2">
            <CodeBlock code={a.query} label="Arkiv SDK · TypeScript" />
          </div>
        </details>
      </div>
    </Section>
  );
}
