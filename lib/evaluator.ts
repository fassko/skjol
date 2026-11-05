import "server-only";
import { randomUUID } from "node:crypto";
import type { Hex } from "viem";
import { localRelayAbi } from "./abi/LocalReportRelay";
import { poolAbi } from "./abi/ShipmentDelayPool";
import { explainClaim } from "./ai/explain";
import { publicClient, walletClient } from "./chain";
import { chainConfig, config, poolByAddress } from "./config";
import { sealJson } from "./crypto";
import { fetchLiveVisits, replayVisits } from "./digitraffic";
import { safeOpen } from "./insurance";
import { store, type EvaluationPrivate, type EvaluationRecord } from "./store";
import { assessEvidence, type Assessment } from "../shared/evidence";
import { PRODUCTS, SUPPORTED_PORTS, formatUsdc, type ProductId } from "../shared/products";
import { encodeArrivalReport } from "../shared/report";

// App-side evaluation. It runs the SAME shared evidence rules as the CRE workflow and records an
// observation + evaluation in Arkiv. Who submits the onchain report depends on the runner:
//   - "local-relay": local Anvil demo only, via LocalReportRelay (NOT Chainlink CRE).
//   - "cre-simulation" / "cre-deployed": the app only previews; the CRE workflow (cre/…) reads the
//      policy, fetches the port's arrival source, validates and writes the report through the Chainlink forwarder.

export interface EvaluationResult {
  evaluationId: string;
  assessment: Assessment;
  origin: "live" | "recorded" | "synthetic";
  clockIso: string;
  clockIsDemo: boolean;
  runner: EvaluationRecord["runner"];
  reportTx: string | null;
  reportPayload: Hex | null;
  explanation: string;
  explanationSource: "ai" | "rules";
  observationIds: string[];
  note: string;
}

