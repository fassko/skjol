// Skjol arrival evaluator — Chainlink CRE workflow (TypeScript SDK).
//
// 1. Reads the policy's locked terms from the ShipmentDelayPool on Arc (EVM read).
// 2. Fetches port-call records for the vessel (IMO) at the destination port from Digitraffic
//    (live) or from the app's labelled replay source (replay config) — HTTP, node mode,
//    identical-value consensus.
// 3. Normalises + validates evidence with the SAME shared rules the app uses.
// 4. Only when a recorded arrival is confirmed: generates a signed report and writes it to the
//    pool through the forwarder. Missing / stale / conflicting evidence writes nothing.
// The contract re-checks binding (chain, pool, policy, vessel, port), freshness and recomputes
// eligibility; duplicate reports are recorded and ignored onchain.
import {
  CronCapability,
  EVMClient,
  HTTPCapability,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  Runner,
  bytesToHex,
  consensusIdenticalAggregation,
  decodeJson,
  encodeCallMsg,
  getNetwork,
  handler,
  hexToBase64,
  type HTTPPayload,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk";
import { gunzipSync } from "fflate";
import { decodeFunctionResult, encodeFunctionData, hexToString, zeroAddress, type Hex } from "viem";
import { POOL_READ_ABI } from "./contracts/abi";
import { assessEvidence, normaliseDigitrafficVisit, type ArrivalEvidence, type DigitrafficVisit } from "../../shared/evidence";
import { encodeArrivalReport } from "../../shared/report";

type Config = {
  schedule: string;
  chainName: string;
  poolAddress: string;
  gasLimit: string;
  /** "https://meri.digitraffic.fi" (live) or "<app>/api/replay" (replay; labelled synthetic/recorded). */
  digitrafficBaseUrl: string;
  digitrafficUser: string;
  replay: boolean;
  maxEvidenceAgeSec: number;
  /** Policies evaluated on each cron tick. */
  watchPolicyIds: string[];
};

type EvaluationOutput = {
  policyId: string;
  status: string;
  reasons: string[];
  origin: string;
  /** "yes" | "no" | "n/a" — preview only; the contract recomputes eligibility. */
  payoutEligiblePreview: string;
  reportSubmitted: boolean;
  /** "" when no report was written. */
  txHash: string;
};

const POLICY_ACTIVE = 1;

type ReplayVisit = DigitrafficVisit & { skjolReplay?: { retrievedAt: string; label: "recorded" | "synthetic" } };

function readPolicy(runtime: Runtime<Config>, evm: EVMClient, policyId: Hex) {
  const call = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: runtime.config.poolAddress as Hex,
        data: encodeFunctionData({ abi: POOL_READ_ABI, functionName: "getPolicy", args: [policyId] }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi: POOL_READ_ABI, functionName: "getPolicy", data: bytesToHex(call.data) });
}

/** Node-mode fetch. Returns a canonical JSON string so honest nodes return identical values. */
function fetchVisits(nodeRuntime: NodeRuntime<Config>, imo: string, locode: string, fromIso: string, clockIso: string): string {
  const cfg = nodeRuntime.config;
  let url = `${cfg.digitrafficBaseUrl}/api/port-call/v2/visits?imo=${imo}&portOfCall=${locode}&fromDateTime=${encodeURIComponent(fromIso)}`;
  if (cfg.replay) url += `&clock=${encodeURIComponent(clockIso)}`;
  const resp = new HTTPClient()
    .sendRequest(nodeRuntime, {
      url,
      method: "GET",
      multiHeaders: {
        "Accept-Encoding": { values: ["gzip"] },
        "Digitraffic-User": { values: [cfg.digitrafficUser] },
        Accept: { values: ["application/json"] },
      },
      timeout: "8s",
    })
    .result();
  if (resp.statusCode !== 200) throw new Error(`Port-call source HTTP ${resp.statusCode}`);
  // Digitraffic requires gzip; decompress if the transport did not.
  const raw = resp.body[0] === 0x1f && resp.body[1] === 0x8b ? gunzipSync(resp.body) : resp.body;
  const visits = JSON.parse(new TextDecoder().decode(raw)) as ReplayVisit[];
  const minimal = visits
    .map((v) => ({
      visitId: String(v.visitId),
      vesselId: v.vesselId ?? null,
      vesselName: v.vesselName ?? null,
      mmsi: v.mmsi ?? null,
      portOfCall: v.portOfCall,
      eta: v.eta ?? null,
      ata: v.ata ?? null,
      status: v.status,
      updateTime: v.updateTime,
      skjolReplay: v.skjolReplay ?? null,
    }))
    .sort((a, b) => (a.visitId < b.visitId ? -1 : 1));
  return JSON.stringify(minimal);
}

