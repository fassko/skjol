// Skjol arrival evaluator — Chainlink CRE workflow (TypeScript SDK).
//
// 1. Reads the policy's locked terms from the ShipmentDelayPool on Arc (EVM read).
// 2. Fetches arrival records for the vessel (IMO) at the destination port from the source that
//    covers that port — Digitraffic (Finland) or VesselFinder (India, API key from CRE secrets) —
//    or from the app's labelled replay source (replay config). HTTP, node mode, identical-value
//    consensus.
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
import {
  assessEvidence,
  normaliseDigitrafficVisit,
  normaliseVesselFinderPortCall,
  type ArrivalEvidence,
  type DigitrafficVisit,
  type VesselFinderPortCall,
} from "../../shared/evidence";
import { portInfo, type EvidenceSourceKey } from "../../shared/ports";
import { encodeArrivalReport } from "../../shared/report";

type Config = {
  schedule: string;
  chainName: string;
  /** Default pool (USDC). */
  poolAddress: string;
  /** Every pool this workflow may report to (USDC and EURC). Defaults to [poolAddress]. */
  poolAddresses?: string[];
  gasLimit: string;
  /** Live Digitraffic, e.g. "https://meri.digitraffic.fi". */
  digitrafficBaseUrl: string;
  digitrafficUser: string;
  /** Live VesselFinder, e.g. "https://api.vesselfinder.com". Key: CRE secret VESSELFINDER_API_KEY. */
  vesselFinderBaseUrl?: string;
  replay: boolean;
  /** "<app>/api/replay" (replay only; labelled synthetic/recorded). Defaults to digitrafficBaseUrl. */
  replayBaseUrl?: string;
  maxEvidenceAgeSec: number;
  /** Policies evaluated on each cron tick: "<policyId>" (default pool) or "<pool>:<policyId>". */
  watchPolicyIds: string[];
};

/** Resolve the target pool, refusing any pool outside the configured allowlist. */
function resolvePool(cfg: Config, requested?: string): Hex {
  const allowed = (cfg.poolAddresses?.length ? cfg.poolAddresses : [cfg.poolAddress]).map((a) => a.toLowerCase());
  const pool = (requested ?? cfg.poolAddress).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(pool) || !allowed.includes(pool)) throw new Error(`Pool ${requested} is not configured for this workflow`);
  return pool as Hex;
}

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

type ReplayLabel = { skjolReplay?: { retrievedAt: string; label: "recorded" | "synthetic" } | null };
type ReplayVisit = DigitrafficVisit & ReplayLabel;
type ReplayPortCall = { PORTCALL: VesselFinderPortCall } & ReplayLabel;

const VESSELFINDER_SECRET = "VESSELFINDER_API_KEY";

function readPolicy(runtime: Runtime<Config>, evm: EVMClient, pool: Hex, policyId: Hex) {
  const call = evm
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: pool,
        data: encodeFunctionData({ abi: POOL_READ_ABI, functionName: "getPolicy", args: [policyId] }),
      }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi: POOL_READ_ABI, functionName: "getPolicy", data: bytesToHex(call.data) });
}

function httpGetJson(nodeRuntime: NodeRuntime<Config>, url: string, headers: Record<string, string>): unknown {
  const multiHeaders = Object.fromEntries(Object.entries({ Accept: "application/json", ...headers }).map(([k, v]) => [k, { values: [v] }]));
  const resp = new HTTPClient().sendRequest(nodeRuntime, { url, method: "GET", multiHeaders, timeout: "8s" }).result();
  if (resp.statusCode !== 200) throw new Error(`Port-call source HTTP ${resp.statusCode}`);
  // Digitraffic requires gzip; decompress if the transport did not.
  const raw = resp.body[0] === 0x1f && resp.body[1] === 0x8b ? gunzipSync(resp.body) : resp.body;
  return JSON.parse(new TextDecoder().decode(raw));
}

const vesselFinderDate = (iso: string) => iso.slice(0, 19).replace("T", " ");

/** Node-mode fetch. Returns a canonical JSON string so honest nodes return identical values. */
function fetchArrivals(
  nodeRuntime: NodeRuntime<Config>,
  source: EvidenceSourceKey,
  imo: string,
  locode: string,
  fromIso: string,
  clockIso: string,
  vesselFinderKey: string,
): string {
  return source === "vesselfinder"
    ? fetchVesselFinder(nodeRuntime, imo, locode, fromIso, clockIso, vesselFinderKey)
    : fetchDigitraffic(nodeRuntime, imo, locode, fromIso, clockIso);
}

