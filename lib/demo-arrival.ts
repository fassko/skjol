import "server-only";
import type { Hex } from "viem";
import { readPolicy } from "./chain";
import { config } from "./config";
import { HttpError } from "./session";
import { store } from "./store";
import { normaliseDigitrafficVisit, type DigitrafficVisit } from "../shared/evidence";
import { PRODUCTS } from "../shared/products";

// DEMO ONLY: records a SYNTHETIC port-call arrival for a policy on the 2-minute demo product, so the
// CRE workflow (replay config) can settle it on Arc Testnet in real time. Never for real products.
export async function recordSyntheticArrival(policyId: Hex, minutesAfterDeadline: number) {
  if (!config.replayEnabled() || !config.demoProductsEnabled()) throw new HttpError(404, "Demo arrivals are disabled here.");
  const p = await store().getPolicy(policyId);
  if (!p) throw new HttpError(404, "Policy not found");
  if (!PRODUCTS[p.productId as keyof typeof PRODUCTS]?.demoOnly) throw new HttpError(403, "Synthetic arrivals are only allowed for the demo product.");
  const onchain = await readPolicy(policyId);
  if (onchain.statusName !== "active") throw new HttpError(409, "Policy is already settled.");
  const nowMs = Date.now();
  const ataMs = (p.deadlineSec + Math.round(minutesAfterDeadline * 60)) * 1000;
  if (ataMs > nowMs) throw new HttpError(409, `That arrival time is still in the future (${new Date(ataMs).toISOString()}). Try again later or choose an earlier time.`);
  if (ataMs < Number(onchain.earliestArrival) * 1000) throw new HttpError(422, "Arrival cannot be before the sailing date.");
  const ata = new Date(ataMs).toISOString();
  const visit: DigitrafficVisit = {
    visitId: `SYN-${p.portLocode}-${policyId.slice(2, 10)}`,
    vesselId: String(p.vesselImo),
    portOfCall: p.portLocode,
    eta: new Date(p.deadlineSec * 1000).toISOString(),
    ata,
    status: "Arrived",
    updateTime: ata,
  };
  const retrievedAt = new Date(nowMs).toISOString();
  const ev = normaliseDigitrafficVisit(visit, retrievedAt, "synthetic");
  const r = await store().putObservation({
    observationId: `syn-${ev.digest.slice(2, 26)}`,
    policyId,
    digest: ev.digest,
    source: "replay:synthetic-demo",
    origin: "synthetic",
    vesselImo: p.vesselImo,
    portLocode: p.portLocode,
    eventTimeSec: Math.floor(ataMs / 1000),
    retrievedAtSec: Math.floor(nowMs / 1000),
    sourceStatus: "Arrived",
    record: JSON.stringify(ev),
  });
  return { observation: r.record.observationId, arkivKey: r.record.key, ata, retrievedAt, label: "synthetic" };
}
