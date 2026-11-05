import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { x402Client } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { GatewayClient, registerBatchScheme } from "@circle-fin/x402-batching/client";
import { ARC_TESTNET, agentDefaults, config, hederaConfig, x402Config } from "./config";
import { blindTag } from "./crypto";
import { hashscanTx, hcsLog, hederaAgentSigner, type AuditEvent } from "./hedera";
import { HttpError, demoCustomer, type Session } from "./session";
import { store, type AgentRail, type AgentSettingsRecord, type AgentSpendRecord } from "./store";
import { formatUsdc } from "../shared/products";

// The freight agent's wallet. Spending controls are enforced HERE, before anything is signed,
// never only in the prompt: per-call maximum, daily cap, approval threshold for cover, kill switch.
// Every decision (paid, declined, failed) goes to the Arkiv ledger and the Hedera HCS audit topic.

const HARD_MAX = { perCallMax: 1_000_000n, dailyCap: 20_000_000n, approvalThreshold: 20_000_000n };
const DAY_SEC = 24 * 3600;

export interface AgentLimits {
  perCallMax: bigint;
  dailyCap: bigint;
  approvalThreshold: bigint;
  paused: boolean;
  preferredRail: "arc-gateway" | "hedera";
}

export const ownerTagOf = (session: Session) => blindTag("owner", session.address);

/** The agent signs with the server-held TEST key. Any logged-in session can use it; spend is attributed to that session. */
export function requireAgentWallet(_session: Session) {
  const acct = demoCustomer();
  if (!acct) throw new HttpError(403, "The freight agent needs the demo wallet key configured (test funds only).");
  return acct;
}

export async function agentLimits(session: Session): Promise<AgentLimits & { globalPause: boolean; saved: boolean }> {
  const saved = await store().getAgentSettings(ownerTagOf(session)).catch(() => null);
  return {
    perCallMax: saved?.perCallMax ?? agentDefaults.perCallMax(),
    dailyCap: saved?.dailyCap ?? agentDefaults.dailyCap(),
    approvalThreshold: saved?.approvalThreshold ?? agentDefaults.approvalThreshold(),
    paused: saved?.paused ?? false,
    preferredRail: saved?.preferredRail ?? (hederaConfig.enabled() ? "hedera" : "arc-gateway"),
    globalPause: agentDefaults.globalKillSwitch(),
    saved: !!saved,
  };
}

export async function saveAgentLimits(session: Session, input: Partial<Record<keyof AgentLimits, unknown>>) {
  const cur = await agentLimits(session);
  const units = (v: unknown, fallback: bigint, max: bigint) => {
    if (v === undefined || v === null || v === "") return fallback;
    const n = typeof v === "number" ? v : Number(String(v));
    if (!Number.isFinite(n) || n < 0) throw new HttpError(422, "Limits must be positive amounts.");
    const u = BigInt(Math.round(n * 1_000_000));
    return u > max ? max : u;
  };
  const rec: AgentSettingsRecord = {
    ownerTag: ownerTagOf(session),
    perCallMax: units(input.perCallMax, cur.perCallMax, HARD_MAX.perCallMax),
    dailyCap: units(input.dailyCap, cur.dailyCap, HARD_MAX.dailyCap),
    approvalThreshold: units(input.approvalThreshold, cur.approvalThreshold, HARD_MAX.approvalThreshold),
    paused: typeof input.paused === "boolean" ? input.paused : cur.paused,
    preferredRail: input.preferredRail === "hedera" || input.preferredRail === "arc-gateway" ? input.preferredRail : cur.preferredRail,
    updatedAtSec: Math.floor(Date.now() / 1000),
  };
  await store().putAgentSettings(rec);
  return agentLimits(session);
}

export async function ledger(session: Session, sinceSec?: number) {
  return store().listAgentSpends({ ownerTag: ownerTagOf(session), sinceSec, limit: 100 });
}

