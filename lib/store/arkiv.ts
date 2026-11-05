import "server-only";
import { createPublicClient, createWalletClient, ExpirationTime, NoEntityFoundError } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, i32, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { desc, eq, lt, and } from "@arkiv-network/sdk/query";
import { http, hexToBytes, type Hex } from "viem";
import { account, config } from "../config";
import type {
  AppStore,
  ChainEventRecord,
  EvaluationRecord,
  ObservationRecord,
  PolicyRecord,
  QuoteRecord,
  ShipmentRecord,
} from "./types";

// ---------------------------------------------------------------- schemas
// Named schemas (tag `arkiv.schema`). Tags only separate namespaces; authenticity comes from
// filtering every read by the authorised writer address (`createdBy`).
export const SCHEMA_NAMES = {
  shipment: "skjol.v1.shipment",
  quote: "skjol.v1.quote",
  policy: "skjol.v1.policy",
  observation: "skjol.v1.observation",
  evaluation: "skjol.v1.evaluation",
  chainEvent: "skjol.v1.chain-event",
  syncCursor: "skjol.v1.sync-cursor",
} as const;

export const SyncCursors = defineSchema(SCHEMA_NAMES.syncCursor, {
  cursorId: str().indexed(),
  chainId: u64().indexed(),
  block: u64(),
});

export const Shipments = defineSchema(SCHEMA_NAMES.shipment, {
  shipmentId: str().indexed(),
  ownerTag: str().indexed(),
  status: str().indexed(),
  dataLabel: str().indexed(),
  createdAtSec: u64().indexed(),
  sealed: bytes(),
});

export const Quotes = defineSchema(SCHEMA_NAMES.quote, {
  quoteId: str().indexed(),
  shipmentTag: str().indexed(),
  policyId: str().indexed(),
  productId: str().indexed(),
  premiumUnits: u256(),
  payoutUnits: u256(),
  deadlineSec: u64().indexed(),
  thresholdSec: u64(),
  quoteExpirySec: u64().indexed(),
  termsHash: str(),
  chainId: u64().indexed(),
  pool: addr(),
  sealed: bytes(),
});

export const Policies = defineSchema(SCHEMA_NAMES.policy, {
  policyId: str().indexed(),
  status: str().indexed(),
  ownerTag: str().indexed(),
  shipmentTag: str().indexed(),
  productId: str().indexed(),
  vesselImo: u64().indexed(),
  portLocode: str().indexed(),
  deadlineSec: u64().indexed(),
  thresholdSec: u64(),
  premiumUnits: u256(),
  payoutUnits: u256(),
  chainId: u64().indexed(),
  pool: addr().indexed(),
  purchaseTx: str(),
  settlementTx: str(),
  recordedArrivalSec: u64(),
  lastEvaluation: str().indexed(),
  sealed: bytes(),
});

export const Observations = defineSchema(SCHEMA_NAMES.observation, {
  observationId: str().indexed(),
  policyId: str().indexed(),
  digest: str().indexed(),
  source: str().indexed(),
  origin: str().indexed(),
  vesselImo: u64().indexed(),
  portLocode: str().indexed(),
  eventTimeSec: u64().indexed(),
  retrievedAtSec: u64().indexed(),
  sourceStatus: str(),
  record: bytes(),
});

export const Evaluations = defineSchema(SCHEMA_NAMES.evaluation, {
  evaluationId: str().indexed(),
  policyId: str().indexed(),
  status: str().indexed(),
  runner: str().indexed(),
  clockSec: u64().indexed(),
  clockIsDemo: str().indexed(),
  observationId: str(),
  reportTx: str(),
  sealed: bytes(),
});

export const ChainEvents = defineSchema(SCHEMA_NAMES.chainEvent, {
  eventId: str().indexed(),
  kind: str().indexed(),
  policyId: str().indexed(),
  chainId: u64().indexed(),
  blockNumber: u64().indexed(),
  txHash: str().indexed(),
  logIndex: i32(),
  amountUnits: u256(),
  data: bytes(),
});

// ---------------------------------------------------------------- clients
const chain = () => rabdi({ accessKey: config.arkivAccessKey() });

let _pub: ReturnType<typeof createPublicClient> | null = null;
function pub() {
  _pub ??= createPublicClient({ chain: chain(), transport: http() });
  return _pub;
}

