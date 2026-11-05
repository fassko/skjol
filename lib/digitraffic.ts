import "server-only";
import { config } from "./config";
import { normaliseDigitrafficVisit, type ArrivalEvidence, type DigitrafficVisit } from "../shared/evidence";
import { SCENARIOS, observationAt } from "../fixtures/scenarios";

// Evidence sources. Production: live Digitraffic. Replay: recorded/synthetic fixtures, enabled only
// with REPLAY_ENABLED=true and always labelled; replay never rewrites original timestamps.

export interface EvidenceFetch {
  origin: "live" | "recorded" | "synthetic";
  records: ArrivalEvidence[];
  fetchedFrom: string;
  error?: string;
}

/** Live: GET /api/port-call/v2/visits?imo=&portOfCall=&fromDateTime= (gzip + Digitraffic-User required). */
export async function fetchLiveVisits(imo: string, locode: string, fromIso: string): Promise<EvidenceFetch> {
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
    if (!res.ok) return { origin: "live", records: [], fetchedFrom: url.toString(), error: `HTTP ${res.status}` };
    const visits = (await res.json()) as DigitrafficVisit[];
    return { origin: "live", records: visits.map((v) => normaliseDigitrafficVisit(v, retrievedAt, "live")), fetchedFrom: url.toString() };
  } catch (err) {
    return { origin: "live", records: [], fetchedFrom: url.toString(), error: (err as Error).message };
  }
}

export function replayScenarioForImo(imo: string, voyageRef?: string) {
  return SCENARIOS.find((s) => s.shipment.vesselImo === imo && (!voyageRef || s.shipment.voyageRef === voyageRef)) ?? null;
}

/** Replay: observation visible at the demo clock for the scenario matching this vessel/voyage. */
export function replayVisits(imo: string, voyageRef: string, clockIso: string): EvidenceFetch {
  if (!config.replayEnabled()) throw new Error("Replay sources are disabled in this environment");
  const s = replayScenarioForImo(imo, voyageRef);
  if (!s) return { origin: "synthetic", records: [], fetchedFrom: "replay:none" };
  const obs = observationAt(s, clockIso);
  return {
    origin: s.label,
    records: obs ? obs.visits.map((v) => normaliseDigitrafficVisit(v, obs.retrievedAt, s.label)) : [],
    fetchedFrom: `replay:${s.id}`,
  };
}