export async function spentToday(session: Session) {
  const items = await ledger(session, Math.floor(Date.now() / 1000) - DAY_SEC);
  return items.filter((s) => s.status === "settled").reduce((a, s) => a + s.amountUnits, 0n);
}

export async function spendingStatus(session: Session) {
  const [limits, spent] = await Promise.all([agentLimits(session), spentToday(session)]);
  const remaining = limits.dailyCap > spent ? limits.dailyCap - spent : 0n;
  return { limits, spentToday: spent, remainingToday: remaining };
}

/** The single gate every agent payment passes through. */
export async function checkSpend(session: Session, amount: bigint, kind: "data" | "cover"): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { limits, spentToday: spent } = await spendingStatus(session);
  if (limits.globalPause) return { ok: false, reason: "Agent payments are paused on this deployment (kill switch)." };
  if (limits.paused) return { ok: false, reason: "You paused agent spending (kill switch)." };
  if (kind === "data" && amount > limits.perCallMax) return { ok: false, reason: `Price ${formatUsdc(amount)} is above your per-call limit of ${formatUsdc(limits.perCallMax)}.` };
  if (spent + amount > limits.dailyCap)
    return { ok: false, reason: `This would take today's spending to ${formatUsdc(spent + amount)}, above your daily cap of ${formatUsdc(limits.dailyCap)}.` };
  return { ok: true };
}

export async function recordSpend(session: Session, r: Omit<AgentSpendRecord, "spendId" | "ownerTag" | "createdAtSec" | "hcs">, audit: AuditEvent["type"]) {
  const ownerTag = ownerTagOf(session);
  const hcs = await hcsLog({
    type: audit,
    agent: ownerTag.slice(0, 16),
    detail: { kind: r.kind, rail: r.rail, network: r.network, resource: r.resource.slice(0, 160), amount: formatUsdc(r.amountUnits), asset: r.asset, status: r.status, reason: r.reason.slice(0, 160), reference: r.reference },
  });
  const rec: AgentSpendRecord = { ...r, spendId: `spd_${randomUUID().replace(/-/g, "").slice(0, 20)}`, ownerTag, createdAtSec: Math.floor(Date.now() / 1000), hcs: hcs.ref };
  const saved = await store().putAgentSpend(rec).catch((e) => {
    console.error("agent ledger write failed", e);
    return rec;
  });
  return { ...saved, hcsUrl: hcs.url, hcsError: hcs.error };
}

// One payment at a time per wallet, so two concurrent tool calls cannot both pass the daily cap.
const locks = new Map<string, Promise<unknown>>();
async function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next.catch(() => {}));
  return next;
}

const railOf = (r: PaymentRequirements): AgentRail =>
  r.network.startsWith("hedera:") ? "hedera" : (r.extra as { name?: string } | undefined)?.name === "GatewayWalletBatched" ? "arc-gateway" : "arc-onchain";

function assetLabel(r: PaymentRequirements) {
  if (r.network.startsWith("hedera:")) return r.asset === x402Config.hederaUsdcToken() ? "USDC" : r.asset;
  const a = r.asset.toLowerCase();
  return a === ARC_TESTNET.usdc.toLowerCase() ? "USDC" : a === ARC_TESTNET.eurc.toLowerCase() ? "EURC" : r.asset;
}

export interface PaidCallResult {
  status: "settled" | "declined" | "failed";
  httpStatus: number | null;
  data: unknown;
  reason?: string;
  payment: {
    rail: AgentRail | null;
    network: string | null;
    amount: string | null;
    asset: string | null;
    reference: string | null;
    explorerUrl: string | null;
    auditUrl: string | null;
  };
}

/**
 * Call an x402 resource as the agent. The 402 response lists the accepted rails; we pick the
 * preferred one (Hedera USDC or Arc Gateway nanopayment), enforce the limits on the exact amount,
 * sign, retry, and record the outcome.
 */
