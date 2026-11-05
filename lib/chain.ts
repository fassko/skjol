import "server-only";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { poolAbi } from "./abi/ShipmentDelayPool";
import { account, chainConfig } from "./config";
import { QUOTE_TYPES, quoteDomain, type QuoteMessage } from "../shared/quote";

export function viemChain() {
  const c = chainConfig();
  return defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, // Arc native gas USDC = 18 decimals
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: c.explorer ? { default: { name: "Arcscan", url: c.explorer } } : undefined,
  });
}

let _pub: ReturnType<typeof createPublicClient> | null = null;
export function publicClient() {
  _pub ??= createPublicClient({ chain: viemChain(), transport: http(chainConfig().rpcUrl) });
  return _pub;
}

export function walletClient(envKey: string) {
  return createWalletClient({ chain: viemChain(), transport: http(chainConfig().rpcUrl), account: account(envKey) });
}

export function txLink(txHash: string): string | null {
  const c = chainConfig();
  return c.explorer ? `${c.explorer}/tx/${txHash}` : null;
}

export function addressLink(addr: string): string | null {
  const c = chainConfig();
  return c.explorer ? `${c.explorer}/address/${addr}` : null;
}

export async function signQuote(message: QuoteMessage): Promise<Hex> {
  const c = chainConfig();
  const signer = account("QUOTE_SIGNER_PRIVATE_KEY");
  return signer.signTypedData({ domain: quoteDomain(c.id, c.pool), types: QUOTE_TYPES, primaryType: "Quote", message });
}

export const POLICY_STATUS = ["none", "active", "paid_out", "closed_no_payout", "resolved_by_review"] as const;

export async function readPolicy(policyId: Hex) {
  const c = chainConfig();
  const p = await publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "getPolicy", args: [policyId] });
  return { ...p, statusName: POLICY_STATUS[Number(p.status)] };
}

export async function poolSnapshot() {
  const c = chainConfig();
  const [available, reserved, signer, forwarder, simOperator] = await Promise.all([
    publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "availableCapital" }),
    publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "totalReserved" }),
    publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "quoteSigner" }),
    publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "getForwarderAddress" }),
    publicClient().readContract({ address: c.pool, abi: poolAbi, functionName: "simulationOperator" }),
  ]);
  return { pool: c.pool as Address, usdc: c.usdc, available, reserved, quoteSigner: signer, forwarder, simulationOperator: simOperator };
}
