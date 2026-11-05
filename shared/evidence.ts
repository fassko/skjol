// Common typed arrival-evidence format, the per-source normalisers and the evidence assessment
// rules. Pure (viem only) so it runs in Node, Vitest and the CRE WASM runtime.
//
// Digitraffic port-call v2 `/api/port-call/v2/visits` record fields observed 2026-11-05:
// visitId, vesselId (= IMO), vesselName, shipCallSign, mmsi, portOfCall (UN/LOCODE), portName,
// eta, etd, ata, atd, status ("Expected to Arrive" | "Arrived" | "Departed" | "Cancelled"),
// updateTime, plus berth/area and tonnage fields.
//
// VesselFinder `GET /portcalls` (documented at api.vesselfinder.com/docs/portcalls.html, not yet
// exercised with a live key): JSON array of { PORTCALL: { ID?, MMSI, IMO (0 = unknown), LOCODE,
// EVENT ("ARRIVAL" | "DEPARTURE"), TIMESTAMP ("YYYY-MM-DD HH:MM:SS UTC"), PORT, COUNTRY } };
// errors are returned as { error }. Events are derived from AIS positions, so there is no ETA or
// "expected" status: absence of an arrival event is the only pending signal.
import { keccak256, stringToHex } from "viem";
import { EVIDENCE_SOURCES } from "./ports";

export const EVIDENCE_SCHEMA = "skjol.arrival-evidence.v1" as const;

export type EvidenceOrigin = "live" | "recorded" | "synthetic";

export interface DigitrafficVisit {
  visitId: string;
  vesselId?: string;
  vesselName?: string;
  mmsi?: string;
  portOfCall: string;
  portName?: string;
  eta?: string;
  etd?: string;
  ata?: string;
  atd?: string;
  status: string;
  updateTime: string;
}

export interface ArrivalEvidence {
  schema: typeof EVIDENCE_SCHEMA;
  /** Stable source identifier, hashed into the onchain report as `sourceId`. */
  source: string;
  origin: EvidenceOrigin;
  sourceRecordId: string;
  vesselImo: string | null;
  vesselMmsi: string | null;
  vesselName: string | null;
  portLocode: string;
  eventType: "VESSEL_ARRIVAL_AT_PORT";
  /** Recorded actual time of arrival (ISO) or null when not (yet) recorded. */
  eventTimestamp: string | null;
  /** Latest ETA, informational only. Never used for eligibility. */
  latestEta: string | null;
  sourceStatus: string;
  sourceUpdatedAt: string;
  /** When this evidence was retrieved from the source. Original value is kept on replay. */
  retrievedAt: string;
  /** keccak256 of the canonical record (all fields above except retrievedAt). */
  digest: `0x${string}`;
}

export const DIGITRAFFIC_SOURCE = EVIDENCE_SOURCES.digitraffic.id;
export const VESSELFINDER_SOURCE = EVIDENCE_SOURCES.vesselfinder.id;

export interface VesselFinderPortCall {
  ID?: number;
  MMSI?: number;
  IMO?: number;
  LOCODE: string;
  EVENT: string;
  TIMESTAMP: string;
  PORT?: string;
  COUNTRY?: string;
}

export interface VesselFinderRow {
  PORTCALL: VesselFinderPortCall;
}

function canonical(e: Omit<ArrivalEvidence, "digest" | "retrievedAt">): string {
  // Fixed key order -> deterministic JSON across nodes and runtimes.
  return JSON.stringify([
    e.schema,
    e.source,
    e.origin,
    e.sourceRecordId,
    e.vesselImo,
    e.vesselMmsi,
    e.vesselName,
    e.portLocode,
    e.eventType,
    e.eventTimestamp,
    e.latestEta,
    e.sourceStatus,
    e.sourceUpdatedAt,
  ]);
}

export function evidenceDigest(e: Omit<ArrivalEvidence, "digest" | "retrievedAt">): `0x${string}` {
  return keccak256(stringToHex(canonical(e)));
}

export function sourceIdHash(source: string): `0x${string}` {
  return keccak256(stringToHex(source));
}

export function normaliseDigitrafficVisit(
  v: DigitrafficVisit,
  retrievedAt: string,
  origin: EvidenceOrigin,
): ArrivalEvidence {
  const base = {
    schema: EVIDENCE_SCHEMA,
    source: DIGITRAFFIC_SOURCE,
    origin,
    sourceRecordId: String(v.visitId),
    vesselImo: v.vesselId && /^\d{7}$/.test(String(v.vesselId)) ? String(v.vesselId) : null,
    vesselMmsi: v.mmsi ? String(v.mmsi) : null,
    vesselName: v.vesselName ?? null,
    portLocode: String(v.portOfCall).toUpperCase(),
    eventType: "VESSEL_ARRIVAL_AT_PORT" as const,
    eventTimestamp: v.ata ?? null,
    latestEta: v.eta ?? null,
    sourceStatus: String(v.status),
    sourceUpdatedAt: String(v.updateTime),
  };
  return { ...base, retrievedAt, digest: evidenceDigest(base) };
}

