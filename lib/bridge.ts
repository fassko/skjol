import "server-only";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import type { Hex } from "viem";
import { HttpError } from "./session";

export const BRIDGE_CHAINS = ["Ethereum_Sepolia", "Base_Sepolia"] as const;
export type BridgeChain = (typeof BRIDGE_CHAINS)[number];

/** Bridge EURC between a testnet and Arc with Circle Bridge Kit, signing with a server-held TEST key. */
export async function bridgeEurc(p: { privateKey: Hex; chain: BridgeChain; amount: string; direction: "in" | "out" }) {
  if (!BRIDGE_CHAINS.includes(p.chain)) throw new HttpError(400, "Unsupported source chain.");
  if (!/^\d+(\.\d{1,6})?$/.test(p.amount) || Number(p.amount) <= 0 || Number(p.amount) > 50) throw new HttpError(400, "Amount must be between 0 and 50 EURC.");
  const kit = new BridgeKit();
  const adapter = createViemAdapterFromPrivateKey({ privateKey: p.privateKey });
  const from = p.direction === "in" ? p.chain : "Arc_Testnet";
  const to = p.direction === "in" ? "Arc_Testnet" : p.chain;
  const r = await kit.bridge({ from: { adapter, chain: from }, to: { adapter, chain: to }, amount: p.amount, token: "EURC" });
  return {
    state: r.state,
    amount: r.amount,
    from,
    to,
    steps: r.steps.map((s) => ({ name: s.name, state: s.state, txHash: s.txHash, explorerUrl: s.explorerUrl })),
  };
}