type Writer = "app" | "observer" | "sync";
const WRITER_ENV: Record<Writer, string> = {
  app: "ARKIV_APP_PRIVATE_KEY",
  observer: "ARKIV_OBSERVER_PRIVATE_KEY",
  sync: "ARKIV_SYNC_PRIVATE_KEY",
};
const _wallets: Partial<Record<Writer, ReturnType<typeof createWalletClient>>> = {};
function wallet(w: Writer) {
  _wallets[w] ??= createWalletClient({ chain: chain(), transport: http(), account: account(WRITER_ENV[w]) });
  return _wallets[w]!;
}

// Writes from one wallet must not race: concurrent sends pick the same nonce and the node rejects
// one as "replacement transaction underpriced". Serialise per writer within this process and retry
// nonce clashes (which can still happen across separate serverless instances) with backoff.
const queues: Partial<Record<Writer, Promise<unknown>>> = {};
const NONCE_CLASH = /replacement transaction underpriced|nonce too low|already known|nonce/i;

async function write<T>(w: Writer, fn: (client: ReturnType<typeof wallet>) => Promise<T>): Promise<T> {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn(wallet(w));
      } catch (err) {
        const msg = `${(err as Error).message} ${String((err as { cause?: unknown }).cause ?? "")}`;
        if (attempt >= 4 || !NONCE_CLASH.test(msg)) throw err;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 300));
      }
    }
  };
  const prev = queues[w] ?? Promise.resolve();
  const next = prev.catch(() => {}).then(run);
  queues[w] = next.catch(() => {});
  return next;
}

export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network";

/** Current Arkiv block, for turning `$expiresAt` blocks into approximate dates (2 s blocks). */
export async function arkivCurrentBlock(): Promise<bigint | null> {
  try {
    return (await pub().getBlockTiming()).currentBlock;
  } catch {
    return null;
  }
}

export function writerAddresses(): Record<Writer, Hex> {
  return {
    app: account(WRITER_ENV.app).address,
    observer: account(WRITER_ENV.observer).address,
    sync: account(WRITER_ENV.sync).address,
  };
}

// Expiration policy (see arkiv/schema.md): drafts 30 days, policy-linked records 120 days,
// renewed by the sync job while a policy is unresolved or recently settled.
const DRAFT_TTL = () => ExpirationTime.fromDays(30);
const POLICY_TTL = () => ExpirationTime.fromDays(120);

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (h: Hex) => new TextDecoder().decode(hexToBytes(h));
const num = (v: { value: bigint }) => Number(v.value);

