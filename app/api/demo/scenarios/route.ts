import { connection } from "next/server";
import { handle } from "@/lib/http";
import { config } from "@/lib/config";
import { SCENARIOS, DEMO_EPOCH, observationEvidence } from "@/fixtures/scenarios";
import { portInfo, portSource } from "@/shared/ports";

export const GET = handle(async () => {
  await connection();
  return {
  replayEnabled: config.replayEnabled(),
  epoch: DEMO_EPOCH,
  scenarios: SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    expected: s.expected,
    document: s.document,
    label: s.label,
    shipment: s.shipment,
    port: portInfo(s.shipment.destinationLocode),
    source: portSource(s.shipment.destinationLocode),
    evaluateAt: s.evaluateAt,
    observations: s.observations.map((o) => ({ retrievedAt: o.retrievedAt, raw: o, records: observationEvidence(o, s.label) })),
  })),
  };
});