export async function payForResource(session: Session, p: { url: string; rail?: "arc-gateway" | "hedera"; method?: "GET" }): Promise<PaidCallResult> {
  const acct = requireAgentWallet(session);
  return serialised(session.address, async () => {
    const limits = await agentLimits(session);
    const preferred = p.rail ?? limits.preferredRail;
    const hederaSigner = hederaAgentSigner();
    let chosen: PaymentRequirements | null = null;
    let declined: string | null = null;

    const client = new x402Client((_v, accepts) => {
      const ok = accepts.filter((a) => (a.network.startsWith("hedera:") ? !!hederaSigner : a.network === x402Config.arcNetwork));
      const pick = ok.find((a) => railOf(a) === preferred) ?? ok.find((a) => railOf(a) === "arc-gateway") ?? ok[0];
      if (!pick) throw new Error(`No payment option this agent can use (offered: ${accepts.map((a) => a.network).join(", ")})`);
      return pick;
    });
    registerBatchScheme(client, { signer: acct, networks: [x402Config.arcNetwork], fallbackScheme: new ExactEvmScheme(acct) });
    if (hederaSigner) client.register(x402Config.hederaNetwork, new ExactHederaScheme(hederaSigner));
    // SDK spend controls are a backstop at the hard ceiling; the user's own limits are applied in
    // onBeforePaymentCreation below so a decline is recorded with a readable reason.
    const cap = HARD_MAX.perCallMax.toString();
    client.setSpendControls({
      maxAmountPerPayment: `$${formatUsdc(HARD_MAX.perCallMax)}`,
      // Testnet stablecoins are not in x402's default-asset table, so list them explicitly.
      allowedAssets: [
        { network: x402Config.arcNetwork, asset: ARC_TESTNET.usdc, maxAmountPerPayment: cap },
        { network: x402Config.arcNetwork, asset: ARC_TESTNET.eurc, maxAmountPerPayment: cap },
        { network: x402Config.hederaNetwork, asset: x402Config.hederaUsdcToken(), maxAmountPerPayment: cap },
      ],
    });
    client.onBeforePaymentCreation(async ({ selectedRequirements }) => {
      chosen = selectedRequirements;
      const gate = await checkSpend(session, BigInt(selectedRequirements.amount), "data");
      if (!gate.ok) {
        declined = gate.reason;
        return { abort: true, reason: gate.reason };
      }
    });

    const fetchWithPayment = wrapFetchWithPayment(fetch, client);
    let res: Response;
    try {
      res = await fetchWithPayment(p.url, { method: p.method ?? "GET", headers: { Accept: "application/json" } });
    } catch (err) {
      const req = chosen as PaymentRequirements | null;
      const sdkDeclined = /spendControls/.test((err as Error).message) ? "Price is above the agent's hard per-call ceiling." : null;
      const status = declined || sdkDeclined ? "declined" : "failed";
      const reason = declined ?? sdkDeclined ?? (err as Error).message.slice(0, 240);
      const rec = await recordSpend(
        session,
        { kind: "data", rail: req ? railOf(req) : (preferred as AgentRail), network: req?.network ?? "", resource: p.url, amountUnits: req ? BigInt(req.amount) : 0n, asset: req ? assetLabel(req) : "", status, reason, reference: "" },
        status === "declined" ? "declined" : "error",
      );
      return { status, httpStatus: null, data: null, reason, payment: { rail: rec.rail, network: rec.network || null, amount: req ? formatUsdc(BigInt(req.amount)) : null, asset: rec.asset || null, reference: null, explorerUrl: null, auditUrl: rec.hcsUrl } };
    }

    const body = await res.json().catch(() => null);
    const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    const settle = header ? (decodePaymentResponseHeader(header) as { success?: boolean; transaction?: string; network?: string }) : null;
    const req = chosen as PaymentRequirements | null;
    if (!res.ok || !settle?.success || !req) {
      const reason = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}${settle && !settle.success ? " (payment not settled)" : ""}`;
      const rec = await recordSpend(
        session,
        { kind: "data", rail: req ? railOf(req) : (preferred as AgentRail), network: req?.network ?? "", resource: p.url, amountUnits: 0n, asset: req ? assetLabel(req) : "", status: "failed", reason, reference: settle?.transaction ?? "" },
        "error",
      );
      return { status: "failed", httpStatus: res.status, data: body, reason, payment: { rail: rec.rail, network: rec.network || null, amount: null, asset: null, reference: settle?.transaction ?? null, explorerUrl: null, auditUrl: rec.hcsUrl } };
    }
    const reference = settle.transaction ?? "";
    const rail = railOf(req);
    const rec = await recordSpend(session, { kind: "data", rail, network: req.network, resource: p.url, amountUnits: BigInt(req.amount), asset: assetLabel(req), status: "settled", reason: "", reference }, "paid");
    return {
      status: "settled",
      httpStatus: res.status,
      data: body,
      payment: {
        rail,
        network: req.network,
        amount: formatUsdc(BigInt(req.amount)),
        asset: assetLabel(req),
        reference,
        explorerUrl: explorerFor(rail, reference),
        auditUrl: rec.hcsUrl,
      },
    };
  });
}

export function explorerFor(rail: AgentRail, reference: string): string | null {
  if (!reference) return null;
  if (rail === "hedera") return hashscanTx(reference);
  if (rail === "arc-onchain" && /^0x[0-9a-f]{64}$/i.test(reference)) return `https://explorer.testnet.arc.io/tx/${reference}`;
  return null; // Gateway nanopayments settle in batches; the reference is a Gateway transfer id.
}

// --------------------------------------------------------------- Gateway balance
export function gatewayClient(session: Session) {
  requireAgentWallet(session);
  return new GatewayClient({ chain: "arcTestnet", privateKey: process.env.DEMO_CUSTOMER_PRIVATE_KEY as `0x${string}`, rpcUrl: process.env.ARC_RPC_URL });
}

export async function agentBalances(session: Session) {
  const b = await gatewayClient(session).getBalances();
  return {
    walletUsdc: (b as { wallet?: { formatted?: string } }).wallet?.formatted ?? null,
    gatewayAvailable: (b as { gateway?: { formattedAvailable?: string } }).gateway?.formattedAvailable ?? null,
    hederaEnabled: hederaConfig.enabled(),
    hederaAccount: hederaConfig.agentAccountId() ?? null,
  };
}

export async function depositToGateway(session: Session, amount: string) {
  if (!/^\d+(\.\d{1,6})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 5) throw new HttpError(422, "Deposit between 0 and 5 test USDC.");
  const r = await gatewayClient(session).deposit(amount);
  return { depositTx: r.depositTxHash, approvalTx: r.approvalTxHash ?? null, amount: r.formattedAmount, explorerUrl: `https://explorer.testnet.arc.io/tx/${r.depositTxHash}` };
}

// --------------------------------------------------------------- cover approvals
// A cover purchase above the approval threshold needs a token that only the human's tap in the
// UI can mint (POST /api/agent/approve with the session cookie). The model cannot forge it.
const APPROVAL_TTL_SEC = 10 * 60;

function approvalMac(ownerTag: string, quoteId: string, exp: number) {
  return createHmac("sha256", Buffer.from(config.sessionSecret().replace(/^0x/, ""), "hex")).update(`agent-approve:${ownerTag}:${quoteId.toLowerCase()}:${exp}`).digest("base64url");
}

export function issueApproval(session: Session, quoteId: string) {
  const exp = Math.floor(Date.now() / 1000) + APPROVAL_TTL_SEC;
  return `${exp}.${approvalMac(ownerTagOf(session), quoteId, exp)}`;
}

export function verifyApproval(session: Session, quoteId: string, token: string | undefined | null) {
  if (!token) return false;
  const [expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!mac || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = approvalMac(ownerTagOf(session), quoteId, exp);
  return expected.length === mac.length && timingSafeEqual(Buffer.from(expected), Buffer.from(mac));
}
