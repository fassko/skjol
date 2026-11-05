// ABI encoding of the CRE settlement report (must match ShipmentDelayPool.ArrivalReport).
import { decodeAbiParameters, encodeAbiParameters, type Address, type Hex } from "viem";
import type { ArrivalEvidence } from "./evidence";
import { sourceIdHash } from "./evidence";
import { EVENT_VESSEL_ARRIVAL_AT_PORT, locodeToBytes32 } from "./products";

export const REPORT_VERSION = 1;

export const ARRIVAL_REPORT_ABI = [
  {
    type: "tuple",
    components: [
      { name: "version", type: "uint8" },
      { name: "chainId", type: "uint256" },
      { name: "pool", type: "address" },
      { name: "policyId", type: "bytes32" },
      { name: "vesselImo", type: "uint32" },
      { name: "destinationLocode", type: "bytes32" },
      { name: "eventType", type: "uint8" },
      { name: "arrivalTime", type: "uint64" },
      { name: "observedAt", type: "uint64" },
      { name: "evidenceDigest", type: "bytes32" },
      { name: "sourceId", type: "bytes32" },
    ],
  },
] as const;

export interface ArrivalReportInput {
  chainId: bigint;
  pool: Address;
  policyId: Hex;
  vesselImo: number;
  destinationLocode: string;
  evidence: ArrivalEvidence;
}

export function buildArrivalReport(i: ArrivalReportInput) {
  if (!i.evidence.eventTimestamp) throw new Error("Report requires a recorded arrival time");
  return {
    version: REPORT_VERSION,
    chainId: i.chainId,
    pool: i.pool,
    policyId: i.policyId,
    vesselImo: i.vesselImo,
    destinationLocode: locodeToBytes32(i.destinationLocode),
    eventType: EVENT_VESSEL_ARRIVAL_AT_PORT,
    arrivalTime: BigInt(Math.floor(Date.parse(i.evidence.eventTimestamp) / 1000)),
    observedAt: BigInt(Math.floor(Date.parse(i.evidence.retrievedAt) / 1000)),
    evidenceDigest: i.evidence.digest,
    sourceId: sourceIdHash(i.evidence.source),
  } as const;
}

export function encodeArrivalReport(i: ArrivalReportInput): Hex {
  return encodeAbiParameters(ARRIVAL_REPORT_ABI, [buildArrivalReport(i)]);
}

export function decodeArrivalReport(data: Hex) {
  return decodeAbiParameters(ARRIVAL_REPORT_ABI, data)[0];
}
