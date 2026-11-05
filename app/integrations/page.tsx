"use client";
import { useEffect, useState } from "react";
import { api, short } from "../components/api";
import { ErrorNote, ExtLink, Section, Spinner } from "../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

function State({ kind, children }: { kind: "live" | "sim" | "needs" | "local"; children: React.ReactNode }) {
  const cls = { live: "text-ok", sim: "text-warn", needs: "text-bad", local: "text-muted" }[kind];
  return <span className={`tag ${cls}`}>{children}</span>;
}

export default function IntegrationsPage() {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [rt, setRt] = useState<any>(null);
  const [rtBusy, setRtBusy] = useState(false);
  useEffect(() => {
    api("/api/integrations").then(setD).catch((e) => setError(e.message));
  }, []);

  async function roundtrip() {
    setRtBusy(true);
    try {
      setRt(await api("/api/swarm/roundtrip", { method: "POST" }));
    } catch (e) {
      setRt({ error: (e as Error).message });
    } finally {
      setRtBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">How it’s built</h1>
        <p className="text-ink-2 mt-1 max-w-3xl">
          Live status of every integration, read from this deployment. Labels say exactly what is live on a public test network, what is simulated and what still needs credentials.
        </p>
      </div>
      <ErrorNote error={error} />
      {!d ? (
        <Spinner />
      ) : (
        <>
          <Section title="Arc — USDC pool and policy contract" aside={<State kind="live">Live on Arc Testnet</State>}>
            <dl className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5">
              <dt className="text-muted">Pool contract</dt><dd className="mono"><ExtLink href={d.arc.poolUrl}>{d.arc.pool}</ExtLink></dd>
              <dt className="text-muted">USDC (ERC-20, 6 dp)</dt><dd className="mono">{d.arc.usdc}</dd>
              {"error" in d.arc.snapshot ? (
                <><dt className="text-muted">Status</dt><dd className="text-bad">{d.arc.snapshot.error}</dd></>
              ) : (
                <>
                  <dt className="text-muted">Free collateral</dt><dd>{d.arc.snapshot.available} test USDC</dd>
                  <dt className="text-muted">Reserved for payouts</dt><dd>{d.arc.snapshot.reserved} test USDC</dd>
                  <dt className="text-muted">Quote signer</dt><dd className="mono">{d.arc.snapshot.quoteSigner}</dd>
                </>
              )}
            </dl>
          </Section>

          <Section
            title="Chainlink CRE — arrival evaluation workflow"
            aside={d.cre.deployed ? <State kind="live">Deployed</State> : <State kind="sim">Simulation only</State>}
          >
            <div className="text-sm space-y-2">
              <p>
                The workflow in <span className="mono">cre/arrival-evaluator</span> reads the policy terms from Arc, fetches Digitraffic port-call records, validates them and submits a signed report to the pool. The pool accepts reports only from its configured forwarder.
              </p>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                <dt className="text-muted">Configured forwarder</dt><dd className="mono">{d.cre.forwarder} <span className="text-xs text-muted">({d.cre.forwarderKind})</span></dd>
                <dt className="text-muted">Simulation operator gate</dt><dd className="mono">{d.cre.simulationOperator}</dd>
                <dt className="text-muted">Production forwarder</dt><dd className="mono">{d.cre.productionForwarder} <span className="text-xs text-muted">(not configured; requires a deployed workflow)</span></dd>
                <dt className="text-muted">CRE chain name</dt><dd className="mono">{d.cre.chainName}</dd>
              </dl>
              <p className="text-xs text-muted">This is not a deployed decentralised workflow. Simulation runs the same code on one machine through the CRE CLI.</p>
            </div>
          </Section>

          <Section title="Arkiv — application database" aside={<State kind="live">Live on Arkiv Rabdi testnet</State>}>
            <div className="text-sm space-y-3">
              <p>Shipments, quotes, policies, port-call observations, evaluations and settlement events are Arkiv entities. Customer details and relationships are encrypted; every read is filtered by the authorised writer address.</p>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                {Object.entries(d.arkiv.writers).map(([role, addr]: any) => (
                  <div key={role} className="contents">
                    <dt className="text-muted capitalize">{role} writer</dt>
                    <dd className="mono"><ExtLink href={d.arkiv.writerUrls[role]}>{addr}</ExtLink></dd>
                  </div>
                ))}
              </dl>
              <div>
                <div className="text-xs font-semibold text-muted uppercase mb-1">Recent settlement-sync records</div>
                {d.arkiv.recentEvents.length === 0 ? (
                  <p className="text-xs text-muted">None yet.</p>
                ) : (
                  <ul className="text-xs mono space-y-0.5">
                    {d.arkiv.recentEvents.map((e: any) => (
                      <li key={e.eventId}>{e.kind} · entity {short(e.key, 8)}</li>
                    ))}
                  </ul>
                )}
              </div>
              <pre className="text-xs mono bg-paper-2 rounded p-3 whitespace-pre-wrap">{d.arkiv.sampleQuery}</pre>
            </div>
          </Section>

          <Section title="Swarm — encrypted document storage" aside={d.swarm.mode === "local-dev" ? <State kind="local">Local dev storage — not Swarm</State> : <State kind="live">{d.swarm.mode === "gateway" ? "Swarm public gateway" : "Own Bee node"}</State>}>
            <div className="text-sm space-y-3">
              <p>Documents are encrypted with AES-256-GCM before upload. Swarm only ever holds ciphertext; the Swarm reference is itself encrypted before it is stored in Arkiv.</p>
              <button className="btn btn-ghost" onClick={roundtrip} disabled={rtBusy}>
                {rtBusy ? "Uploading and reading back…" : "Run an upload + read round trip (synthetic sample)"}
              </button>
              {rt && (
                <div className="text-xs rounded-lg bg-paper-2 p-3 space-y-1">
                  {rt.error ? (
                    <span className="text-bad">{rt.error}</span>
                  ) : (
                    <>
                      <div>Stored via: {rt.storage}</div>
                      <div className="mono break-all">Reference: {rt.reference}</div>
                      {rt.ciphertextUrl && <div><ExtLink href={rt.ciphertextUrl}>Open ciphertext on Swarm</ExtLink> (unreadable without the key)</div>}
                      <div>Decrypted content matches: <strong>{rt.plaintextMatches ? "yes" : "no"}</strong> · upload {rt.uploadMs} ms · read {rt.readMs} ms</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section title="AI assistant" aside={d.ai.enabled ? <State kind="live">{d.ai.model}</State> : <State kind="needs">Needs AI Gateway key</State>}>
            <p className="text-sm">
              Reads documents (with source quotes and page numbers), explains cover and writes claim summaries. It never prices, decides eligibility or computes payouts — those are fixed rules in code and in the contract.
              {!d.ai.enabled && " Without a key, documents are read by deterministic offline rules and explanations use fixed templates."}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
