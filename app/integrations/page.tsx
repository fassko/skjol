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

function ArchitectureDiagram() {
  return (
    <Section title="System diagram" aside={<State kind="live">End-to-end flow</State>}>
      <p className="text-sm text-ink-2 mb-4 max-w-3xl">
        Capital is pooled in one vault: funders mint tradeable shares, importers buy cover against that pot, Chainlink CRE
        submits arrival evidence, and payouts leave the same contract. Documents stay encrypted on Swarm with pointers on Arkiv.
      </p>
      <div className="overflow-x-auto -mx-1 px-1">
        <svg viewBox="0 0 920 420" className="w-full min-w-[640px] h-auto text-ink" role="img" aria-label="Skjol architecture diagram">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-muted" />
            </marker>
          </defs>

          {/* Funder */}
          <rect x="20" y="40" width="150" height="64" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--line,#d9d2c5)]" strokeWidth="1.5" />
          <text x="95" y="66" textAnchor="middle" className="fill-current" style={{ fontSize: 13, fontWeight: 600 }}>Capital funder</text>
          <text x="95" y="86" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>deposits USDC / EURC</text>

          {/* Importer */}
          <rect x="20" y="180" width="150" height="64" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--line,#d9d2c5)]" strokeWidth="1.5" />
          <text x="95" y="206" textAnchor="middle" className="fill-current" style={{ fontSize: 13, fontWeight: 600 }}>Importer</text>
          <text x="95" y="226" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>buys delay cover</text>

          {/* Pool */}
          <rect x="250" y="100" width="200" height="100" rx="12" className="fill-[var(--sea-soft,#e6f0f0)] stroke-[var(--sea,#1f6f6a)]" strokeWidth="2" />
          <text x="350" y="132" textAnchor="middle" className="fill-current" style={{ fontSize: 14, fontWeight: 700 }}>ShipmentDelayPool</text>
          <text x="350" y="152" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>shared collateral · ERC-4626 shares</text>
          <text x="350" y="172" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>reserve payout · settle claims</text>

          {/* Uniswap */}
          <rect x="250" y="40" width="200" height="44" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--signal,#c45c26)]" strokeWidth="1.5" />
          <text x="350" y="67" textAnchor="middle" className="fill-current" style={{ fontSize: 12, fontWeight: 600 }}>Uniswap V2 · share ↔ token</text>

          {/* CRE */}
          <rect x="530" y="100" width="170" height="100" rx="12" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--line,#d9d2c5)]" strokeWidth="1.5" />
          <text x="615" y="132" textAnchor="middle" className="fill-current" style={{ fontSize: 13, fontWeight: 600 }}>Chainlink CRE</text>
          <text x="615" y="152" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>port-call evidence</text>
          <text x="615" y="172" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>Digitraffic / VesselFinder</text>

          {/* Arkiv / Swarm */}
          <rect x="750" y="40" width="150" height="64" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--line,#d9d2c5)]" strokeWidth="1.5" />
          <text x="825" y="66" textAnchor="middle" className="fill-current" style={{ fontSize: 13, fontWeight: 600 }}>Arkiv</text>
          <text x="825" y="86" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>policies · events</text>

          <rect x="750" y="180" width="150" height="64" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--line,#d9d2c5)]" strokeWidth="1.5" />
          <text x="825" y="206" textAnchor="middle" className="fill-current" style={{ fontSize: 13, fontWeight: 600 }}>Swarm</text>
          <text x="825" y="226" textAnchor="middle" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 11 }}>encrypted BoL</text>

          {/* Payout */}
          <rect x="250" y="280" width="200" height="52" rx="10" className="fill-[var(--paper-2,#f3f0ea)] stroke-[var(--ok,#2f7d4a)]" strokeWidth="1.5" />
          <text x="350" y="311" textAnchor="middle" className="fill-current" style={{ fontSize: 12, fontWeight: 600 }}>Fixed payout → wallet</text>

          {/* Arrows */}
          <path d="M170 72 H250" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M170 212 H250" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M350 100 V84" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M450 150 H530" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M615 100 V72 H750" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M170 244 C220 300 280 300 350 280" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />
          <path d="M450 200 C520 240 680 240 750 212" fill="none" stroke="currentColor" className="text-muted" strokeWidth="1.5" markerEnd="url(#arrow)" />

          <text x="200" y="64" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 10 }}>mint shares</text>
          <text x="190" y="204" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 10 }}>premium</text>
          <text x="480" y="140" className="fill-[var(--muted,#7a7368)]" style={{ fontSize: 10 }}>report</text>
        </svg>
      </div>
      <p className="text-xs text-muted mt-3">
        Open the interactive capital desk to fund, redeem or trade shares →{" "}
        <Link href="/capital" className="underline">
          /capital
        </Link>
      </p>
    </Section>
  );
}

