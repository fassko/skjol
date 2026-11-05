import "server-only";
import type { Hex } from "viem";
import { publicClient, readPolicy, txLink } from "./chain";
import { chainConfig, poolByAddress } from "./config";
import { blindTag, openJson } from "./crypto";
import { getPolicyView } from "./insurance";
import type { Session } from "./session";
import { store, type EvaluationPrivate, type ShipmentPrivate } from "./store";
import { ARKIV_EXPLORER, SCHEMA_NAMES, arkivCurrentBlock, writerAddresses } from "./store/arkiv";
import { ARKIV_RABDI } from "./config";
import { SUPPORTED_PORTS, formatUsdc } from "../shared/products";

export async function listMyShipments(session: Session) {
  const recs = await store().listShipmentsByOwner(blindTag("owner", session.address));
  return recs.map((r) => {
    let fileName = "";
    let vessel = "";
    try {
      const p = openJson<ShipmentPrivate>(r.sealed, `shipment:${r.shipmentId}`);
      fileName = p.fileName;
      vessel = (p.confirmed as { vesselName?: string } | null)?.vesselName ?? "";
    } catch {}
    return { shipmentId: r.shipmentId, status: r.status, dataLabel: r.dataLabel, createdAtSec: r.createdAtSec, fileName, vessel, arkivKey: r.key };
  });
}

export async function policySummaries(session: Session) {
  const recs = await store().listPolicies({ ownerTag: blindTag("owner", session.address) });
  const { safeOpen } = await import("./insurance");
  return recs.map((p) => summary(p, safeOpen(p)));
}

function summary(p: Awaited<ReturnType<ReturnType<typeof store>["getPolicy"]>> & object, priv: { vesselName?: string; voyageRef?: string } | null) {
  return {
    policyId: p.policyId,
    status: p.status,
    productId: p.productId,
    vesselName: priv?.vesselName ?? null,
    voyageRef: priv?.voyageRef ?? null,
    vesselImo: p.vesselImo,
    port: SUPPORTED_PORTS[p.portLocode] ?? p.portLocode,
    portLocode: p.portLocode,
    deadline: new Date(p.deadlineSec * 1000).toISOString(),
    thresholdHours: p.thresholdSec / 3600,
    premium: formatUsdc(p.premiumUnits),
    payout: formatUsdc(p.payoutUnits),
    currency: poolByAddress(p.pool)?.currency ?? "USDC",
    pool: p.pool,
    lastEvaluation: p.lastEvaluation,
    purchaseTx: p.purchaseTx,
    purchaseTxUrl: txLink(p.purchaseTx),
    settlementTx: p.settlementTx || null,
    settlementTxUrl: p.settlementTx ? txLink(p.settlementTx) : null,
    recordedArrival: p.recordedArrivalSec ? new Date(p.recordedArrivalSec * 1000).toISOString() : null,
    arkivKey: p.key ?? null,
  };
}

export async function policyDetail(policyId: Hex, session: Session | null) {
  const view = await getPolicyView(policyId, session);
  if (!view) return null;
  const s = store();
  const [observations, evaluations, events, onchain] = await Promise.all([
    s.listObservations(policyId),
    s.listEvaluations(policyId),
    s.listChainEvents({ policyId }),
    readPolicy(policyId, view.policy.pool as Hex).catch(() => null),
  ]);
  const c = chainConfig();
  const arkiv = await arkivRecords(
    policyId,
    view,
    observations.map((o) => ({ kind: "observation", arkivKey: o.key, observationId: o.observationId, retrievedAtSec: o.retrievedAtSec })),
    evaluations.map((e) => ({ kind: "evaluation", arkivKey: e.key, evaluationId: e.evaluationId, status: e.status })),
    events.map((e) => ({ kind: e.kind, key: e.key, eventId: e.eventId })),
  );
  const blockTimes = new Map<bigint, string>();
  await Promise.all(
    [...new Set(events.map((e) => e.blockNumber))].map(async (b) => {
      const blk = await publicClient().getBlock({ blockNumber: b }).catch(() => null);
      if (blk) blockTimes.set(b, new Date(Number(blk.timestamp) * 1000).toISOString());
    }),
  );
  return {
    ...summary(view.policy, view.priv),
    owned: view.owned,
    arkiv,
    terms: view.priv?.terms ?? null,
    chain: { id: c.id, name: c.name, pool: view.policy.pool || c.pool, explorer: c.explorer },
    onchain: onchain
      ? {
          status: onchain.statusName,
          agreedArrivalDeadline: new Date(Number(onchain.agreedArrivalDeadline) * 1000).toISOString(),
          earliestArrival: new Date(Number(onchain.earliestArrival) * 1000).toISOString(),
          recordedArrival: onchain.recordedArrival ? new Date(Number(onchain.recordedArrival) * 1000).toISOString() : null,
          settlementEvidence: onchain.settlementEvidence,
          termsHash: onchain.termsHash,
        }
      : null,
    observations: observations.map((o) => ({
      observationId: o.observationId,
      origin: o.origin,
      source: o.source,
      digest: o.digest,
      sourceStatus: o.sourceStatus,
      eventTime: o.eventTimeSec ? new Date(o.eventTimeSec * 1000).toISOString() : null,
      retrievedAt: new Date(o.retrievedAtSec * 1000).toISOString(),
      record: JSON.parse(o.record),
      arkivKey: o.key,
    })),
    evaluations: evaluations.map((e) => {
      let priv: EvaluationPrivate | null = null;
      if (view.owned) {
        try {
          priv = openJson<EvaluationPrivate>(e.sealed, `evaluation:${e.evaluationId}`);
        } catch {}
      }
      return {
        evaluationId: e.evaluationId,
        status: e.status,
        runner: e.runner,
        clock: new Date(e.clockSec * 1000).toISOString(),
        clockIsDemo: e.clockIsDemo,
        reportTx: e.reportTx || null,
        reportTxUrl: e.reportTx ? txLink(e.reportTx) : null,
        explanation: priv?.explanation ?? null,
        explanationSource: priv?.explanationSource ?? null,
        reasons: priv?.reasons ?? null,
        latestEta: priv?.latestEta ?? null,
        arkivKey: e.key,
      };
    }),
    events: events.map((e) => ({ eventId: e.eventId, kind: e.kind, blockNumber: e.blockNumber.toString(), at: blockTimes.get(e.blockNumber) ?? null, txHash: e.txHash, txUrl: txLink(e.txHash), logIndex: e.logIndex, amount: formatUsdc(e.amountUnits), data: safeParse(e.data), arkivKey: e.key })),
  };
}

