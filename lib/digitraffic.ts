import "server-only";
import { config } from "./config";
import {
  normaliseDigitrafficVisit,
  normaliseVesselFinderRows,
  type ArrivalEvidence,
  type DigitrafficVisit,
  type VesselFinderRow,
} from "../shared/evidence";
import { EVIDENCE_SOURCES, portInfo, portSource } from "../shared/ports";
import { SCENARIOS, observationAt, observationEvidence } from "../fixtures/scenarios";

// Evidence sources. Production: live Digitraffic (Finnish ports) or VesselFinder (Indian ports,
// needs VESSELFINDER_API_KEY). Replay: recorded/synthetic fixtures, enabled only with
// REPLAY_ENABLED=true and always labelled; replay never rewrites original timestamps.

export interface EvidenceFetch {
  origin: "live" | "recorded" | "synthetic";
  records: ArrivalEvidence[];
  /** Request URL without credentials, or "replay:<scenario>". */
  fetchedFrom: string;
  /** Evidence source id (e.g. "digitraffic.port-call.v2"). */
  source: string;
  error?: string;
}

/** Live arrival records for the vessel at the port, from the source that covers that port. */
export async function fetchLiveVisits(imo: string, locode: string, fromIso: string): Promise<EvidenceFetch> {
  const port = portInfo(locode);
  if (!port) return { origin: "live", records: [], fetchedFrom: "", source: "", error: `Port ${locode} is not supported` };
  return port.source === "vesselfinder" ? fetchVesselFinder(imo, port.locode, fromIso) : fetchDigitraffic(imo, port.locode, fromIso);
}

/** GET /api/port-call/v2/visits?imo=&portOfCall=&fromDateTime= (gzip + Digitraffic-User required). */
async function fetchDigitraffic(imo: string, locode: string, fromIso: string): Promise<EvidenceFetch> {
  const source = EVIDENCE_SOURCES.digitraffic.id;
  const url = new URL("/api/port-call/v2/visits", config.digitrafficBaseUrl());
  url.searchParams.set("imo", imo);
  url.searchParams.set("portOfCall", locode);
  url.searchParams.set("fromDateTime", fromIso);
  const retrievedAt = new Date().toISOString();
  try {
    const res = await fetch(url, {
      headers: { "Accept-Encoding": "gzip", "Digitraffic-User": config.digitrafficUser(), Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { origin: "live", records: [], fetchedFrom: url.toString(), source, error: `HTTP ${res.status}` };
    const visits = (await res.json()) as DigitrafficVisit[];
    return { origin: "live", records: visits.map((v) => normaliseDigitrafficVisit(v, retrievedAt, "live")), fetchedFrom: url.toString(), source };
  } catch (err) {
    return { origin: "live", records: [], fetchedFrom: url.toString(), source, error: (err as Error).message };
  }
}

/** "YYYY-MM-DD HH:MM:SS" in UTC, the VesselFinder date format. */
export const vesselFinderDate = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace("T", " ");

/**
 * GET /portcalls?userkey=&imo=&event=arrival&anchorage=0&fromdate=&todate=
 * Queried by IMO (VesselFinder ignores imo when locode is given), then filtered to the port.
 * anchorage=0: waiting at an outer anchorage is not arrival under the policy wording.
 */
async function fetchVesselFinder(imo: string, locode: string, fromIso: string): Promise<EvidenceFetch> {
  const source = EVIDENCE_SOURCES.vesselfinder.id;
  const url = new URL("/portcalls", config.vesselFinderBaseUrl());
  url.searchParams.set("imo", imo);
  url.searchParams.set("event", "arrival");
  url.searchParams.set("anchorage", "0");
  url.searchParams.set("fromdate", vesselFinderDate(fromIso));
  url.searchParams.set("todate", vesselFinderDate(new Date().toISOString()));
  const fetchedFrom = url.toString();
  const key = config.vesselFinderApiKey();
  if (!key) return { origin: "live", records: [], fetchedFrom, source, error: "VesselFinder API key is not configured" };
  url.searchParams.set("userkey", key);
  const retrievedAt = new Date().toISOString();
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { origin: "live", records: [], fetchedFrom, source, error: `HTTP ${res.status}` };
    const body = (await res.json()) as VesselFinderRow[] | { error?: string };
    if (!Array.isArray(body)) return { origin: "live", records: [], fetchedFrom, source, error: body?.error ?? "Unexpected response" };
    const records = normaliseVesselFinderRows(body, retrievedAt, "live").filter((r) => r.portLocode === locode);
    return { origin: "live", records, fetchedFrom, source };
  } catch (err) {
    return { origin: "live", records: [], fetchedFrom, source, error: (err as Error).message };
  }
}

export function replayScenarioForImo(imo: string, voyageRef?: string) {
  return SCENARIOS.find((s) => s.shipment.vesselImo === imo && (!voyageRef || s.shipment.voyageRef === voyageRef)) ?? null;
}

/** Replay: observation visible at the demo clock for the scenario matching this vessel/voyage. */
export function replayVisits(imo: string, voyageRef: string, clockIso: string): EvidenceFetch {
  if (!config.replayEnabled()) throw new Error("Replay sources are disabled in this environment");
  const s = replayScenarioForImo(imo, voyageRef);
  if (!s) return { origin: "synthetic", records: [], fetchedFrom: "replay:none", source: "replay:none" };
  const obs = observationAt(s, clockIso);
  return {
    origin: s.label,
    records: obs ? observationEvidence(obs, s.label) : [],
    fetchedFrom: `replay:${s.id}`,
    source: portSource(s.shipment.destinationLocode)?.id ?? "replay",
  };
}
