import "server-only";
import { decodeEventLog, hexToString, type Hex, type Log } from "viem";
import { poolAbi } from "./abi/ShipmentDelayPool";
import { publicClient } from "./chain";
import { chainConfig, poolConfigs, type PoolConfig } from "./config";
import { blindTag, openJson, sealJson } from "./crypto";
import { store, type AppStore, type ChainEventKind, type PolicyRecord, type PolicyPrivate, type QuotePrivate } from "./store";

// Arc is authoritative for purchased terms, reserves and payments. This job mirrors contract
// events into Arkiv. Idempotency key: `${chainId}:${txHash}:${logIndex}` (checked before every
// write). Restart recovery: resume from the highest block already mirrored in Arkiv (re-scanning
// that block is safe because writes are idempotent). Each run is bounded so it fits a cron call.

const KINDS: ChainEventKind[] = [
  "PolicyPurchased",
  "EvidenceAccepted",
  "PolicyPaidOut",
  "PolicyClosedNoPayout",
  "PolicyResolvedByReview",
  "DuplicateReportIgnored",
  "ReserveReleased",
  "PoolFunded",
];

export interface SyncResult {
  fromBlock: string;
  toBlock: string;
  scanned: number;
  written: number;
  skippedExisting: number;
  failed: { eventId: string; error: string }[];
  done: boolean;
}

const MAX_RANGE = 9_000n;

export interface DecodedPoolLog {
  kind: ChainEventKind;
  args: Record<string, unknown>;
  blockNumber: bigint;
  txHash: Hex;
  logIndex: number;
}

export function decodePoolLogs(logs: Log[]): DecodedPoolLog[] {
  const out: DecodedPoolLog[] = [];
  for (const log of logs) {
    try {
      const d = decodeEventLog({ abi: poolAbi, data: log.data, topics: log.topics });
      if (!KINDS.includes(d.eventName as ChainEventKind)) continue;
      out.push({
        kind: d.eventName as ChainEventKind,
        args: d.args as unknown as Record<string, unknown>,
        blockNumber: log.blockNumber!,
        txHash: log.transactionHash!,
        logIndex: log.logIndex!,
      });
    } catch {
      // not one of ours
    }
  }
  return out;
}

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

/** Apply one decoded event to Arkiv. Safe to call repeatedly for the same event. */
export async function applyEvent(s: AppStore, chainId: number, pool: string, e: DecodedPoolLog): Promise<"written" | "exists"> {
  const eventId = `${chainId}:${e.txHash}:${e.logIndex}`;
  const policyId = (e.args.policyId as string | undefined) ?? "";
  const amount = (e.args.payout ?? e.args.amount ?? e.args.premium ?? 0n) as bigint;

  // Policy view first, event record last: if the policy update fails we retry the whole event.
  if (e.kind === "PolicyPurchased") await mirrorPurchase(s, chainId, pool, e);
  if (["PolicyPaidOut", "PolicyClosedNoPayout", "PolicyResolvedByReview", "EvidenceAccepted"].includes(e.kind)) {
    await mirrorSettlement(s, e);
  }

  const { created } = await s.putChainEvent({
    eventId,
    kind: e.kind,
    policyId,
    chainId,
    blockNumber: e.blockNumber,
    txHash: e.txHash,
    logIndex: e.logIndex,
    amountUnits: amount,
    data: json(e.args).slice(0, 4000),
  });
  // After the event record so it is covered too. Runs on every retry; re-runs resolve to the same expiry.
  if (e.kind === "PolicyPurchased" || SETTLED_KINDS.includes(e.kind)) await retainTrail(s, e);
  return created ? "written" : "exists";
}

const SETTLED_KINDS: ChainEventKind[] = ["PolicyPaidOut", "PolicyClosedNoPayout", "PolicyResolvedByReview"];

const shipmentIdOf = (p: PolicyRecord) => openJson<PolicyPrivate>(p.sealed, `policy:${p.policyId}`).shipmentId;