function evaluate(runtime: Runtime<Config>, policyId: Hex, demoClockIso?: string): EvaluationOutput {
  const cfg = runtime.config;
  if (demoClockIso && !cfg.replay) throw new Error("A demo clock is only accepted with the replay configuration");
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName });
  if (!network) throw new Error(`Unknown chain ${cfg.chainName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const p = readPolicy(runtime, evm, policyId);
  if (Number(p.status) !== POLICY_ACTIVE) {
    runtime.log(`Policy ${policyId} is not active (status ${p.status}); nothing to do.`);
    return { policyId, status: "NOT_ACTIVE", reasons: [], origin: "-", payoutEligiblePreview: "n/a", reportSubmitted: false, txHash: "" };
  }

  const imo = String(p.vesselImo);
  const locode = hexToString(p.destinationLocode, { size: 32 }).replace(/\0+$/, "");
  const nowIso = demoClockIso ?? runtime.now().toISOString();
  const nowSec = Math.floor(Date.parse(nowIso) / 1000);
  const fromIso = new Date(Number(p.earliestArrival) * 1000).toISOString();

  const json = runtime
    .runInNodeMode((nr: NodeRuntime<Config>) => fetchVisits(nr, imo, locode, fromIso, nowIso), consensusIdenticalAggregation<string>())()
    .result();
  const visits = JSON.parse(json) as ReplayVisit[];
  const records: ArrivalEvidence[] = visits.map((v) =>
    normaliseDigitrafficVisit(
      { ...v, vesselId: v.vesselId ?? undefined, vesselName: v.vesselName ?? undefined, mmsi: v.mmsi ?? undefined, eta: v.eta ?? undefined, ata: v.ata ?? undefined } as DigitrafficVisit,
      // Replay keeps the ORIGINAL retrieval time; live evidence is stamped with DON time.
      v.skjolReplay?.retrievedAt ?? nowIso,
      v.skjolReplay?.label ?? "live",
    ),
  );
  const origin = records[0]?.origin ?? (cfg.replay ? "replay" : "live");

  const a = assessEvidence(
    {
      vesselImo: imo,
      destinationLocode: locode,
      earliestArrival: Number(p.earliestArrival),
      agreedArrivalDeadline: Number(p.agreedArrivalDeadline),
      delayThresholdSec: Number(p.delayThreshold),
    },
    records,
    nowSec,
    cfg.maxEvidenceAgeSec,
  );
  runtime.log(`Policy ${policyId}: ${a.status} (${a.reasons.join(", ")}) from ${records.length} ${origin} record(s)`);

  if (a.status !== "ARRIVAL_CONFIRMED" || !a.evidence) {
    return { policyId, status: a.status, reasons: a.reasons, origin, payoutEligiblePreview: "n/a", reportSubmitted: false, txHash: "" };
  }

  const payload = encodeArrivalReport({
    chainId: BigInt(network.chainId),
    pool: cfg.poolAddress as Hex,
    policyId,
    vesselImo: Number(p.vesselImo),
    destinationLocode: locode,
    evidence: a.evidence,
  });
  const report = runtime
    .report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const write = evm.writeReport(runtime, { receiver: cfg.poolAddress, report, gasConfig: { gasLimit: cfg.gasLimit } }).result();
  const txHash = bytesToHex(write.txHash || new Uint8Array(32));
  runtime.log(`Report written for ${policyId}: tx ${txHash} (payout preview: ${a.preview?.payoutEligible})`);
  return { policyId, status: a.status, reasons: a.reasons, origin, payoutEligiblePreview: a.preview?.payoutEligible ? "yes" : "no", reportSubmitted: true, txHash };
}

const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): EvaluationOutput => {
  const input = decodeJson(payload.input) as { policyId?: string; clock?: string };
  if (!input.policyId || !/^0x[0-9a-fA-F]{64}$/.test(input.policyId)) throw new Error("policyId (bytes32 hex) is required");
  return evaluate(runtime, input.policyId as Hex, input.clock);
};

const onCron = (runtime: Runtime<Config>): EvaluationOutput[] =>
  runtime.config.watchPolicyIds.map((id) => evaluate(runtime, id as Hex));

const initWorkflow = (config: Config) => [
  handler(new HTTPCapability().trigger({}), onHttp),
  handler(new CronCapability().trigger({ schedule: config.schedule }), onCron),
];

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
