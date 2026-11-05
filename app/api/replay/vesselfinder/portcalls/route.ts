import { NextResponse, connection } from "next/server";
import { config } from "@/lib/config";
import { replayScenarioForImo } from "@/lib/digitraffic";
import { store } from "@/lib/store";
import { observationAt } from "@/fixtures/scenarios";
import { VESSELFINDER_SOURCE, toVesselFinderRow, type ArrivalEvidence } from "@/shared/evidence";

// REPLAY SOURCE — synthetic data only, always labelled. Mirrors the VesselFinder `GET /portcalls`
// response (array of { PORTCALL }) queried by IMO, and adds `skjolReplay: { retrievedAt, label }` to
// each row so consumers keep the ORIGINAL retrieval time. Disabled unless REPLAY_ENABLED=true.
// Replay-only parameters: `port` (selects synthetic demo arrivals) and `clock` (demo clock).
export async function GET(req: Request) {
  await connection();
  if (!config.replayEnabled()) return NextResponse.json({ error: "Replay disabled" }, { status: 404 });
  const u = new URL(req.url);
  const imo = u.searchParams.get("imo") ?? "";
  const port = (u.searchParams.get("port") ?? "").toUpperCase();
  const event = (u.searchParams.get("event") ?? "").toUpperCase();
  const clock = u.searchParams.get("clock") ?? new Date().toISOString();
  const clockMs = Date.parse(clock);

  const s = replayScenarioForImo(imo, u.searchParams.get("voyage") ?? undefined);
  const obs = s ? observationAt(s, clock) : null;
  const fixtureRows = (obs?.portCalls ?? [])
    .filter((r) => !event || r.PORTCALL.EVENT.toUpperCase() === event)
    .map((r) => ({ ...r, skjolReplay: { retrievedAt: obs!.retrievedAt, label: s!.label } }));

  const synthetic = /^\d{7}$/.test(imo) && port ? await store().listSyntheticObservations(Number(imo), port) : [];
  const syntheticRows = synthetic
    .filter((o) => o.retrievedAtSec * 1000 <= clockMs)
    .map((o) => JSON.parse(o.record) as ArrivalEvidence)
    .filter((e) => e.source === VESSELFINDER_SOURCE)
    .map((e) => ({ ...toVesselFinderRow(e), skjolReplay: { retrievedAt: e.retrievedAt, label: "synthetic" as const } }));

  return NextResponse.json([...fixtureRows, ...syntheticRows], { headers: { "x-skjol-data-label": "replay", "cache-control": "no-store" } });
}