/** Purchase: give the draft quote and shipment the policy's lifetime. Settlement: start the retention window. */
async function retainTrail(s: AppStore, e: DecodedPoolLog) {
  const p = await s.getPolicy(e.args.policyId as Hex);
  if (!p) return;
  const trail = { policyId: p.policyId, shipmentId: shipmentIdOf(p) };
  if (e.kind === "PolicyPurchased") {
    if (p.status === "active") await s.retainPolicyTrail(trail);
    return;
  }
  const block = await publicClient().getBlock({ blockNumber: e.blockNumber });
  await s.retainPolicyTrail(trail, Number(block.timestamp));
}

/** Renew the whole record trail of open policies before it expires. */
async function renewOpenPolicies(s: AppStore) {
  for (const p of await s.listActivePoliciesExpiring(14 * 86_400)) {
    await s.retainPolicyTrail({ policyId: p.policyId, shipmentId: shipmentIdOf(p) });
  }
}

async function mirrorPurchase(s: AppStore, chainId: number, pool: string, e: DecodedPoolLog) {
  const a = e.args as {
    policyId: Hex;
    beneficiary: Hex;
    quoteId: Hex;
    vesselImo: number;
    destinationLocode: Hex;
    agreedArrivalDeadline: bigint;
    delayThreshold: number;
    premium: bigint;
    payout: bigint;
  };
  const existing = await s.getPolicy(a.policyId);
  if (existing) return;
  // Link to the offchain quote (written by the app) to recover the shipment relationship.
  const quote = await s.getQuote(a.quoteId);
  let priv: PolicyPrivate = { shipmentId: "", beneficiary: a.beneficiary, vesselName: "", voyageRef: "", terms: "" };
  let productId = "unknown";
  let shipmentTag = "";
  if (quote) {
    const q = openJson<QuotePrivate & { shipmentId: string; vesselName: string; voyageRef: string }>(quote.sealed, `quote:${quote.quoteId}`);
    priv = { shipmentId: q.shipmentId, beneficiary: a.beneficiary, vesselName: q.vesselName, voyageRef: q.voyageRef, terms: q.terms };
    productId = quote.productId;
    shipmentTag = quote.shipmentTag;
    const shipment = q.shipmentId ? await s.getShipment(q.shipmentId) : null;
    if (shipment && shipment.status !== "insured") await s.updateShipment(shipment, { status: "insured" });
  }
  const rec: PolicyRecord = {
    policyId: a.policyId,
    status: "active",
    ownerTag: blindTag("owner", a.beneficiary),
    shipmentTag,
    productId,
    vesselImo: Number(a.vesselImo),
    portLocode: hexToString(a.destinationLocode, { size: 32 }).replace(/\0+$/, ""),
    deadlineSec: Number(a.agreedArrivalDeadline),
    thresholdSec: Number(a.delayThreshold),
    premiumUnits: a.premium,
    payoutUnits: a.payout,
    chainId,
    pool,
    purchaseTx: e.txHash,
    settlementTx: "",
    recordedArrivalSec: 0,
    lastEvaluation: "",
    sealed: sealJson(priv, `policy:${a.policyId}`),
  };
  await s.upsertPolicy(rec);
}

async function mirrorSettlement(s: AppStore, e: DecodedPoolLog) {
  const policyId = e.args.policyId as Hex;
  const p = await s.getPolicy(policyId);
  if (!p) throw new Error(`Policy ${policyId} not mirrored yet`); // retried on next run
  const next = { ...p };
  if (e.kind === "EvidenceAccepted") next.recordedArrivalSec = Number(e.args.arrivalTime as bigint);
  if (e.kind === "PolicyPaidOut") Object.assign(next, { status: "paid_out", settlementTx: e.txHash });
  if (e.kind === "PolicyClosedNoPayout") Object.assign(next, { status: "closed_no_payout", settlementTx: e.txHash });
  if (e.kind === "PolicyResolvedByReview") Object.assign(next, { status: "resolved_by_review", settlementTx: e.txHash });
  if (JSON.stringify([next.status, next.settlementTx, next.recordedArrivalSec]) !== JSON.stringify([p.status, p.settlementTx, p.recordedArrivalSec])) {
    await s.upsertPolicy(next);
  }
}

