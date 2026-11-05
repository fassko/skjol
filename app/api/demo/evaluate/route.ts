import { handle } from "@/lib/http";
import { HttpError } from "@/lib/session";
import { SCENARIOS, observationAt, observationEvidence } from "@/fixtures/scenarios";
import { assessEvidence } from "@/shared/evidence";
import { PRODUCTS, SUPPORTED_PORTS } from "@/shared/products";
import { rulesExplanation } from "@/lib/ai/explain";
import { config } from "@/lib/config";

// Pure rules preview for a synthetic scenario at a chosen demo clock. Writes nothing, buys nothing.
export const POST = handle(async (req: Request) => {
  const { scenarioId, clock } = (await req.json()) as { scenarioId: string; clock: string };
  const s = SCENARIOS.find((x) => x.id === scenarioId);
  if (!s || !Number.isFinite(Date.parse(clock))) throw new HttpError(400, "Unknown scenario or invalid clock");
  const p = PRODUCTS[s.productId];
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const obs = observationAt(s, clock);
  const records = obs ? observationEvidence(obs, s.label) : [];
  const terms = { vesselImo: s.shipment.vesselImo, destinationLocode: s.shipment.destinationLocode, earliestArrival: sec(s.shipment.departureDate), agreedArrivalDeadline: sec(s.shipment.agreedArrivalDeadline), delayThresholdSec: p.delayThresholdSec };
  const a = assessEvidence(terms, records, sec(clock), config.maxEvidenceAgeSec());
  const explanation = rulesExplanation({
    vesselName: s.shipment.vesselName, vesselImo: s.shipment.vesselImo, port: SUPPORTED_PORTS[s.shipment.destinationLocode] ?? s.shipment.destinationLocode, agreedArrivalDeadline: s.shipment.agreedArrivalDeadline,
    thresholdHours: p.delayThresholdSec / 3600, assessment: a.status, reasons: a.reasons, recordedArrival: a.evidence?.eventTimestamp ?? null, latestEta: a.latestEta,
    delayHours: a.preview ? a.preview.delaySec / 3600 : null, payoutEligible: a.preview?.payoutEligible ?? null, payoutUsdc: "5.00", dataLabel: "synthetic",
  });
  return { scenarioId, clock, observationRetrievedAt: obs?.retrievedAt ?? null, assessment: a, explanation, wouldSubmitReport: a.status === "ARRIVAL_CONFIRMED" };
});