function PoolBlock({
  title,
  currency,
  pool,
  poolUrl,
  token,
  explorer,
  snapshot,
  sharePair,
  sharePairUrl,
  aside,
  note,
}: {
  title: string;
  currency: string;
  pool: string;
  poolUrl?: string | null;
  token?: string;
  explorer?: string | null;
  snapshot: any;
  sharePair?: string | null;
  sharePairUrl?: string | null;
  aside: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <Section title={title} aside={aside}>
      <p className="text-sm text-ink-2 mb-3">
        Settlement token and vault shares are the same contract family: deposit {currency} to mint{" "}
        <span className="mono">{snapshot?.shareSymbol ?? `skjol${currency}`}</span>, redeem free capital, or trade shares on Uniswap.
      </p>
      <dl className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5">
        <dt className="text-muted">Pool / share token</dt>
        <dd className="mono">
          <ExtLink href={poolUrl}>{pool}</ExtLink>
        </dd>
        <dt className="text-muted">{currency} (ERC-20, 6 dp)</dt>
        <dd className="mono">
          <Addr explorer={explorer} address={token} />
        </dd>
        {sharePair && (
          <>
            <dt className="text-muted">Uniswap V2 pair</dt>
            <dd className="mono">
              <ExtLink href={sharePairUrl}>{sharePair}</ExtLink>
            </dd>
          </>
        )}
        {"error" in (snapshot ?? {}) ? (
          <>
            <dt className="text-muted">Status</dt>
            <dd className="text-bad">{snapshot.error}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted">Total assets</dt>
            <dd>{snapshot.totalAssets ?? "—"} test {currency}</dd>
            <dt className="text-muted">Free collateral</dt>
            <dd>{snapshot.available} test {currency}</dd>
            <dt className="text-muted">Reserved for payouts</dt>
            <dd>{snapshot.reserved} test {currency}</dd>
            <dt className="text-muted">Shares / NAV</dt>
            <dd>
              {snapshot.totalSupply ?? "—"} · {snapshot.navPerShare ?? "—"} {currency}/share
            </dd>
            {snapshot.quoteSigner && (
              <>
                <dt className="text-muted">Quote signer</dt>
                <dd className="mono">
                  <Addr explorer={explorer} address={snapshot.quoteSigner} />
                </dd>
              </>
            )}
          </>
        )}
      </dl>
      {note}
    </Section>
  );
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

  const eurc = d?.arc?.pools?.find((p: any) => p.currency === "EURC");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">How it’s built</h1>
        <p className="text-ink-2 mt-1 max-w-3xl">
          Live status of every integration, read from this deployment. Capital is pooled across policies; funders hold ERC-4626
          shares that redeem for free collateral or trade on Uniswap V2.
        </p>
      </div>
      <ErrorNote error={error} />
      {!d ? (
        <Spinner />
      ) : (
        <>
          <ArchitectureDiagram />

          <PoolBlock
            title="Arc — USDC capital pool & share vault"
            currency="USDC"
            pool={d.arc.pool}
            poolUrl={d.arc.poolUrl}
            token={d.arc.usdc}
            explorer={d.arc.chain.explorer}
            snapshot={d.arc.snapshot}
            sharePair={d.arc.snapshot?.sharePair}
            sharePairUrl={d.arc.snapshot?.sharePairUrl}
            aside={<State kind="live">Live on Arc Testnet</State>}
            note={
              d.arc.uniswap && (
                <dl className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5 mt-3 pt-3 border-t border-line">
                  <dt className="text-muted">Uniswap router</dt>
                  <dd className="mono">
                    <ExtLink href={d.arc.uniswap.routerUrl}>{d.arc.uniswap.router}</ExtLink>
                  </dd>
                  <dt className="text-muted">Uniswap factory</dt>
                  <dd className="mono">
                    <ExtLink href={d.arc.uniswap.factoryUrl}>{d.arc.uniswap.factory}</ExtLink>
                  </dd>
                </dl>
              )
            }
          />

          {eurc && (
            <PoolBlock
              title="Arc — EURC capital pool & Bridge Kit"
              currency="EURC"
              pool={eurc.pool}
              poolUrl={eurc.poolUrl}
              token={eurc.token}
              explorer={d.arc.chain.explorer}
              snapshot={eurc.snapshot}
              sharePair={eurc.sharePair}
              sharePairUrl={eurc.sharePairUrl}
              aside={<State kind="live">Live on Arc Testnet</State>}
              note={
                <p className="text-xs text-muted mt-3">
                  Same vault contract, settled in EURC. Buyers bring EURC from Ethereum Sepolia or Base Sepolia with Bridge Kit
                  (CCTP) on the buy step. Uniswap share pair is seeded when test EURC is available.
                </p>
              }
            />
          )}

          {d.x402 && (
            <Section title="x402 paid API — Circle Gateway on Arc and Hedera" aside={<State kind="live">Live</State>}>
              <dl className="text-sm grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                <dt className="text-muted">Catalog</dt>
                <dd className="mono">
                  <ExtLink href={d.x402.catalog}>{d.x402.catalog}</ExtLink>
                </dd>
                <dt className="text-muted">Arc nanopayments</dt>
                <dd className="mono">{d.x402.arc.payTo ? `${d.x402.arc.network} → ${d.x402.arc.payTo}` : "not configured"}</dd>
                <dt className="text-muted">Hedera USDC</dt>
                <dd className="mono">
                  {d.x402.hedera.payTo
                    ? `${d.x402.hedera.network} → ${d.x402.hedera.payTo} (${d.x402.hedera.token})`
                    : "not configured (set HEDERA_PAYEE_ACCOUNT_ID)"}
                </dd>
                <dt className="text-muted">HCS audit topic</dt>
                <dd className="mono">
                  {d.x402.auditTopic ? <ExtLink href={d.x402.auditTopicUrl}>{d.x402.auditTopic}</ExtLink> : "not configured"}
                </dd>
              </dl>
              <p className="text-xs text-muted mt-3">
                The Freight agent on /agent discovers these services and pays for them per call, inside spending limits enforced
                on the server.
              </p>
            </Section>
          )}

          <Section
            title="Chainlink CRE — arrival evaluation workflow"
            aside={d.cre.deployed ? <State kind="live">Deployed</State> : <State kind="sim">Simulation only</State>}
          >
            <div className="text-sm space-y-2">
              <p>
                The workflow in <span className="mono">cre/arrival-evaluator</span> reads the policy terms from Arc, fetches
                arrival records for the destination port (
                <ExtLink href="https://www.digitraffic.fi/en/marine-traffic/#restjson--api">
                  Digitraffic marine traffic REST/JSON API
                </ExtLink>{" "}
                for Finland, VesselFinder AIS port calls for India), validates them and submits a signed report to the pool. The
                pool accepts reports only from its configured forwarder.
              </p>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                <dt className="text-muted">Configured forwarder</dt>
                <dd className="mono">
                  <Addr explorer={d.arc.chain.explorer} address={d.cre.forwarder} />{" "}
                  <span className="text-xs text-muted">({d.cre.forwarderKind})</span>
                </dd>
                <dt className="text-muted">Simulation operator gate</dt>
                <dd className="mono">
                  <Addr explorer={d.arc.chain.explorer} address={d.cre.simulationOperator} />
                </dd>
                <dt className="text-muted">Production forwarder</dt>
                <dd className="mono">
                  <Addr explorer={d.arc.chain.explorer} address={d.cre.productionForwarder} />{" "}
                  <span className="text-xs text-muted">(not configured; requires a deployed workflow)</span>
                </dd>
                <dt className="text-muted">CRE chain name</dt>
                <dd className="mono">{d.cre.chainName}</dd>
              </dl>
              <p className="text-xs text-muted">
                Hackathon path: run the same WASM locally via <span className="mono">cre workflow simulate</span> (see{" "}
                <span className="mono">cre/README.md</span>). DON deploy needs Chainlink deploy access after their MNDA.
              </p>
            </div>
          </Section>

          <Section title="Arkiv — application database" aside={<State kind="live">Live on Arkiv Rabdi testnet</State>}>
            <div className="text-sm space-y-3">
              <p>
                Shipments, quotes, policies, port-call observations, evaluations and settlement events are Arkiv entities.
                Customer details and relationships are encrypted; every read is filtered by the authorised writer address.
              </p>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-y-1.5">
                {Object.entries(d.arkiv.writers).map(([role, addr]: any) => (
                  <div key={role} className="contents">
                    <dt className="text-muted capitalize">{role} writer</dt>
                    <dd className="mono">
                      <ExtLink href={d.arkiv.writerUrls[role]}>{addr}</ExtLink>
                    </dd>
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
                        {e.key ? (
                          <ExtLink href={e.entityUrl}>Arkiv entity {short(e.key, 8)}</ExtLink>
                        ) : (
                          <span className="text-muted">Arkiv entity pending</span>
                        )}
                        <span className="text-muted">·</span>
                        <ExtLink href={e.txUrl}>Arc tx {short(e.txHash, 6)}</ExtLink>
                        {e.policyId && (
                          <>
                            <span className="text-muted">·</span>
                            <Link
                              href={`/policies/${e.policyId}`}
                              className="underline decoration-line underline-offset-2 hover:decoration-ink"
                            >
                              policy {short(e.policyId, 6)}
                            </Link>
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
                <State kind="live">
                  {d.swarm.mode === "gateway" ? "Swarm public gateway" : "Own Bee node"} · postage ready
                </State>
              ) : (
                <State kind="needs">Needs SWARM_POSTAGE_BATCH_ID</State>
              )
            }
          >
            <div className="text-sm space-y-3">
              <p>
                Documents are encrypted with AES-256-GCM before upload. Swarm only ever holds ciphertext; the Swarm reference is
                sealed inside the Arkiv shipment entity. Uploads use a postage stamp batch and a Bee tag. See{" "}
                <span className="mono">{d.swarm.docs}</span>.
              </p>
              {d.swarm.postageNote && <p className="text-xs text-muted">{d.swarm.postageNote}</p>}
              {!d.swarm.prizeReady && d.swarm.mode === "bee" && (
                <p className="text-xs text-warn">
                  Set <span className="mono">SWARM_POSTAGE_BATCH_ID</span> for bee-mode uploads.
                </p>
              )}
              {!d.swarm.prizeReady && d.swarm.mode === "local-dev" && (
                <p className="text-xs text-warn">
                  Set <span className="mono">SWARM_MODE=gateway</span> (or bee + postage) for judge demos.
                </p>
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
                          {rt.tagSynced != null && (
                            <>
                              {" "}
                              · synced: <strong>{rt.tagSynced ? "yes" : "pending"}</strong>
                            </>
                          )}
                        </div>
                      )}
                      {rt.ciphertextUrl && (
                        <div>
                          <ExtLink href={rt.ciphertextUrl}>Open ciphertext on Swarm</ExtLink> (unreadable without the key)
                        </div>
                      )}
                      <div>
                        Decrypted content matches: <strong>{rt.plaintextMatches ? "yes" : "no"}</strong> · upload {rt.uploadMs}{" "}
                        ms · read {rt.readMs} ms
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section title="AI assistant" aside={d.ai.enabled ? <State kind="live">Live</State> : <State kind="needs">Needs AI Gateway key</State>}>
            <p className="text-sm">
              Reads documents (with source quotes and page numbers), explains cover and writes claim summaries. It never prices,
              decides eligibility or computes payouts — those are fixed rules in code and in the contract.
              {!d.ai.enabled && " Without a key, documents are read by deterministic offline rules and explanations use fixed templates."}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
