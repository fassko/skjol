import { NextResponse, connection } from "next/server";
import { config } from "@/lib/config";
import { replayScenarioForImo } from "@/lib/digitraffic";
import { store } from "@/lib/store";
import { observationAt } from "@/fixtures/scenarios";
import { DIGITRAFFIC_SOURCE, type ArrivalEvidence } from "@/shared/evidence";

// REPLAY SOURCE — synthetic/recorded data only, always labelled. Mirrors the Digitraffic v2 visits
// response (array of visits) and adds `skjolReplay: { retrievedAt, label }` to each visit so
// consumers keep the ORIGINAL retrieval time. Disabled unless REPLAY_ENABLED=true.
// Sources, in order: fixture scenarios (fixed timestamps, filtered by `clock`), then synthetic demo
// arrivals recorded in Arkiv for the 2-minute demo product.
export async function GET(req: Request) {
  await connection();
  if (!config.replayEnabled()) return NextResponse.json({ error: "Replay disabled" }, { status: 404 });
  const u = new URL(req.url);
  const imo = u.searchParams.get("imo") ?? "";
  const port = (u.searchParams.get("portOfCall") ?? "").toUpperCase();
  const clock = u.searchParams.get("clock") ?? new Date().toISOString();
  const clockMs = Date.parse(clock);

  const s = replayScenarioForImo(imo, u.searchParams.get("voyage") ?? undefined);
  const obs = s ? observationAt(s, clock) : null;
  const fixtureVisits = (obs?.visits ?? [])
    .filter((v) => !port || v.portOfCall === port)
    .map((v) => ({ ...v, skjolReplay: { retrievedAt: obs!.retrievedAt, label: s!.label } }));

  const synthetic = /^\d{7}$/.test(imo) && port ? await store().listSyntheticObservations(Number(imo), port) : [];
  const syntheticVisits = synthetic
    .filter((o) => o.retrievedAtSec * 1000 <= clockMs)
    .map((o) => JSON.parse(o.record) as ArrivalEvidence)
    .filter((e) => e.source === DIGITRAFFIC_SOURCE)
    .map((e) => {
      return {
        visitId: e.sourceRecordId,
        vesselId: e.vesselImo ?? undefined,
        portOfCall: e.portLocode,
        eta: e.latestEta ?? undefined,
        ata: e.eventTimestamp ?? undefined,
        status: e.sourceStatus,
        updateTime: e.sourceUpdatedAt,
        skjolReplay: { retrievedAt: e.retrievedAt, label: "synthetic" as const },
      };
    });

  return NextResponse.json([...fixtureVisits, ...syntheticVisits], { headers: { "x-skjol-data-label": "replay", "cache-control": "no-store" } });
}
