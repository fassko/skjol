"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { api } from "./api";
import { useSession } from "./session";
import { ErrorNote, ExtLink, Spinner } from "./ui";
import { arcTestnet } from "./wagmi";

export const ARC_EURC = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;
export const BRIDGE_CHAINS = [
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
  { id: "Base_Sepolia", label: "Base Sepolia" },
] as const;
export type BridgeChain = (typeof BRIDGE_CHAINS)[number]["id"];

export interface BridgeStepView { name: string; state: string; txHash?: string; explorerUrl?: string }
export interface BridgeOutcome { state: string; amount: string; steps: BridgeStepView[] }

/** Move EURC between a testnet and Arc with Circle Bridge Kit (CCTP burn → attestation → mint). */
export function BridgeEurc({ defaultAmount, direction = "in", title }: { defaultAmount: string; direction?: "in" | "out"; title?: string }) {
  const { session } = useSession();
  const [chain, setChain] = useState<BridgeChain>("Ethereum_Sepolia");
  const [amount, setAmount] = useState(defaultAmount);
  const [progress, setProgress] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<BridgeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const balance = useReadContract({
    address: ARC_EURC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: session ? [session.address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!session },
  });
  const arcEurc = balance.data !== undefined ? (Number(balance.data) / 1e6).toFixed(2) : "…";
  const from = direction === "in" ? chain : "Arc_Testnet";
  const to = direction === "in" ? "Arc_Testnet" : chain;

  async function run() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setProgress([]);
    try {
      if (session?.demo) {
        setProgress(["Demo wallet: the server signs the burn and mint with the shared TEST key…"]);
        setOutcome(await api<BridgeOutcome>("/api/bridge/demo", { method: "POST", json: { chain, amount, direction } }));
      } else {
        const eth = (window as any).ethereum;
        if (!eth) throw new Error("Connect a browser wallet to bridge EURC.");
        // Loaded on click: Bridge Kit is large and only needed here.
        const [{ BridgeKit }, { createViemAdapterFromProvider }] = await Promise.all([import("@circle-fin/bridge-kit"), import("@circle-fin/adapter-viem-v2")]);
        const kit = new BridgeKit();
        kit.on("*", (p: any) => setProgress((x) => [...x, describeEvent(p)].slice(-8)));
        const adapter = await createViemAdapterFromProvider({ provider: eth });
        const r: any = await kit.bridge({ from: { adapter, chain: from }, to: { adapter, chain: to }, amount, token: "EURC" });
        setOutcome({ state: r.state, amount: r.amount, steps: (r.steps ?? []).map((s: any) => ({ name: s.name, state: s.state, txHash: s.txHash, explorerUrl: s.explorerUrl })) });
      }
      await balance.refetch();
    } catch (e) {
      const err = e as { shortMessage?: string; code?: number };
      setError(err.code === 4001 ? "You cancelled the request in your wallet." : (err.shortMessage ?? (e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-paper-2/50 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold">{title ?? (direction === "in" ? "Need EURC on Arc? Bridge it in" : "Send EURC to another chain")}</div>
        <div className="text-xs text-muted">Your EURC on Arc: <strong>{arcEurc}</strong></div>
      </div>
      <p className="text-xs text-ink-2">
        Circle Bridge Kit moves EURC with CCTP: it burns on the source chain, waits for Circle&rsquo;s attestation and mints on the destination. Test tokens only.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input !w-auto" value={chain} onChange={(e) => setChain(e.target.value as BridgeChain)} disabled={busy}>
          {BRIDGE_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {direction === "in" ? `From ${c.label}` : `To ${c.label}`}
            </option>
          ))}
        </select>
        <input className="input !w-28" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={busy} aria-label="Amount of EURC" />
        <span className="text-xs text-muted">EURC</span>
        <button className="btn btn-primary" disabled={busy || !session || !(Number(amount) > 0)} onClick={run}>
          {busy ? "Bridging…" : direction === "in" ? "Bridge to Arc" : "Bridge out"}
        </button>
      </div>
      {busy && <Spinner label={progress.at(-1) ?? "Starting…"} />}
      {outcome && <BridgeSteps outcome={outcome} />}
      <ErrorNote error={error} />
    </div>
  );
}

export function BridgeSteps({ outcome }: { outcome: BridgeOutcome }) {
  return (
    <div className="space-y-1">
      <div className={outcome.state === "success" ? "text-ok font-semibold" : "text-warn font-semibold"}>
        {outcome.state === "success" ? `Bridged ${outcome.amount} EURC.` : `Bridge ${outcome.state}.`}
      </div>
      <ol className="text-xs space-y-0.5">
        {outcome.steps.map((s, i) => (
          <li key={i} className="mono">
            {s.state === "success" ? "✓" : s.state === "error" ? "✗" : "·"} {s.name} {s.explorerUrl ? <ExtLink href={s.explorerUrl}>tx</ExtLink> : s.txHash ? s.txHash.slice(0, 12) : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

function describeEvent(p: any): string {
  const name = p?.method ?? p?.action ?? p?.name ?? "step";
  const state = p?.values?.state ?? p?.state ?? "";
  return `${String(name)} ${String(state)}`.trim();
}
