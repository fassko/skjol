import "server-only";
import { config } from "./config";
import { fetchLiveVisits, replayScenarioForImo, replayVisits, type EvidenceFetch } from "./digitraffic";
import { HttpError } from "./session";
import { SUPPORTED_PORTS, isValidImo, normaliseLocode } from "../shared/products";

// Data behind Skjol's paid x402 endpoints. Informational only: cover prices and payouts come
// from the fixed product rules, never from this signal.

const LOOKBACK_DAYS = 180;
const HOUR = 3600_000;

export function parseVesselQuery(url: URL) {
  const imo = (url.searchParams.get("imo") ?? "").trim();
  const port = normaliseLocode(url.searchParams.get("port") ?? "");
  if (!isValidImo(imo)) throw new HttpError(400, "imo must be a valid 7-digit IMO number");
  if (!SUPPORTED_PORTS[port]) throw new HttpError(400, `port must be one of ${Object.keys(SUPPORTED_PORTS).join(", ")}`);
  const deadlineRaw = url.searchParams.get("deadline");
  const deadline = deadlineRaw ? Date.parse(deadlineRaw) : null;
  if (deadlineRaw && !Number.isFinite(deadline)) throw new HttpError(400, "deadline must be an ISO 8601 date");
  return { imo, port, deadline };
}

/** Live source for the port first; synthetic demo vessels fall back to the labelled replay fixtures. */
export async function vesselArrivals(imo: string, port: string): Promise<EvidenceFetch & { port: string; portName: string }> {
  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * HOUR).toISOString();
  let fetched = await fetchLiveVisits(imo, port, from);
  if (!fetched.records.length && config.replayEnabled()) {
    const scenario = replayScenarioForImo(imo);
    // Replay fixtures run on their own demo clock; show the first observation (vessel en route).
    if (scenario) fetched = replayVisits(imo, scenario.shipment.voyageRef, scenario.evaluateAt[0] ?? new Date().toISOString());
  }
  return { ...fetched, records: fetched.records.filter((r) => r.portLocode === port), port, portName: SUPPORTED_PORTS[port] };
}

export async function delayRisk(imo: string, port: string, deadline: number | null) {
  const a = await vesselArrivals(imo, port);
  if (a.error) throw new HttpError(502, `Port-call source unavailable: ${a.error}`);
  const arrived = a.records.filter((r) => r.eventTimestamp && r.latestEta);
  const etaErrorsH = arrived.map((r) => Math.abs(Date.parse(r.eventTimestamp!) - Date.parse(r.latestEta!)) / HOUR);
  const meanEtaErrorHours = etaErrorsH.length ? round(etaErrorsH.reduce((x, y) => x + y, 0) / etaErrorsH.length) : null;
  const upcoming = a.records
    .filter((r) => !r.eventTimestamp && r.latestEta)
    .sort((x, y) => Date.parse(x.latestEta!) - Date.parse(y.latestEta!))[0];
  const latestEta = upcoming?.latestEta ?? null;
  const etaVsDeadlineHours = latestEta && deadline ? round((Date.parse(latestEta) - deadline) / HOUR) : null;
  // Band: ETA already beyond the 24 h cover threshold -> high; within the ETA error margin of the
  // deadline -> elevated; otherwise low. Unknown when there is no upcoming call or no deadline.
  const margin = Math.max(meanEtaErrorHours ?? 6, 2);
  const band =
    etaVsDeadlineHours === null ? "unknown" : etaVsDeadlineHours > 24 ? "high" : etaVsDeadlineHours > -margin ? "elevated" : "low";
  return {
    vesselImo: imo,
    port,
    portName: a.portName,
    origin: a.origin,
    band,
    latestEta,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    etaVsDeadlineHours,
    recentCalls: arrived.length,
    meanEtaErrorHours,
    note: "Informational signal from port-call data. Skjol cover premiums and payouts are fixed by product rules and do not depend on this band.",
    source: a.fetchedFrom.startsWith("replay:") ? a.fetchedFrom : a.source,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