// --------------------------------------------------------------- mappers
/* eslint-disable @typescript-eslint/no-explicit-any */
const toShipment = (e: any): ShipmentRecord => ({
  key: e.$key,
  shipmentId: e.shipmentId.value,
  ownerTag: e.ownerTag.value,
  status: e.status.value,
  dataLabel: e.dataLabel.value,
  createdAtSec: num(e.createdAtSec),
  sealed: hexToBytes(e.sealed.value),
});
const toQuote = (e: any): QuoteRecord => ({
  key: e.$key,
  quoteId: e.quoteId.value,
  shipmentTag: e.shipmentTag.value,
  policyId: e.policyId.value,
  productId: e.productId.value,
  premiumUnits: e.premiumUnits.value,
  payoutUnits: e.payoutUnits.value,
  deadlineSec: num(e.deadlineSec),
  thresholdSec: num(e.thresholdSec),
  quoteExpirySec: num(e.quoteExpirySec),
  termsHash: e.termsHash.value,
  chainId: num(e.chainId),
  pool: e.pool.value,
  sealed: hexToBytes(e.sealed.value),
});
const toPolicy = (e: any): PolicyRecord => ({
  key: e.$key,
  policyId: e.policyId.value,
  status: e.status.value,
  ownerTag: e.ownerTag.value,
  shipmentTag: e.shipmentTag.value,
  productId: e.productId.value,
  vesselImo: num(e.vesselImo),
  portLocode: e.portLocode.value,
  deadlineSec: num(e.deadlineSec),
  thresholdSec: num(e.thresholdSec),
  premiumUnits: e.premiumUnits.value,
  payoutUnits: e.payoutUnits.value,
  chainId: num(e.chainId),
  pool: e.pool.value,
  purchaseTx: e.purchaseTx.value,
  settlementTx: e.settlementTx.value,
  recordedArrivalSec: num(e.recordedArrivalSec),
  lastEvaluation: e.lastEvaluation.value,
  expiresAtBlock: e.$expiresAt,
  sealed: hexToBytes(e.sealed.value),
});
const toObservation = (e: any): ObservationRecord => ({
  key: e.$key,
  observationId: e.observationId.value,
  policyId: e.policyId.value,
  digest: e.digest.value,
  source: e.source.value,
  origin: e.origin.value,
  vesselImo: num(e.vesselImo),
  portLocode: e.portLocode.value,
  eventTimeSec: num(e.eventTimeSec),
  retrievedAtSec: num(e.retrievedAtSec),
  sourceStatus: e.sourceStatus.value,
  record: dec(e.record.value),
});
const toEvaluation = (e: any): EvaluationRecord => ({
  key: e.$key,
  evaluationId: e.evaluationId.value,
  policyId: e.policyId.value,
  status: e.status.value,
  runner: e.runner.value,
  clockSec: num(e.clockSec),
  clockIsDemo: e.clockIsDemo.value === "true",
  observationId: e.observationId.value,
  reportTx: e.reportTx.value,
  sealed: hexToBytes(e.sealed.value),
});
const toChainEvent = (e: any): ChainEventRecord => ({
  key: e.$key,
  eventId: e.eventId.value,
  kind: e.kind.value,
  policyId: e.policyId.value,
  chainId: num(e.chainId),
  blockNumber: e.blockNumber.value,
  txHash: e.txHash.value,
  logIndex: e.logIndex.value,
  amountUnits: e.amountUnits.value,
  data: dec(e.data.value),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------------ store
export class ArkivStore implements AppStore {
  readonly backend = "arkiv" as const;
  private readonly w = writerAddresses();

  // shipments ----------------------------------------------------------
  async putShipment(r: ShipmentRecord) {
    const { entityKey } = await write("app", (c) => c.createEntity(
      Shipments,
      {
        shipmentId: r.shipmentId,
        ownerTag: r.ownerTag,
        status: r.status,
        dataLabel: r.dataLabel,
        createdAtSec: u64(BigInt(r.createdAtSec)),
        sealed: r.sealed,
      },
      { expiration: DRAFT_TTL() },
    ));
    return { ...r, key: entityKey };
  }

  async getShipment(shipmentId: string) {
    const { entities } = await pub()
      .select()
      .from(Shipments)
      .createdBy(this.w.app)
      .where(eq("shipmentId", shipmentId))
      .limit(1)
      .fetch();
    return entities[0] ? toShipment(entities[0]) : null;
  }

  async updateShipment(r: ShipmentRecord, set: Partial<Pick<ShipmentRecord, "status" | "sealed">>) {
    if (!r.key) throw new Error("Shipment has no entity key");
    await write("app", (c) => c.patchEntity(Shipments, r.key as Hex, { set }));
    if (set.status === "insured") {
      await write("app", (c) => c.extendEntity({ entityKey: r.key as Hex, expiration: POLICY_TTL() }));
    }
  }

  async listShipmentsByOwner(ownerTag: string) {
    const { entities } = await pub()
      .select()
      .from(Shipments)
      .createdBy(this.w.app)
      .where(eq("ownerTag", ownerTag))
      .orderBy(desc("createdAtSec"))
      .limit(50)
      .fetch();
    return entities.map(toShipment);
  }

  // quotes -------------------------------------------------------------
  async putQuote(r: QuoteRecord) {
    const { entityKey } = await write("app", (c) => c.createEntity(
      Quotes,
      {
        quoteId: r.quoteId,
        shipmentTag: r.shipmentTag,
        policyId: r.policyId,
        productId: r.productId,
        premiumUnits: r.premiumUnits,
        payoutUnits: r.payoutUnits,
        deadlineSec: u64(BigInt(r.deadlineSec)),
        thresholdSec: u64(BigInt(r.thresholdSec)),
        quoteExpirySec: u64(BigInt(r.quoteExpirySec)),
        termsHash: r.termsHash,
        chainId: u64(BigInt(r.chainId)),
        pool: addr(r.pool.toLowerCase()),
        sealed: r.sealed,
      },
      { expiration: DRAFT_TTL() },
    ));
    return { ...r, key: entityKey };
  }

  async getQuote(quoteId: string) {
    const { entities } = await pub().select().from(Quotes).createdBy(this.w.app).where(eq("quoteId", quoteId)).limit(1).fetch();
    return entities[0] ? toQuote(entities[0]) : null;
  }

  async getQuoteByPolicy(policyId: string) {
    const { entities } = await pub()
      .select()
      .from(Quotes)
      .createdBy(this.w.app)
      .where(eq("policyId", policyId))
      .orderBy(desc("quoteExpirySec"))
      .limit(1)
      .fetch();
    return entities[0] ? toQuote(entities[0]) : null;
  }

  // policies -----------------------------------------------------------
  async getPolicy(policyId: string) {
    const { entities } = await pub().select().from(Policies).createdBy(this.w.sync).where(eq("policyId", policyId)).limit(1).fetch();
    return entities[0] ? toPolicy(entities[0]) : null;
  }

  async upsertPolicy(r: PolicyRecord) {
    const values = {
      policyId: r.policyId,
      status: r.status,
      ownerTag: r.ownerTag,
      shipmentTag: r.shipmentTag,
      productId: r.productId,
      vesselImo: u64(BigInt(r.vesselImo)),
      portLocode: r.portLocode,
      deadlineSec: u64(BigInt(r.deadlineSec)),
      thresholdSec: u64(BigInt(r.thresholdSec)),
      premiumUnits: r.premiumUnits,
      payoutUnits: r.payoutUnits,
      chainId: u64(BigInt(r.chainId)),
      pool: addr(r.pool.toLowerCase()),
      purchaseTx: r.purchaseTx,
      settlementTx: r.settlementTx,
      recordedArrivalSec: u64(BigInt(r.recordedArrivalSec)),
      lastEvaluation: r.lastEvaluation,
      sealed: r.sealed,
    };
    const existing = await this.getPolicy(r.policyId);
    if (existing?.key) {
      await write("sync", (c) => c.patchEntity(Policies, existing.key as Hex, { set: values }));
      return { ...r, key: existing.key };
    }
    const { entityKey } = await write("sync", (c) => c.createEntity(Policies, values, { expiration: POLICY_TTL() }));
    return { ...r, key: entityKey };
  }

  async listPolicies(filter: { ownerTag?: string; limit?: number }) {
    let q = pub().select().from(Policies).createdBy(this.w.sync);
    if (filter.ownerTag) q = q.where(eq("ownerTag", filter.ownerTag));
    const { entities } = await q.orderBy(desc("deadlineSec")).limit(filter.limit ?? 50).fetch();
    return entities.map(toPolicy);
  }

  // observations ---------------------------------------------------------
  async putObservation(r: ObservationRecord) {
    const { entities } = await pub()
      .select()
      .from(Observations)
      .createdBy(this.w.observer)
      .where(eq("observationId", r.observationId))
      .limit(1)
      .fetch();
    if (entities[0]) return { record: toObservation(entities[0]), created: false };
    const { entityKey } = await write("observer", (c) => c.createEntity(
      Observations,
      {
        observationId: r.observationId,
        policyId: r.policyId,
        digest: r.digest,
        source: r.source,
        origin: r.origin,
        vesselImo: u64(BigInt(r.vesselImo)),
        portLocode: r.portLocode,
        eventTimeSec: u64(BigInt(r.eventTimeSec)),
        retrievedAtSec: u64(BigInt(r.retrievedAtSec)),
        sourceStatus: r.sourceStatus.slice(0, 120),
        record: enc(r.record),
      },
      { expiration: POLICY_TTL() },
    ));
    return { record: { ...r, key: entityKey }, created: true };
  }

  async listObservations(policyId: string) {
    const { entities } = await pub()
      .select()
      .from(Observations)
      .createdBy(this.w.observer)
      .where(eq("policyId", policyId))
      .orderBy(desc("retrievedAtSec"))
      .limit(100)
      .fetch();
    return entities.map(toObservation);
  }

  async listSyntheticObservations(vesselImo: number, portLocode: string) {
    const { entities } = await pub()
      .select()
      .from(Observations)
      .createdBy(this.w.observer)
      .where(and(eq("origin", "synthetic"), eq("vesselImo", u64(BigInt(vesselImo))), eq("portLocode", portLocode)))
      .orderBy(desc("retrievedAtSec"))
      .limit(20)
      .fetch();
    return entities.map(toObservation);
  }

  // evaluations ----------------------------------------------------------
  async putEvaluation(r: EvaluationRecord) {
    const { entityKey } = await write("observer", (c) => c.createEntity(
      Evaluations,
      {
        evaluationId: r.evaluationId,
        policyId: r.policyId,
        status: r.status,
        runner: r.runner,
        clockSec: u64(BigInt(r.clockSec)),
        clockIsDemo: String(r.clockIsDemo),
        observationId: r.observationId,
        reportTx: r.reportTx,
        sealed: r.sealed,
      },
      { expiration: POLICY_TTL() },
    ));
    return { ...r, key: entityKey };
  }

  async listEvaluations(policyId: string) {
    const { entities } = await pub()
      .select()
      .from(Evaluations)
      .createdBy(this.w.observer)
      .where(eq("policyId", policyId))
      .orderBy(desc("clockSec"))
      .limit(100)
      .fetch();
    return entities.map(toEvaluation);
  }

  // chain events (idempotent by chainId:txHash:logIndex) -------------------
  async hasChainEvent(eventId: string) {
    const { entities } = await pub()
      .select({ $key: true })
      .from(ChainEvents)
      .createdBy(this.w.sync)
      .where(eq("eventId", eventId))
      .limit(1)
      .fetch();
    return entities.length > 0;
  }

  async putChainEvent(r: ChainEventRecord) {
    const { entities } = await pub().select().from(ChainEvents).createdBy(this.w.sync).where(eq("eventId", r.eventId)).limit(1).fetch();
    if (entities[0]) return { record: toChainEvent(entities[0]), created: false };
    const { entityKey } = await write("sync", (c) => c.createEntity(
      ChainEvents,
      {
        eventId: r.eventId,
        kind: r.kind,
        policyId: r.policyId,
        chainId: u64(BigInt(r.chainId)),
        blockNumber: u64(r.blockNumber),
        txHash: r.txHash,
        logIndex: i32(r.logIndex),
        amountUnits: r.amountUnits,
        data: enc(r.data),
      },
      { expiration: POLICY_TTL() },
    ));
    return { record: { ...r, key: entityKey }, created: true };
  }

  async listChainEvents(filter: { policyId?: string; limit?: number }) {
    let q = pub().select().from(ChainEvents).createdBy(this.w.sync);
    if (filter.policyId) q = q.where(eq("policyId", filter.policyId));
    const { entities } = await q.orderBy(desc("blockNumber")).limit(filter.limit ?? 100).fetch();
    return entities.map(toChainEvent);
  }

  async latestChainEventBlock(chainId: number) {
    const { entities } = await pub()
      .select({ blockNumber: true })
      .from(ChainEvents)
      .createdBy(this.w.sync)
      .where(eq("chainId", u64(BigInt(chainId))))
      .orderBy(desc("blockNumber"))
      .limit(1)
      .fetch();
    return entities[0] ? entities[0].blockNumber.value : null;
  }

  // sync cursor ------------------------------------------------------------
  async getSyncCursor(chainId: number, pool: string) {
    const { entities } = await pub()
      .select()
      .from(SyncCursors)
      .createdBy(this.w.sync)
      .where(eq("cursorId", `${chainId}:${pool.toLowerCase()}`))
      .limit(1)
      .fetch();
    return entities[0] ? entities[0].block.value : null;
  }

  async setSyncCursor(chainId: number, pool: string, block: bigint) {
    const cursorId = `${chainId}:${pool.toLowerCase()}`;
    const { entities } = await pub().select({ $key: true }).from(SyncCursors).createdBy(this.w.sync).where(eq("cursorId", cursorId)).limit(1).fetch();
    if (entities[0]) {
      await write("sync", (c) => c.patchEntity(SyncCursors, entities[0].$key, { set: { block: u64(block) } }));
      await write("sync", (c) => c.extendEntity({ entityKey: entities[0].$key, expiration: POLICY_TTL() }));
    } else {
      await write("sync", (c) => c.createEntity(SyncCursors, { cursorId, chainId: u64(BigInt(chainId)), block: u64(block) }, { expiration: POLICY_TTL() }));
    }
  }

  // renewal ------------------------------------------------------------------
  /** Extend unresolved policies (and recently settled ones under review) that expire soon. */
  async extendExpiring(withinBlocks: bigint) {
    const { currentBlock } = await pub().getBlockTiming();
    const { entities } = await pub()
      .select({ $key: true, $expiresAt: true, status: true })
      .from(Policies)
      .createdBy(this.w.sync)
      .where(and(eq("status", "active"), lt("$expiresAt", u64(currentBlock + withinBlocks))))
      .limit(100)
      .fetch();
    for (const e of entities) {
      try {
        await write("sync", (c) => c.extendEntity({ entityKey: e.$key, expiration: POLICY_TTL() }));
      } catch (err) {
        if (!(err instanceof NoEntityFoundError)) throw err;
      }
    }
    return entities.length;
  }
}