export async function runSync(opts: { maxBlocks?: bigint; retries?: number } = {}): Promise<SyncResult & { pools: (SyncResult & { currency: string; pool: string })[] }> {
  const c = chainConfig();
  const s = store();
  const head = await publicClient().getBlockNumber();
  const pools = [];
  for (const [i, p] of poolConfigs().entries()) {
    // Chain events carry no pool field, so "latest mirrored event" is only a safe resume point for
    // the primary pool (the only one that existed before multi-pool support).
    pools.push({ currency: p.currency, pool: p.pool, ...(await syncPool(s, c.id, p, head, i === 0, opts)) });
  }
  if (pools.every((r) => r.failed.length === 0)) await renewOpenPolicies(s);
  const primary = pools[0];
  return {
    fromBlock: primary?.fromBlock ?? "0",
    toBlock: primary?.toBlock ?? head.toString(),
    scanned: pools.reduce((a, r) => a + r.scanned, 0),
    written: pools.reduce((a, r) => a + r.written, 0),
    skippedExisting: pools.reduce((a, r) => a + r.skippedExisting, 0),
    failed: pools.flatMap((r) => r.failed),
    done: pools.every((r) => r.done),
    pools,
  };
}

async function syncPool(s: AppStore, chainId: number, p: PoolConfig, head: bigint, useEventResume: boolean, opts: { maxBlocks?: bigint; retries?: number }) {
  const [cursor, lastEvent] = await Promise.all([s.getSyncCursor(chainId, p.pool), useEventResume ? s.latestChainEventBlock(chainId) : Promise.resolve(null)]);
  // Resume from the furthest point known to be fully mirrored (inclusive re-scan is idempotent).
  const candidates = [p.deployBlock, cursor, lastEvent].filter((x): x is bigint => x !== null);
  const from = candidates.reduce((a, b) => (a > b ? a : b));
  const to = head - from > (opts.maxBlocks ?? MAX_RANGE) ? from + (opts.maxBlocks ?? MAX_RANGE) : head;

  const logs = await publicClient().getLogs({ address: p.pool, fromBlock: from, toBlock: to });
  const decoded = decodePoolLogs(logs as Log[]);
  const res = await syncDecoded(s, chainId, p.pool, decoded, from, to, to === head, opts.retries ?? 2);
  if (res.failed.length === 0 && to > from) await s.setSyncCursor(chainId, p.pool, to);
  return res;
}

/** Exposed for tests: apply events in order with bounded retries; stops at first hard failure. */
export async function syncDecoded(
  s: AppStore,
  chainId: number,
  pool: string,
  decoded: DecodedPoolLog[],
  from: bigint,
  to: bigint,
  reachedHead: boolean,
  retries: number,
): Promise<SyncResult> {
  const res: SyncResult = { fromBlock: from.toString(), toBlock: to.toString(), scanned: decoded.length, written: 0, skippedExisting: 0, failed: [], done: reachedHead };
  for (const e of decoded) {
    const eventId = `${chainId}:${e.txHash}:${e.logIndex}`;
    let attempt = 0;
    for (;;) {
      try {
        const r = await applyEvent(s, chainId, pool, e);
        if (r === "written") res.written++;
        else res.skippedExisting++;
        break;
      } catch (err) {
        if (attempt++ < retries) continue;
        res.failed.push({ eventId, error: (err as Error).message.slice(0, 200) });
        res.done = false;
        // Preserve ordering: later events (e.g. a payout) must not be mirrored before this one.
        return res;
      }
    }
  }
  return res;
}