/** "2026-12-12 03:00:00 UTC" -> "2026-12-12T03:00:00.000Z"; null when unparseable. */
export function parseVesselFinderTimestamp(ts: string): string | null {
  const m = String(ts).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*UTC|Z)?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString();
}

/** Normalises a VesselFinder ARRIVAL event. Returns null for departures or unreadable timestamps. */
export function normaliseVesselFinderPortCall(
  pc: VesselFinderPortCall,
  retrievedAt: string,
  origin: EvidenceOrigin,
): ArrivalEvidence | null {
  if (String(pc.EVENT).toUpperCase() !== "ARRIVAL") return null;
  const at = parseVesselFinderTimestamp(pc.TIMESTAMP);
  if (!at) return null;
  const imo = pc.IMO && /^\d{7}$/.test(String(pc.IMO)) ? String(pc.IMO) : null;
  const mmsi = pc.MMSI ? String(pc.MMSI) : null;
  const locode = String(pc.LOCODE).toUpperCase();
  const base = {
    schema: EVIDENCE_SCHEMA,
    source: VESSELFINDER_SOURCE,
    origin,
    // `ID` is listed in the dataset docs but absent from their examples; fall back to a stable key.
    sourceRecordId: pc.ID ? String(pc.ID) : `${locode}:${imo ?? mmsi ?? "unknown"}:${at}`,
    vesselImo: imo,
    vesselMmsi: mmsi,
    vesselName: null,
    portLocode: locode,
    eventType: "VESSEL_ARRIVAL_AT_PORT" as const,
    eventTimestamp: at,
    latestEta: null,
    sourceStatus: "Arrived",
    sourceUpdatedAt: at,
  };
  return { ...base, retrievedAt, digest: evidenceDigest(base) };
}

export function normaliseVesselFinderRows(rows: VesselFinderRow[], retrievedAt: string, origin: EvidenceOrigin): ArrivalEvidence[] {
  return rows
    .map((r) => (r?.PORTCALL ? normaliseVesselFinderPortCall(r.PORTCALL, retrievedAt, origin) : null))
    .filter((e): e is ArrivalEvidence => e !== null);
}

/** Inverse of normaliseVesselFinderPortCall for synthetic replay records (round-trips the digest). */
export function toVesselFinderRow(e: ArrivalEvidence): VesselFinderRow {
  const ts = (e.eventTimestamp ?? "").replace("T", " ").replace(/\.\d{3}Z$|Z$/, " UTC");
  return {
    PORTCALL: {
      ...(/^\d+$/.test(e.sourceRecordId) ? { ID: Number(e.sourceRecordId) } : {}),
      MMSI: e.vesselMmsi ? Number(e.vesselMmsi) : 0,
      IMO: e.vesselImo ? Number(e.vesselImo) : 0,
      LOCODE: e.portLocode,
      EVENT: "ARRIVAL",
      TIMESTAMP: ts,
    },
  };
}

// ------------------------------------------------------------------ assessment
export interface PolicyEvidenceTerms {
  vesselImo: string;
  destinationLocode: string;
  /** unix seconds */
  earliestArrival: number;
  agreedArrivalDeadline: number;
  delayThresholdSec: number;
}

export type AssessmentStatus =
  | "ARRIVAL_CONFIRMED"
  | "PENDING_NO_ARRIVAL"
  | "PENDING_STALE"
  | "PENDING_CONFLICT"
  | "SOURCE_UNAVAILABLE";

export interface Assessment {
  status: AssessmentStatus;
  /** Plain-language reason codes for the timeline and the AI explanation. */
  reasons: string[];
  evidence: ArrivalEvidence | null;
  considered: number;
  /** Only for ARRIVAL_CONFIRMED: preview of the onchain rule (contract recomputes). */
  preview?: { arrivalTime: number; delaySec: number; payoutEligible: boolean };
  latestEta: string | null;
}

export const DEFAULT_MAX_EVIDENCE_AGE_SEC = 6 * 3600;
const FUTURE_SKEW_SEC = 300;

const toSec = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : NaN);

/**
 * Decide whether the evidence set establishes a recorded arrival for this policy.
 * `nowSec` is the evaluation clock (CRE DON time, or the demo clock in replay mode).
 */