function fetchVesselFinder(nodeRuntime: NodeRuntime<Config>, imo: string, locode: string, fromIso: string, clockIso: string, key: string): string {
  const cfg = nodeRuntime.config;
  // Queried by IMO (VesselFinder ignores imo when locode is given); anchorage arrivals excluded.
  const q = `imo=${imo}&event=arrival&anchorage=0&fromdate=${encodeURIComponent(vesselFinderDate(fromIso))}&todate=${encodeURIComponent(vesselFinderDate(clockIso))}`;
  const url = cfg.replay
    ? `${cfg.replayBaseUrl ?? cfg.digitrafficBaseUrl}/vesselfinder/portcalls?${q}&port=${locode}&clock=${encodeURIComponent(clockIso)}`
    : `${cfg.vesselFinderBaseUrl ?? "https://api.vesselfinder.com"}/portcalls?${q}&userkey=${encodeURIComponent(key)}`;
  const body = httpGetJson(nodeRuntime, url, {}) as ReplayPortCall[] | { error?: string };
  if (!Array.isArray(body)) throw new Error(`VesselFinder error: ${body?.error ?? "unexpected response"}`);
  const minimal = body
    .filter((r) => r?.PORTCALL && String(r.PORTCALL.LOCODE).toUpperCase() === locode)
    .map((r) => ({
      PORTCALL: {
        ID: r.PORTCALL.ID ?? null,
        MMSI: r.PORTCALL.MMSI ?? null,
        IMO: r.PORTCALL.IMO ?? null,
        LOCODE: r.PORTCALL.LOCODE,
        EVENT: r.PORTCALL.EVENT,
        TIMESTAMP: r.PORTCALL.TIMESTAMP,
      },
      skjolReplay: r.skjolReplay ?? null,
    }))
    .sort((a, b) => (a.PORTCALL.TIMESTAMP < b.PORTCALL.TIMESTAMP ? -1 : a.PORTCALL.TIMESTAMP > b.PORTCALL.TIMESTAMP ? 1 : 0));
  return JSON.stringify({ source: "vesselfinder", rows: minimal });
}

function fetchDigitraffic(nodeRuntime: NodeRuntime<Config>, imo: string, locode: string, fromIso: string, clockIso: string): string {
  const cfg = nodeRuntime.config;
  const q = `imo=${imo}&portOfCall=${locode}&fromDateTime=${encodeURIComponent(fromIso)}`;
  const url = cfg.replay
    ? `${cfg.replayBaseUrl ?? cfg.digitrafficBaseUrl}/digitraffic/visits?${q}&clock=${encodeURIComponent(clockIso)}`
    : `${cfg.digitrafficBaseUrl}/api/port-call/v2/visits?${q}`;
  const visits = httpGetJson(nodeRuntime, url, { "Accept-Encoding": "gzip", "Digitraffic-User": cfg.digitrafficUser }) as ReplayVisit[];
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
  return JSON.stringify({ source: "digitraffic", visits: minimal });
}

/** Rebuilds typed evidence from the consensus JSON. Replay keeps the ORIGINAL retrieval time. */
function toEvidence(json: string, nowIso: string): ArrivalEvidence[] {
  const parsed = JSON.parse(json) as { source: "digitraffic"; visits: ReplayVisit[] } | { source: "vesselfinder"; rows: ReplayPortCall[] };
  if (parsed.source === "vesselfinder") {
    return parsed.rows
      .map((r) =>
        normaliseVesselFinderPortCall(
          { ...r.PORTCALL, ID: r.PORTCALL.ID ?? undefined, MMSI: r.PORTCALL.MMSI ?? undefined, IMO: r.PORTCALL.IMO ?? undefined },
          r.skjolReplay?.retrievedAt ?? nowIso,
          r.skjolReplay?.label ?? "live",
        ),
      )
      .filter((e): e is ArrivalEvidence => e !== null);
  }
  return parsed.visits.map((v) =>
    normaliseDigitrafficVisit(
      { ...v, vesselId: v.vesselId ?? undefined, vesselName: v.vesselName ?? undefined, mmsi: v.mmsi ?? undefined, eta: v.eta ?? undefined, ata: v.ata ?? undefined } as DigitrafficVisit,
      v.skjolReplay?.retrievedAt ?? nowIso,
      v.skjolReplay?.label ?? "live",
    ),
  );
}

