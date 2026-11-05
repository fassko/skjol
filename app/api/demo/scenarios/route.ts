import { connection } from "next/server";
import { handle } from "@/lib/http";
import { config } from "@/lib/config";
import { SCENARIOS, DEMO_EPOCH } from "@/fixtures/scenarios";

export const GET = handle(async () => {
  await connection();
  return {
  replayEnabled: config.replayEnabled(),
  epoch: DEMO_EPOCH,
  scenarios: SCENARIOS.map((s) => ({ id: s.id, title: s.title, expected: s.expected, document: s.document, label: s.label, shipment: s.shipment, evaluateAt: s.evaluateAt, observations: s.observations })),
  };
});