const safeParse = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// ------------------------------------------------------------- Arkiv panel
type Rec = { kind: string; arkivKey?: string };

async function arkivRecords(
  policyId: Hex,
  view: NonNullable<Awaited<ReturnType<typeof getPolicyView>>>,
  observations: (Rec & { observationId: string; retrievedAtSec: number })[],
  evaluations: (Rec & { evaluationId: string; status: string })[],
  events: { kind: string; key?: string; eventId: string }[],
) {
  const w = writerAddresses();
  const entityUrl = (k?: string | null) => (k ? `${ARKIV_EXPLORER}/entity/${k}` : null);
  const addrUrl = (a: string) => `${ARKIV_EXPLORER}/address/${a}`;
  const [current, quote] = await Promise.all([arkivCurrentBlock(), store().getQuoteByPolicy(policyId)]);
  const shipment = view.owned && view.priv?.shipmentId ? await store().getShipment(view.priv.shipmentId) : null;
  const expiresAt = view.policy.expiresAtBlock ?? null;
  const approxExpiry =
    expiresAt && current ? new Date(Date.now() + Number(expiresAt - current) * 2000).toISOString() : null;

  const records = [
    {
      label: "Policy",
      schema: SCHEMA_NAMES.policy,
      key: view.policy.key ?? null,
      writer: "sync",
      public: ["policy ID", "status", "vessel IMO", "port", "deadline", "threshold", "premium", "payout", "purchase/settlement tx"],
      encrypted: ["shipment link", "beneficiary", "vessel name", "voyage reference", "policy wording"],
      blindIndexed: ["owner tag", "shipment tag"],
    },
    quote && {
      label: "Signed quote",
      schema: SCHEMA_NAMES.quote,
      key: quote.key ?? null,
      writer: "app",
      public: ["quote ID", "policy ID", "product", "premium", "payout", "deadline", "terms hash"],
      encrypted: ["beneficiary", "signed quote message + signature", "policy wording"],
      blindIndexed: ["shipment tag"],
    },
    shipment && {
      label: "Shipment (your document)",
      schema: SCHEMA_NAMES.shipment,
      key: shipment.key ?? null,
      writer: "app",
      public: ["shipment ID", "status", "data label", "created at"],
      encrypted: ["owner wallet", "file name", "Swarm reference", "AI extraction", "confirmed details"],
      blindIndexed: ["owner tag"],
    },
    ...observations.map((o) => ({
      label: `Port-call observation`,
      schema: SCHEMA_NAMES.observation,
      key: o.arkivKey ?? null,
      writer: "observer",
      public: ["source record (public port data)", "evidence digest", "arrival time", "retrieved at"],
      encrypted: [],
      blindIndexed: [],
    })),
    ...evaluations.map((e) => ({
      label: `Arrival check (${e.status})`,
      schema: SCHEMA_NAMES.evaluation,
      key: e.arkivKey ?? null,
      writer: "observer",
      public: ["status", "runner", "clock", "report tx"],
      encrypted: ["reasons", "plain-language explanation"],
      blindIndexed: [],
    })),
    ...events.map((e) => ({
      label: `Arc event: ${e.kind}`,
      schema: SCHEMA_NAMES.chainEvent,
      key: e.key ?? null,
      writer: "sync",
      public: ["event ID (chainId:tx:logIndex)", "block", "amount", "decoded event args"],
      encrypted: [],
      blindIndexed: [],
    })),
  ]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ ...r, url: entityUrl(r.key), writerAddress: w[r.writer as keyof typeof w], writerUrl: addrUrl(w[r.writer as keyof typeof w]) }));

  return {
    network: "Arkiv Rabdi testnet",
    chainId: ARKIV_RABDI.id,
    explorer: ARKIV_EXPLORER,
    expiresAtBlock: expiresAt?.toString() ?? null,
    approxExpiry,
    records,
    query: [
      `import { createPublicClient } from "@arkiv-network/sdk";`,
      `import { rabdi } from "@arkiv-network/sdk/chains";`,
      `import { defineSchema, str } from "@arkiv-network/sdk/schema";`,
      `import { eq } from "@arkiv-network/sdk/query";`,
      `import { http } from "viem";`,
      ``,
      `const Policies = defineSchema("${SCHEMA_NAMES.policy}", { policyId: str().indexed(), status: str().indexed() });`,
      `const client = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() });`,
      `const { entities } = await client`,
      `  .select({ $key: true, $expiresAt: true, status: true })`,
      `  .from(Policies)`,
      `  .createdBy("${w.sync}") // only trust the authorised sync writer`,
      `  .where(eq("policyId", "${policyId}"))`,
      `  .fetch();`,
    ].join("\n"),
  };
}
