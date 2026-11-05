"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, short } from "../components/api";
import { ErrorNote, ExtLink, Section, Spinner } from "../components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */

function State({ kind, children }: { kind: "live" | "sim" | "needs" | "local"; children: React.ReactNode }) {
  const cls = { live: "text-ok", sim: "text-warn", needs: "text-bad", local: "text-muted" }[kind];
  return <span className={`tag ${cls}`}>{children}</span>;
}

function Addr({ explorer, address }: { explorer: string | null | undefined; address: string | null | undefined }) {
  if (!address) return <span>—</span>;
  return <ExtLink href={explorer ? `${explorer}/address/${address}` : null}>{address}</ExtLink>;
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
              <dt className="text-muted">USDC (ERC-20, 6 dp)</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={d.arc.usdc} /></dd>
              {"error" in d.arc.snapshot ? (
                <><dt className="text-muted">Status</dt><dd className="text-bad">{d.arc.snapshot.error}</dd></>
              ) : (
                <>
                  <dt className="text-muted">Free collateral</dt><dd>{d.arc.snapshot.available} test USDC</dd>
                  <dt className="text-muted">Reserved for payouts</dt><dd>{d.arc.snapshot.reserved} test USDC</dd>
                  <dt className="text-muted">Quote signer</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={d.arc.snapshot.quoteSigner} /></dd>
                </>
              )}
            </dl>
          </Section>

          {d.arc.pools?.some((p: any) => p.currency === "EURC") && (
            <Section title="Arc — EURC pool and Circle Bridge Kit" aside={<State kind="live">Live on Arc Testnet</State>}>
              {d.arc.pools
                .filter((p: any) => p.currency === "EURC")
                .map((p: any) => (
                  <dl key={p.pool} className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                    <dt className="text-muted">Pool contract</dt><dd className="mono"><ExtLink href={p.poolUrl}>{p.pool}</ExtLink></dd>
                    <dt className="text-muted">EURC (ERC-20, 6 dp)</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={p.token} /></dd>
                    {"error" in p.snapshot ? (
                      <><dt className="text-muted">Status</dt><dd className="text-bad">{p.snapshot.error}</dd></>
                    ) : (
                      <>
                        <dt className="text-muted">Free collateral</dt><dd>{p.snapshot.available} test EURC</dd>
                        <dt className="text-muted">Reserved for payouts</dt><dd>{p.snapshot.reserved} test EURC</dd>
                      </>
                    )}
                  </dl>
                ))}
              <p className="text-xs text-muted mt-3">
                Same pool contract, settled in EURC. Buyers bring EURC from Ethereum Sepolia or Base Sepolia with Bridge Kit (CCTP burn, attestation, mint) on the buy step, and can bridge a payout back out from the policy page.
              </p>
            </Section>
          )}

          {d.x402 && (
            <Section title="x402 paid API — Circle Gateway on Arc and Hedera" aside={<State kind="live">Live</State>}>
              <dl className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                <dt className="text-muted">Catalog</dt><dd className="mono"><ExtLink href={d.x402.catalog}>{d.x402.catalog}</ExtLink></dd>
                <dt className="text-muted">Arc nanopayments</dt><dd className="mono">{d.x402.arc.payTo ? `${d.x402.arc.network} → ${d.x402.arc.payTo}` : "not configured"}</dd>
                <dt className="text-muted">Hedera USDC</dt><dd className="mono">{d.x402.hedera.payTo ? `${d.x402.hedera.network} → ${d.x402.hedera.payTo} (${d.x402.hedera.token})` : "not configured (set HEDERA_PAYEE_ACCOUNT_ID)"}</dd>
                <dt className="text-muted">HCS audit topic</dt><dd className="mono">{d.x402.auditTopic ? <ExtLink href={d.x402.auditTopicUrl}>{d.x402.auditTopic}</ExtLink> : "not configured"}</dd>
              </dl>
              <p className="text-xs text-muted mt-3">The Freight agent on /agent discovers these services and pays for them per call, inside spending limits enforced on the server.</p>
            </Section>
          )}

          <Section
            title="Chainlink CRE — arrival evaluation workflow"
            aside={d.cre.deployed ? <State kind="live">Deployed</State> : <State kind="sim">Simulation only</State>}
          >
            <div className="text-sm space-y-2">
              <p>
                The workflow in <span className="mono">cre/arrival-evaluator</span> reads the policy terms from Arc, fetches arrival records for the destination port (
                <ExtLink href="https://www.digitraffic.fi/en/marine-traffic/#restjson--api">Digitraffic marine traffic REST/JSON API</ExtLink>
                {" "}for Finland, VesselFinder AIS port calls for India), validates them and submits a signed report to the pool. The pool accepts reports only from its configured forwarder.
              </p>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                <dt className="text-muted">Configured forwarder</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={d.cre.forwarder} /> <span className="text-xs text-muted">({d.cre.forwarderKind})</span></dd>
                <dt className="text-muted">Simulation operator gate</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={d.cre.simulationOperator} /></dd>
                <dt className="text-muted">Production forwarder</dt><dd className="mono"><Addr explorer={d.arc.chain.explorer} address={d.cre.productionForwarder} /> <span className="text-xs text-muted">(not configured; requires a deployed workflow)</span></dd>
                <dt className="text-muted">CRE chain name</dt><dd className="mono">{d.cre.chainName}</dd>
              </dl>
              <p className="text-xs text-muted">Hackathon path: run the same WASM locally via <span className="mono">cre workflow simulate</span> (see <span className="mono">cre/README.md</span>). DON deploy needs Chainlink deploy access after their MNDA.</p>
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
                      <li key={e.eventId} className="flex flex-wrap gap-x-2">
                        <span>{e.kind}</span>
                        <span className="text-muted">·</span>
                        {e.key ? <ExtLink href={e.entityUrl}>Arkiv entity {short(e.key, 8)}</ExtLink> : <span className="text-muted">Arkiv entity pending</span>}
                        <span className="text-muted">·</span>
                        <ExtLink href={e.txUrl}>Arc tx {short(e.txHash, 6)}</ExtLink>
                        {e.policyId && (
                          <>
                            <span className="text-muted">·</span>
                            <Link href={`/policies/${e.policyId}`} className="underline decoration-line underline-offset-2 hover:decoration-ink">policy {short(e.policyId, 6)}</Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Swarm — encrypted document storage"
            aside={
              d.swarm.mode === "local-dev" ? (
                <State kind="local">Local dev storage — not Swarm</State>
              ) : d.swarm.prizeReady ? (
                <State kind="live">{d.swarm.mode === "gateway" ? "Swarm public gateway" : "Own Bee node"} · postage ready</State>
              ) : (
                <State kind="needs">Needs SWARM_POSTAGE_BATCH_ID</State>
              )
            }
          >
            <div className="text-sm space-y-3">
              <p>
                Documents are encrypted with AES-256-GCM before upload. Swarm only ever holds ciphertext; the Swarm reference is sealed inside the Arkiv shipment entity.
                Uploads use a postage stamp batch and a Bee tag. See <span className="mono">{d.swarm.docs}</span>.
              </p>
              {d.swarm.postageNote && <p className="text-xs text-muted">{d.swarm.postageNote}</p>}
              {!d.swarm.prizeReady && d.swarm.mode === "bee" && (
                <p className="text-xs text-warn">Set <span className="mono">SWARM_POSTAGE_BATCH_ID</span> for bee-mode uploads.</p>
              )}
              {!d.swarm.prizeReady && d.swarm.mode === "local-dev" && (
                <p className="text-xs text-warn">Set <span className="mono">SWARM_MODE=gateway</span> (or bee + postage) for judge demos.</p>
              )}
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
                      {rt.tagUid != null && (
                        <div>
                          Bee tag (upload label): {rt.tagUid}
                          {rt.tagSynced != null && <> · synced: <strong>{rt.tagSynced ? "yes" : "pending"}</strong></>}
                        </div>
                      )}
                      {rt.ciphertextUrl && <div><ExtLink href={rt.ciphertextUrl}>Open ciphertext on Swarm</ExtLink> (unreadable without the key)</div>}
                      <div>Decrypted content matches: <strong>{rt.plaintextMatches ? "yes" : "no"}</strong> · upload {rt.uploadMs} ms · read {rt.readMs} ms</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section title="AI assistant" aside={d.ai.enabled ? <State kind="live">Live</State> : <State kind="needs">Needs AI Gateway key</State>}>
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