export async function evaluatePolicy(
  policyId: Hex,
  opts: { clockIso?: string; submit?: boolean; /** demo only: resubmit even if already settled, to show duplicate handling */ forceResubmit?: boolean } = {},
): Promise<EvaluationResult> {
  const s = store();
  const p = await s.getPolicy(policyId);
  if (!p) throw new Error("Policy not found in Arkiv (has the sync run since purchase?)");
  const priv = safeOpen(p);
  const c = chainConfig();
  const pool = (p.pool || c.pool) as Hex;
  const replay = config.evidenceSource() === "replay";
  const clockIsDemo = !!opts.clockIso;
  if (clockIsDemo && !replay) throw new Error("A demo clock can only be used with replay sources");
  if (replay && !config.replayEnabled()) throw new Error("Replay evidence requested but REPLAY_ENABLED is not true");
  const clockIso = opts.clockIso ?? new Date().toISOString();
  const nowSec = Math.floor(Date.parse(clockIso) / 1000);

  // Arc is authoritative for the locked terms: read the sailing date (earliest arrival) onchain.
  const onchain = await publicClient().readContract({ address: pool, abi: poolAbi, functionName: "getPolicy", args: [policyId] });
  const terms = {
    vesselImo: String(p.vesselImo),
    destinationLocode: p.portLocode,
    earliestArrival: Number(onchain.earliestArrival),
    agreedArrivalDeadline: p.deadlineSec,
    delayThresholdSec: p.thresholdSec,
  };

  const fetched = replay
    ? replayVisits(terms.vesselImo, priv?.voyageRef ?? "", clockIso)
    : await fetchLiveVisits(terms.vesselImo, terms.destinationLocode, new Date(terms.earliestArrival * 1000).toISOString());

  const assessment: Assessment = fetched.error
    ? { status: "SOURCE_UNAVAILABLE", reasons: [fetched.error], evidence: null, considered: 0, latestEta: null }
    : assessEvidence(terms, fetched.records, nowSec, config.maxEvidenceAgeSec());

  // Observations: one per distinct source record (idempotent by digest+retrievedAt).
  const observationIds: string[] = [];
  for (const r of fetched.records.filter((x) => x.portLocode === terms.destinationLocode)) {
    const observationId = `${r.digest.slice(2, 26)}-${Math.floor(Date.parse(r.retrievedAt) / 1000)}`;
    await s.putObservation({
      observationId,
      policyId,
      digest: r.digest,
      source: r.source,
      origin: r.origin,
      vesselImo: Number(r.vesselImo ?? 0),
      portLocode: r.portLocode,
      eventTimeSec: r.eventTimestamp ? Math.floor(Date.parse(r.eventTimestamp) / 1000) : 0,
      retrievedAtSec: Math.floor(Date.parse(r.retrievedAt) / 1000),
      sourceStatus: r.sourceStatus,
      record: JSON.stringify(r),
    });
    observationIds.push(observationId);
  }

  // Submit (local relay only) when an arrival is confirmed and the policy is still active onchain.
  const runner = config.evaluationRunner();
  let reportTx: string | null = null;
  let reportPayload: Hex | null = null;
  let note = "";
  if (assessment.status === "ARRIVAL_CONFIRMED" && assessment.evidence) {
    reportPayload = encodeArrivalReport({
      chainId: BigInt(c.id),
      pool,
      policyId,
      vesselImo: p.vesselImo,
      destinationLocode: p.portLocode,
      evidence: assessment.evidence,
    });
    const alreadySettled = Number(onchain.status) !== 1;
    if (alreadySettled && !opts.forceResubmit) {
      note = "Policy already settled onchain; no new report submitted.";
    } else if (opts.submit !== false && runner === "local-relay") {
      if (c.mode !== "local") throw new Error("local-relay runner is only allowed on the local demo chain");
      const relay = process.env.LOCAL_RELAY_ADDRESS as Hex;
      const w = walletClient("DEPLOYER_PRIVATE_KEY");
      const hash = await w.writeContract({ address: relay, abi: localRelayAbi, functionName: "report", args: [pool, "0x", reportPayload] });
      await publicClient().waitForTransactionReceipt({ hash });
      reportTx = hash;
      note = "Report delivered by the LOCAL demo relay (not Chainlink CRE).";
    } else if (runner !== "local-relay") {
      note = "Arrival confirmed. Settlement is submitted by the Chainlink CRE workflow (see cre/README).";
    }
  } else {
    note = "No report submitted: the policy stays active until valid arrival evidence exists.";
  }

  const product = PRODUCTS[p.productId as ProductId];
  const facts = {
    vesselName: priv?.vesselName || `IMO ${p.vesselImo}`,
    vesselImo: String(p.vesselImo),
    port: SUPPORTED_PORTS[p.portLocode] ?? p.portLocode,
    agreedArrivalDeadline: new Date(p.deadlineSec * 1000).toISOString(),
    thresholdHours: p.thresholdSec / 3600,
    assessment: assessment.status,
    reasons: assessment.reasons,
    recordedArrival: assessment.evidence?.eventTimestamp ?? null,
    latestEta: assessment.latestEta,
    delayHours: assessment.preview ? assessment.preview.delaySec / 3600 : null,
    payoutEligible: assessment.preview?.payoutEligible ?? null,
    payoutUsdc: formatUsdc(product?.payout ?? p.payoutUnits),
    currency: poolByAddress(pool)?.currency ?? "USDC",
    dataLabel: fetched.origin,
  };
  const explanation = await explainClaim(facts);

  const evaluationId = `ev_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const evPriv: EvaluationPrivate = {
    reasons: assessment.reasons,
    explanation: explanation.text,
    explanationSource: explanation.source,
    latestEta: assessment.latestEta,
    preview: assessment.preview ?? null,
  };
  await s.putEvaluation({
    evaluationId,
    policyId,
    status: assessment.status,
    runner: runner === "local-relay" ? "local-relay" : "app-preview",
    clockSec: nowSec,
    clockIsDemo,
    observationId: observationIds[0] ?? "",
    reportTx: reportTx ?? "",
    sealed: sealJson(evPriv, `evaluation:${evaluationId}`),
  });
  await s.upsertPolicy({ ...p, lastEvaluation: assessment.status });

  return {
    evaluationId,
    assessment,
    origin: fetched.origin,
    clockIso,
    clockIsDemo,
    runner,
    reportTx,
    reportPayload,
    explanation: explanation.text,
    explanationSource: explanation.source,
    observationIds,
    note,
  };
}