function evaluate(runtime: Runtime<Config>, pool: Hex, policyId: Hex, demoClockIso?: string): EvaluationOutput {
  const cfg = runtime.config;
  if (demoClockIso && !cfg.replay) throw new Error("A demo clock is only accepted with the replay configuration");
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainName });
  if (!network) throw new Error(`Unknown chain ${cfg.chainName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const p = readPolicy(runtime, evm, pool, policyId);
  if (Number(p.status) !== POLICY_ACTIVE) {
    runtime.log(`Policy ${policyId} is not active (status ${p.status}); nothing to do.`);
    return { policyId, status: "NOT_ACTIVE", reasons: [], origin: "-", payoutEligiblePreview: "n/a", reportSubmitted: false, txHash: "" };
  }

  const imo = String(p.vesselImo);
  const locode = hexToString(p.destinationLocode, { size: 32 }).replace(/\0+$/, "");
  const nowIso = demoClockIso ?? runtime.now().toISOString();
  const nowSec = Math.floor(Date.parse(nowIso) / 1000);
  const fromIso = new Date(Number(p.earliestArrival) * 1000).toISOString();

  const port = portInfo(locode);
  if (!port) {
    runtime.log(`Policy ${policyId}: no arrival source covers ${locode}; nothing submitted.`);
    return { policyId, status: "SOURCE_UNAVAILABLE", reasons: ["PORT_NOT_COVERED"], origin: "-", payoutEligiblePreview: "n/a", reportSubmitted: false, txHash: "" };
  }
  let vesselFinderKey = "";
  if (port.source === "vesselfinder" && !cfg.replay) {
    try {
      vesselFinderKey = runtime.getSecret({ id: VESSELFINDER_SECRET }).result().value;
    } catch {
      runtime.log(`Policy ${policyId}: secret ${VESSELFINDER_SECRET} is not available; nothing submitted.`);
      return { policyId, status: "SOURCE_UNAVAILABLE", reasons: ["SOURCE_CREDENTIALS_MISSING"], origin: "live", payoutEligiblePreview: "n/a", reportSubmitted: false, txHash: "" };
    }
  }

  const json = runtime
    .runInNodeMode(
      (nr: NodeRuntime<Config>) => fetchArrivals(nr, port.source, imo, locode, fromIso, nowIso, vesselFinderKey),
      consensusIdenticalAggregation<string>(),
    )()
    .result();
  // Live evidence is stamped with DON time.
  const records = toEvidence(json, nowIso);
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
    pool,
    policyId,
    vesselImo: Number(p.vesselImo),
    destinationLocode: locode,
    evidence: a.evidence,
  });
  const report = runtime
    .report({ encodedPayload: hexToBase64(payload), encoderName: "evm", signingAlgo: "ecdsa", hashingAlgo: "keccak256" })
    .result();
  const write = evm.writeReport(runtime, { receiver: pool, report, gasConfig: { gasLimit: cfg.gasLimit } }).result();
  const txHash = bytesToHex(write.txHash || new Uint8Array(32));
  runtime.log(`Report written for ${policyId}: tx ${txHash} (payout preview: ${a.preview?.payoutEligible})`);
  return { policyId, status: a.status, reasons: a.reasons, origin, payoutEligiblePreview: a.preview?.payoutEligible ? "yes" : "no", reportSubmitted: true, txHash };
}

const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): EvaluationOutput => {
  const input = decodeJson(payload.input) as { policyId?: string; clock?: string; pool?: string };
  if (!input.policyId || !/^0x[0-9a-fA-F]{64}$/.test(input.policyId)) throw new Error("policyId (bytes32 hex) is required");
  return evaluate(runtime, resolvePool(runtime.config, input.pool), input.policyId as Hex, input.clock);
};

const onCron = (runtime: Runtime<Config>): EvaluationOutput[] =>
  runtime.config.watchPolicyIds.map((entry) => {
    const [pool, id] = entry.includes(":") ? entry.split(":") : [undefined, entry];
    return evaluate(runtime, resolvePool(runtime.config, pool), id as Hex);
  });

const initWorkflow = (config: Config) => [
  handler(new HTTPCapability().trigger({}), onHttp),
  handler(new CronCapability().trigger({ schedule: config.schedule }), onCron),
];

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