export function assessEvidence(
  terms: PolicyEvidenceTerms,
  records: ArrivalEvidence[],
  nowSec: number,
  maxEvidenceAgeSec = DEFAULT_MAX_EVIDENCE_AGE_SEC,
): Assessment {
  const locode = terms.destinationLocode.toUpperCase();
  const relevant = records.filter(
    (r) => r.portLocode === locode && (r.vesselImo === null || r.vesselImo === terms.vesselImo),
  );
  const reasons: string[] = [];
  const etas = relevant.map((r) => r.latestEta).filter((x): x is string => !!x).sort();
  const latestEta = etas.length ? etas[etas.length - 1] : null;

  if (relevant.length === 0) {
    return { status: "PENDING_NO_ARRIVAL", reasons: ["NO_PORT_CALL_FOR_VESSEL_AT_PORT"], evidence: null, considered: 0, latestEta };
  }

  const imoMismatch = relevant.some((r) => r.vesselImo === null);
  if (imoMismatch) reasons.push("SOME_RECORDS_LACK_IMO");

  // Port calls in the insured window: ETA or ATA on/after the sailing date.
  const inWindow = relevant.filter((r) => {
    const ata = toSec(r.eventTimestamp);
    const eta = toSec(r.latestEta);
    return (Number.isFinite(ata) && ata >= terms.earliestArrival) || (Number.isFinite(eta) && eta >= terms.earliestArrival);
  });
  if (inWindow.length === 0) {
    return { status: "PENDING_NO_ARRIVAL", reasons: [...reasons, "NO_PORT_CALL_IN_POLICY_WINDOW"], evidence: null, considered: relevant.length, latestEta };
  }

  const conflicts: string[] = [];
  const arrivals: ArrivalEvidence[] = [];
  for (const r of inWindow) {
    const ata = toSec(r.eventTimestamp);
    const status = r.sourceStatus.toLowerCase();
    if (!Number.isFinite(ata)) continue;
    if (status.includes("cancel")) conflicts.push(`ARRIVAL_ON_CANCELLED_VISIT:${r.sourceRecordId}`);
    else if (status.includes("expected")) conflicts.push(`ARRIVAL_TIME_BUT_STATUS_EXPECTED:${r.sourceRecordId}`);
    else if (ata < terms.earliestArrival) conflicts.push(`ARRIVAL_BEFORE_SAILING:${r.sourceRecordId}`);
    else if (ata > nowSec + FUTURE_SKEW_SEC) conflicts.push(`ARRIVAL_IN_FUTURE:${r.sourceRecordId}`);
    else if (ata > toSec(r.retrievedAt) + FUTURE_SKEW_SEC) conflicts.push(`ARRIVAL_AFTER_RETRIEVAL:${r.sourceRecordId}`);
    else arrivals.push(r);
  }

  // Distinct arrival times for the same visit, or two visits arriving within the window.
  const byVisit = new Map<string, Set<string>>();
  for (const a of arrivals) {
    const s = byVisit.get(a.sourceRecordId) ?? new Set();
    s.add(a.eventTimestamp!);
    byVisit.set(a.sourceRecordId, s);
  }
  for (const [visit, times] of byVisit) if (times.size > 1) conflicts.push(`MULTIPLE_ARRIVAL_TIMES:${visit}`);

  if (conflicts.length > 0) {
    return { status: "PENDING_CONFLICT", reasons: [...reasons, ...conflicts], evidence: arrivals[0] ?? null, considered: relevant.length, latestEta };
  }
  if (arrivals.length === 0) {
    const freshest = Math.max(...relevant.map((r) => toSec(r.retrievedAt)));
    if (nowSec - freshest > maxEvidenceAgeSec) {
      return { status: "PENDING_STALE", reasons: [...reasons, "NO_RECENT_OBSERVATION"], evidence: null, considered: relevant.length, latestEta };
    }
    return { status: "PENDING_NO_ARRIVAL", reasons: [...reasons, "ARRIVAL_NOT_YET_RECORDED"], evidence: null, considered: relevant.length, latestEta };
  }

  // First recorded arrival on/after the sailing date is the insured arrival.
  arrivals.sort((a, b) => toSec(a.eventTimestamp) - toSec(b.eventTimestamp));
  const chosen = arrivals[0];
  const retrievedAt = toSec(chosen.retrievedAt);
  if (nowSec - retrievedAt > maxEvidenceAgeSec) {
    return { status: "PENDING_STALE", reasons: [...reasons, "EVIDENCE_OLDER_THAN_MAX_AGE"], evidence: chosen, considered: relevant.length, latestEta };
  }
  const arrivalTime = toSec(chosen.eventTimestamp);
  const delaySec = arrivalTime - terms.agreedArrivalDeadline;
  return {
    status: "ARRIVAL_CONFIRMED",
    reasons: [...reasons, delaySec > terms.delayThresholdSec ? "ARRIVED_LATE_BEYOND_THRESHOLD" : "ARRIVED_WITHIN_THRESHOLD"],
    evidence: chosen,
    considered: relevant.length,
    preview: { arrivalTime, delaySec, payoutEligible: arrivalTime > terms.agreedArrivalDeadline + terms.delayThresholdSec },
    latestEta,
  };
}
