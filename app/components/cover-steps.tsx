"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { erc20Abi, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { poolAbi } from "@/lib/abi/ShipmentDelayPool";
import { api, fmtDate, short } from "./api";
import { useSession } from "./session";
import { DataLabel, ErrorNote, ExtLink, Spinner, TestFunds } from "./ui";
import { arcTestnet } from "./wagmi";
import { BridgeEurc } from "./bridge-eurc";
import { EVIDENCE_SOURCES, PORTS, PORT_COUNTRIES, portInfo, type PortCountry } from "@/shared/ports";
import { parseDocDate } from "@/shared/dates";
import { explainPurchaseError, insufficientCollateralMessage } from "@/shared/purchase-error";

// ------------------------------------------------------------------ types
export interface Field { value: string | null; sourceExcerpt: string | null; page: number | null; status: "found" | "missing" | "conflicting" | "unverified" }
export interface Extraction {
  source: "ai" | "offline-rules";
  model: string | null;
  fields: Record<string, Field>;
  issues: { field: string; kind: string; message: string }[];
  pages: number;
}
export interface UploadResult {
  shipmentId: string;
  extraction: Extraction;
  storage: {
    mode: string;
    reference: string;
    size: number;
    tagUid?: number | null;
    ciphertextUrl?: string | null;
    label?: string;
  };
  arkivKey?: string;
  arkivUrl?: string | null;
}
export interface Offer {
  quoteId: Hex; policyId: Hex; productId: string; productName: string; premium: string; payout: string;
  thresholdHours: number; agreedArrivalDeadline: string; purchaseCutoff: string; quoteExpiry: string; terms: string;
  chainId: number; pool: Hex; currency: "USDC" | "EURC"; token: Hex; message: Record<string, string | number>; signature: Hex; demoOnly: boolean;
}
type QuoteResponse = { offers: Offer[]; declined: { productId: string; reasons: string[] }[]; currencies: ("USDC" | "EURC")[] };

export const SAMPLES = [
  { file: "bl-baltic-wren.txt", label: "Bill of lading — Baltic Wren to Helsinki", group: "Finland" },
  { file: "bl-harbour-siskin.txt", label: "Bill of lading — Harbour Siskin to Hamina", group: "Finland" },
  { file: "bl-nordic-tern.txt", label: "Sea waybill — Nordic Tern to Kotka (contains a prompt-injection line)", group: "Finland" },
  { file: "bl-aurora-skerry.txt", label: "Booking confirmation — Aurora Skerry to Turku", group: "Finland" },
  { file: "bl-kestrel-bay.txt", label: "Bill of lading — Kestrel Bay to Rauma", group: "Finland" },
  { file: "bl-indus-heron.txt", label: "Bill of lading — Indus Heron to Nhava Sheva (Mumbai)", group: "India" },
  { file: "bl-gulf-mallard.txt", label: "Bill of lading — Gulf Mallard to Mundra", group: "India" },
  { file: "bl-coromandel-lark.txt", label: "Bill of lading — Coromandel Lark to Chennai", group: "India" },
  { file: "bl-malabar-kite.txt", label: "Bill of lading — Malabar Kite to Kochi", group: "India" },
  { file: "bl-conflicting-imo.txt", label: "Bill of lading with conflicting vessel details", group: "Reading checks" },
];

const SAMPLE_GROUPS = ["Finland", "India", "Reading checks"] as const;

export function SampleChoices({ disabled, onPick }: { disabled?: boolean; onPick: (file: string) => void }) {
  return (
    <div className="space-y-3">
      {SAMPLE_GROUPS.map((group) => {
        const items = SAMPLES.filter((s) => s.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{group}</div>
            <div className="flex flex-wrap gap-2">
              {items.map((s) => (
                <button key={s.file} type="button" className="btn btn-ghost !py-1 !px-3 !text-xs !font-medium" disabled={disabled} onClick={() => onPick(s.file)}>
                  {s.label.replace(/^(Bill of lading|Sea waybill|Booking confirmation) — /, "")}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- connect
export function ConnectStep() {
  const { signInWithWallet, useDemoWallet, demoAvailable, hasBrowserWallet, error } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-ink-2">Connect a wallet so your shipment and policy are private to you. Signing in costs nothing.</p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={!!busy || !hasBrowserWallet}
          title={hasBrowserWallet ? "" : "No browser wallet detected"}
          onClick={async () => { setBusy("w"); await signInWithWallet(); setBusy(null); }}
        >
          {busy === "w" ? "Waiting for wallet…" : hasBrowserWallet ? "Connect browser wallet" : "No browser wallet detected"}
        </button>
        {demoAvailable && (
          <button className="btn btn-ghost" disabled={!!busy} onClick={async () => { setBusy("d"); await useDemoWallet(); setBusy(null); }}>
            Use demo wallet (test funds)
          </button>
        )}
      </div>
      {!hasBrowserWallet && (
        <p className="text-xs text-ink-2">
          To pay with your own wallet, install a browser wallet (for example MetaMask or Rabby), add Arc Testnet (chain ID 5042002) and get test USDC from faucet.circle.com.
        </p>
      )}
      {demoAvailable && <p className="text-xs text-muted">The demo wallet is a shared test account held by this demo server, so you can try the flow without installing anything.</p>}
      <ErrorNote error={error} />
    </div>
  );
}

// ------------------------------------------------------------------ upload
export function UploadStep({ onDone }: { onDone: (r: UploadResult) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [synthetic, setSynthetic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSample(name: string) {
    const res = await fetch(`/samples/${name}`);
    setFile(new File([await res.blob()], name, { type: "text/plain" }));
    setSynthetic(true);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("synthetic", String(synthetic));
      onDone(await api<UploadResult>("/api/shipments", { method: "POST", body: fd }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block border-2 border-dashed border-line rounded-xl p-6 text-center cursor-pointer hover:bg-paper-2">
        <input type="file" accept=".pdf,.txt,text/plain,application/pdf" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setSynthetic(false); }} />
        <div className="font-semibold">{file ? file.name : "Choose your bill of lading or booking confirmation"}</div>
        <div className="text-xs text-muted mt-1">PDF or text, up to 2 MB. Encrypted before it leaves our server.</div>
      </label>
      <div>
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Or try a synthetic sample</div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button key={s.file} className="btn btn-ghost !py-1 !px-3 !text-xs !font-medium" onClick={() => loadSample(s.file)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {file && synthetic && <DataLabel label="synthetic" />}
      <div className="flex items-center gap-3">
        <button className="btn btn-signal" disabled={!file || busy} onClick={submit}>
          Read document
        </button>
        {busy && <Spinner label="Encrypting, storing and reading your document…" />}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

// ------------------------------------------------------------------ review
const LABELS: Record<string, string> = {
  vesselName: "Vessel name",
  vesselImo: "IMO number",
  vesselMmsi: "MMSI (optional)",
  voyageRef: "Voyage reference",
  originPort: "Port of loading",
  destinationLocode: "Destination port",
  departureDate: "Departure / sailing date (UTC)",
  agreedArrivalDeadline: "Agreed arrival deadline (UTC)",
};
const EDITABLE = Object.keys(LABELS);
const toLocalInput = (raw: string | null) => {
  const iso = raw ? parseDocDate(raw) : null;
  return iso ? iso.slice(0, 16) : "";
};

export function ReviewForm({ shipmentId, extraction, onConfirmed }: { shipmentId: string; extraction: Extraction; onConfirmed: (shipment: Record<string, string>) => void }) {
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const k of EDITABLE) {
      const f = extraction.fields[k];
      v[k] = k === "departureDate" || k === "agreedArrivalDeadline" ? toLocalInput(f?.value ?? null) : (f?.value ?? "");
    }
    if (!v.originPort && extraction.fields.originPort?.value) v.originPort = extraction.fields.originPort.value;
    return v;
  }, [extraction]);
  const [vals, setVals] = useState(initial);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conflicts = extraction.issues.filter((i) => i.kind === "conflicting");

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const shipment = {
        ...vals,
        vesselMmsi: vals.vesselMmsi || null,
        departureDate: vals.departureDate ? new Date(vals.departureDate + "Z").toISOString() : "",
        agreedArrivalDeadline: vals.agreedArrivalDeadline ? new Date(vals.agreedArrivalDeadline + "Z").toISOString() : "",
      };
      await api(`/api/shipments/${shipmentId}/confirm`, { method: "POST", json: { shipment, acknowledgedConflicts: ack } });
      onConfirmed(shipment as Record<string, string>);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-ink-2 flex flex-wrap items-center gap-2">
        Read by {extraction.source === "ai" ? <>the AI assistant</> : <>offline document rules (AI not configured)</>}. Please check every
        value against your document — nothing is final until you confirm.
      </div>
      {extraction.issues.length > 0 && (
        <ul className="rounded-lg bg-[#fbf0dc] border border-warn/30 text-sm px-4 py-3 space-y-1">
          {extraction.issues.map((i, n) => (
            <li key={n}>
              <strong>{LABELS[i.field] ?? i.field}:</strong> {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {EDITABLE.map((k) => {
          const f = extraction.fields[k];
          const isDate = k === "departureDate" || k === "agreedArrivalDeadline";
          return (
            <div key={k}>
              <label className="text-xs font-semibold text-ink-2 flex items-center gap-2">
                {LABELS[k]}
                {f && f.status !== "found" && <span className={`tag !text-[10px] ${f.status === "missing" ? "text-muted" : "text-warn"}`}>{f.status}</span>}
              </label>
              {k === "destinationLocode" ? (
                <PortSelect value={vals[k] ?? ""} onChange={(v) => setVals({ ...vals, [k]: v })} />
              ) : (
                <input
                  className="input mt-1"
                  type={isDate ? "datetime-local" : "text"}
                  value={vals[k] ?? ""}
                  onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                />
              )}
              {f?.sourceExcerpt && (
                <div className="text-[11px] text-muted mt-1 mono truncate" title={f.sourceExcerpt}>
                  p.{f.page ?? "?"}: “{f.sourceExcerpt}”
                </div>
              )}
            </div>
          );
        })}
      </div>
      {extraction.fields.eta?.value && (
        <p className="text-xs text-muted">
          The document also mentions an ETA of {fmtDate(extraction.fields.eta.value)}. ETAs are informational; your cover uses the agreed deadline above.
        </p>
      )}
      {conflicts.length > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1" />
          I have checked the conflicting values and the details above are the correct ones.
        </label>
      )}
      <button className="btn btn-primary" disabled={busy} onClick={confirm}>
        {busy ? "Saving…" : "Confirm details"}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

function PortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = portInfo(value);
  const source = selected ? EVIDENCE_SOURCES[selected.source] : null;
  return (
    <>
      <select className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a port…</option>
        {value && !selected && <option value={value}>{value} (not covered)</option>}
        {(Object.keys(PORT_COUNTRIES) as PortCountry[]).map((c) => (
          <optgroup key={c} label={PORT_COUNTRIES[c]}>
            {PORTS.filter((p) => p.country === c).map((p) => (
              <option key={p.locode} value={p.locode}>
                {p.name} ({p.locode})
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {source && <div className="text-[11px] text-muted mt-1">Arrival data: {source.description.toLowerCase()} ({source.name}).</div>}
    </>
  );
}

// ------------------------------------------------------------------ quotes
export function QuoteCards({ shipmentId, onChoose }: { shipmentId: string; onChoose: (o: Offer) => void }) {
  const [state, setState] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [currency, setCurrency] = useState<"USDC" | "EURC">("USDC");
  useEffect(() => {
    const key = `${shipmentId}#${currency}#${attempt}`;
    if (requested.current === key) return; // issue quotes once per attempt (Strict Mode runs effects twice)
    requested.current = key;
    setError(null);
    setState(null);
    api<QuoteResponse>(`/api/shipments/${shipmentId}/quotes?currency=${currency}`, { method: "POST" })
      .then(setState)
      .catch((e) => setError(e.message));
  }, [shipmentId, currency, attempt]);
  const toggle = state && state.currencies.length > 1 && (
    <div className="inline-flex rounded-full border border-line bg-[#fffdf8] p-1 text-sm mb-4">
      {state.currencies.map((c) => (
        <button key={c} className={`px-3 py-1 rounded-full ${currency === c ? "bg-ink text-paper" : ""}`} onClick={() => setCurrency(c)}>
          {c === "EURC" ? "Pay in euros (EURC)" : "Pay in dollars (USDC)"}
        </button>
      ))}
    </div>
  );
  if (error)
    return (
      <div className="space-y-3">
        <ErrorNote error={error} />
        <button className="btn btn-ghost" onClick={() => setAttempt((a) => a + 1)}>
          Try again
        </button>
      </div>
    );
  if (!state) return <Spinner label="Preparing your quotes…" />;
  if (!state.offers.length)
    return (
      <div className="text-sm space-y-2">
        {toggle}
        <p>We can’t offer cover for this shipment:</p>
        <ul className="list-disc pl-5 text-ink-2">{[...new Set(state.declined.flatMap((d) => d.reasons))].map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    );
  return (
    <div>
      {toggle}
      <div className="grid md:grid-cols-2 gap-4">
        {state.offers.map((o) => (
          <OfferCard key={o.quoteId} o={o} onChoose={() => onChoose(o)} />
        ))}
      </div>
    </div>
  );
}

export function OfferCard({ o, onChoose }: { o: Offer; onChoose?: () => void }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-display text-lg font-semibold">{o.productName}</div>
        <TestFunds currency={o.currency} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold">{o.payout}</span>
        <span className="text-sm text-ink-2">{o.currency} paid if the vessel arrives more than {o.thresholdHours >= 1 ? `${o.thresholdHours} h` : `${Math.round(o.thresholdHours * 60)} min`} late</span>
      </div>
      <dl className="text-sm grid grid-cols-2 gap-y-1">
        <dt className="text-muted">Premium</dt>
        <dd className="font-semibold">{o.premium} {o.currency}</dd>
        <dt className="text-muted">Agreed deadline</dt>
        <dd>{fmtDate(o.agreedArrivalDeadline)}</dd>
        <dt className="text-muted">Buy before</dt>
        <dd>{fmtDate(o.quoteExpiry)}</dd>
      </dl>
      <details className="text-xs text-ink-2">
        <summary className="cursor-pointer font-semibold">Policy wording</summary>
        <pre className="whitespace-pre-wrap mono mt-2 bg-paper-2 rounded p-2">{o.terms}</pre>
      </details>
      {onChoose && (
        <button className="btn btn-signal mt-auto" onClick={onChoose}>
          Choose this cover
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- buy
export interface PurchaseDone { policyId: Hex; purchaseTx: Hex; purchaseTxUrl: string | null }

export function BuyCard({ offer, onDone }: { offer: Offer; onDone: (r: PurchaseDone) => void }) {
  const { session, signInWithWallet } = useSession();
  const { chainId, isConnected, address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

  const args = useMemo(() => {
    const m = offer.message;
    return {
      quoteId: m.quoteId as Hex, policyId: m.policyId as Hex, beneficiary: m.beneficiary as Hex, vesselImo: Number(m.vesselImo),
      voyageRefHash: m.voyageRefHash as Hex, destinationLocode: m.destinationLocode as Hex, eventType: Number(m.eventType),
      earliestArrival: BigInt(m.earliestArrival), agreedArrivalDeadline: BigInt(m.agreedArrivalDeadline), delayThreshold: Number(m.delayThreshold),
      premium: BigInt(m.premium), payout: BigInt(m.payout), termsHash: m.termsHash as Hex, purchaseCutoff: BigInt(m.purchaseCutoff), quoteExpiry: BigInt(m.quoteExpiry),
    };
  }, [offer]);

  // One wallet request per click. Chaining switch -> approve -> purchase in a single handler can leave
  // MetaMask rendering a request that was replaced, which crashes its popup.
  const onArc = chainId === arcTestnet.id;
  const sameWallet = isConnected && address?.toLowerCase() === session?.address.toLowerCase();
  const allowance = useReadContract({
    address: offer.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: session ? [session.address, offer.pool] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!session && !session.demo },
  });
  const approved = (allowance.data ?? 0n) >= args.premium;
  const capital = useReadContract({
    address: offer.pool,
    abi: poolAbi,
    functionName: "availableCapital",
    chainId: arcTestnet.id,
  });
  const free = capital.data;
  const collateralMessage = free !== undefined && free + args.premium < args.payout
    ? insufficientCollateralMessage({
        currency: offer.currency,
        pool: offer.pool,
        availableAfterPremium: free + args.premium,
        payout: args.payout,
      })
    : null;
  const collateralShort = collateralMessage !== null;

  async function guarded(label: string, fn: () => Promise<void>) {
    setError(null);
    setStep(label);
    try {
      await fn();
    } catch (e) {
      setError(explainPurchaseError(e, { currency: offer.currency, pool: offer.pool }));
    } finally {
      setStep(null);
    }
  }

  const switchNetwork = () =>
    guarded("Approve the network switch in your wallet…", async () => {
      await switchChainAsync({
        chainId: arcTestnet.id,
        addEthereumChainParameter: {
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.testnet.arc.network"],
          blockExplorerUrls: ["https://explorer.testnet.arc.io"],
        },
      });
    });

  const approve = () =>
    guarded(`Approve the test ${offer.currency} premium in your wallet…`, async () => {
      const hash = await writeContractAsync({ address: offer.token, abi: erc20Abi, functionName: "approve", args: [offer.pool, args.premium], chainId: arcTestnet.id });
      setStep("Waiting for the approval to confirm…");
      await client!.waitForTransactionReceipt({ hash });
      await allowance.refetch();
    });

  const buyWithWallet = () =>
    guarded("Confirm the purchase in your wallet…", async () => {
      // Simulate first so a revert (underfunded pool, expired quote) is explained before the wallet opens.
      await client!.simulateContract({ address: offer.pool, abi: poolAbi, functionName: "purchase", args: [args, offer.signature], account: address });
      const hash = await writeContractAsync({ address: offer.pool, abi: poolAbi, functionName: "purchase", args: [args, offer.signature], chainId: arcTestnet.id });
      setStep("Waiting for confirmation…");
      const r = await client!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") {
        await client!.simulateContract({ address: offer.pool, abi: poolAbi, functionName: "purchase", args: [args, offer.signature], account: address });
        throw new Error("The purchase transaction failed.");
      }
      setStep("Updating your dashboard…");
      await api("/api/sync", { method: "POST" }).catch(() => {});
      onDone({ policyId: offer.policyId, purchaseTx: hash, purchaseTxUrl: `${arcTestnet.blockExplorers.default.url}/tx/${hash}` });
    });

  async function buyWithDemo() {
    setError(null);
    setStep("Paying the premium from the demo wallet and recording your policy…");
    try {
      onDone(await api<PurchaseDone>("/api/purchase/demo", { method: "POST", json: { quoteId: offer.quoteId } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep(null);
    }
  }

  return (
    <div className="space-y-4">
      <OfferCard o={offer} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
        <span>
          I understand this pays only when the <strong>vessel’s recorded arrival</strong> is late beyond the threshold — not for unloading, customs or delivery delays — and that this demo uses test funds.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {session?.demo ? (
          <button className="btn btn-signal" disabled={!agree || !!step || collateralShort} onClick={buyWithDemo}>
            Buy with demo wallet ({offer.premium} test {offer.currency})
          </button>
        ) : (
          <div className="w-full space-y-2">
            {!sameWallet && (
              <div className="rounded-lg border border-warn/40 bg-[#fbf0dc] p-3 text-sm space-y-2">
                {isConnected ? (
                  <>
                    <p>
                      Your wallet’s active account is <span className="mono">{short(address)}</span>, but you signed in as <span className="mono">{short(session?.address)}</span>.
                      Switch back to that account in your wallet, or sign in with the active account. Signing in as a different account starts over:
                      documents and quotes are private to the account that uploaded them.
                    </p>
                    <button className="btn btn-ghost !py-1 !text-xs" disabled={!!step} onClick={() => guarded("Sign the message in your wallet…", signInWithWallet)}>
                      Sign in as {short(address)} instead
                    </button>
                  </>
                ) : (
                  <p>Connect your browser wallet ({short(session?.address)}) to continue.</p>
                )}
              </div>
            )}
            <ol className="flex flex-wrap gap-2">
              <li>
                <button className={`btn ${onArc ? "btn-ghost" : "btn-primary"}`} disabled={!agree || !!step || !sameWallet || onArc} onClick={switchNetwork}>
                  {onArc ? "✓ On Arc Testnet" : "1. Switch to Arc Testnet"}
                </button>
              </li>
              <li>
                <button className={`btn ${approved ? "btn-ghost" : "btn-primary"}`} disabled={!agree || !!step || !onArc || approved} onClick={approve}>
                  {approved ? "✓ Premium approved" : `2. Approve ${offer.premium} test ${offer.currency}`}
                </button>
              </li>
              <li>
                <button className="btn btn-signal" disabled={!agree || !!step || !onArc || !approved || collateralShort} onClick={buyWithWallet}>
                  3. Buy cover
                </button>
              </li>
            </ol>
            <p className="text-xs text-muted">Each step opens one wallet request. Wait for it to finish before the next one.</p>
          </div>
        )}
      </div>
      {offer.currency === "EURC" && <BridgeEurc defaultAmount={offer.premium} />}
      {step && <Spinner label={step} />}
      <ErrorNote error={error ?? collateralMessage} />
      <p className="text-xs text-muted">{offer.currency} pool contract <span className="mono">{short(offer.pool)}</span> on Arc Testnet.</p>
    </div>
  );
}

export function PurchasedNote({ r }: { r: PurchaseDone }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold text-ok">You’re covered.</p>
      <p className="text-sm">
        Payment confirmed: <ExtLink href={r.purchaseTxUrl}>view transaction</ExtLink>
      </p>
      <Link className="btn btn-primary" href={`/policies/${r.policyId}`}>
        Track this shipment
      </Link>
    </div>
  );
}
