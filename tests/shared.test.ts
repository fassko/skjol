import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessEvidence, normaliseDigitrafficVisit, type DigitrafficVisit } from "../shared/evidence";
import { PRODUCTS, checkEligibility, isValidImo, locodeToBytes32, policyTerms } from "../shared/products";
import { decodeArrivalReport, encodeArrivalReport } from "../shared/report";
import { SCENARIOS, observationAt } from "../fixtures/scenarios";

const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function termsFor(id: string) {
  const s = SCENARIOS.find((x) => x.id === id)!;
  const p = PRODUCTS[s.productId];
  return {
    scenario: s,
    terms: {
      vesselImo: s.shipment.vesselImo,
      destinationLocode: s.shipment.destinationLocode,
      earliestArrival: sec(s.shipment.departureDate),
      agreedArrivalDeadline: sec(s.shipment.agreedArrivalDeadline),
      delayThresholdSec: p.delayThresholdSec,
    },
  };
}

function assessScenario(id: string, clockIndex = 0) {
  const { scenario, terms } = termsFor(id);
  const clock = scenario.evaluateAt[clockIndex];
  const obs = observationAt(scenario, clock);
  const records = obs ? obs.visits.map((v) => normaliseDigitrafficVisit(v, obs.retrievedAt, "synthetic")) : [];
  return assessEvidence(terms, records, sec(clock));
}

describe("products & eligibility", () => {
  it("validates IMO check digits (real and synthetic)", () => {
    expect(isValidImo("9468891")).toBe(true); // Finnsea (recorded Digitraffic record)
    expect(isValidImo("9393266")).toBe(true); // Delfborg (recorded Digitraffic record)
    expect(isValidImo("9700017")).toBe(true);
    expect(isValidImo("9700018")).toBe(false);
    expect(isValidImo("970001")).toBe(false);
  });

  it("rejects unsupported ports, too-soon deadlines and disabled demo products", () => {
    const s = SCENARIOS[0].shipment;
    const now = sec("2026-12-01T00:00:00Z");
    expect(checkEligibility(s, PRODUCTS["delay-standard-24h"], now, { demoProductsEnabled: false })).toEqual([]);
    const issues = checkEligibility(
      { ...s, destinationLocode: "DEHAM", agreedArrivalDeadline: "2026-12-02T00:00:00Z", departureDate: "2026-12-01T06:00:00Z" },
      PRODUCTS["demo-fast-2m"],
      now,
      { demoProductsEnabled: false },
    );
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["PRODUCT_DISABLED", "UNSUPPORTED_PORT"]));
    expect(
      checkEligibility({ ...s }, PRODUCTS["delay-standard-24h"], sec("2026-12-08T13:00:00Z"), { demoProductsEnabled: false }).map((i) => i.code),
    ).toContain("TOO_SOON");
  });

  it("states that vessel arrival is not delivery", () => {
    const t = policyTerms({ product: PRODUCTS["delay-standard-24h"], vesselName: "X", vesselImo: "9700017", destinationLocode: "FIHEL", agreedArrivalDeadline: "2026-12-10T12:00:00Z" });
    expect(t).toMatch(/Not covered: container unloading/);
    expect(t).toMatch(/more than 24 hours/);
  });
});

describe("evidence assessment (synthetic scenarios)", () => {
  it("on time -> confirmed, not eligible", () => {
    const a = assessScenario("on-time");
    expect(a.status).toBe("ARRIVAL_CONFIRMED");
    expect(a.preview?.payoutEligible).toBe(false);
  });

  it("late -> confirmed, eligible", () => {
    const a = assessScenario("late");
    expect(a.status).toBe("ARRIVAL_CONFIRMED");
    expect(a.preview?.payoutEligible).toBe(true);
    expect(a.preview!.delaySec).toBe(30 * 3600 + 40 * 60);
  });

  it("missing then stale -> pending both times, original timestamps unchanged", () => {
    const first = assessScenario("missing-stale", 0);
    expect(first.status).toBe("PENDING_NO_ARRIVAL");
    expect(first.latestEta).toBe("2026-12-12T09:00:00.000Z");
    const second = assessScenario("missing-stale", 1);
    expect(second.status).toBe("PENDING_STALE");
    const obs = SCENARIOS.find((s) => s.id === "missing-stale")!.observations[0];
    expect(obs.retrievedAt).toBe("2026-12-11T14:00:00Z");
  });

  it("conflicting -> pending with conflict reason", () => {
    const a = assessScenario("conflicting");
    expect(a.status).toBe("PENDING_CONFLICT");
    expect(a.reasons.join(",")).toMatch(/ARRIVAL_TIME_BUT_STATUS_EXPECTED/);
  });

  it("replay never shows observations from after the demo clock", () => {
    const s = SCENARIOS.find((x) => x.id === "late")!;
    expect(observationAt(s, "2026-12-11T18:59:59Z")).toBeNull();
  });

  it("exact threshold boundary is not eligible; +1s is", () => {
    const { terms } = termsFor("late");
    const mk = (ata: string) =>
      normaliseDigitrafficVisit(
        { visitId: "B", vesselId: terms.vesselImo, portOfCall: terms.destinationLocode, ata, status: "Arrived", updateTime: ata },
        ata,
        "synthetic",
      );
    const at = new Date((terms.agreedArrivalDeadline + 86400) * 1000).toISOString();
    const over = new Date((terms.agreedArrivalDeadline + 86401) * 1000).toISOString();
    expect(assessEvidence(terms, [mk(at)], terms.agreedArrivalDeadline + 86400 + 60).preview?.payoutEligible).toBe(false);
    expect(assessEvidence(terms, [mk(over)], terms.agreedArrivalDeadline + 86401 + 60).preview?.payoutEligible).toBe(true);
  });
});

describe("evidence assessment (recorded Digitraffic data, CC BY 4.0 Fintraffic)", () => {
  const recorded: DigitrafficVisit[] = JSON.parse(
    readFileSync(new URL("../fixtures/digitraffic/visits-departed-2026-11-05.json", import.meta.url), "utf8"),
  );

  it("normalises a real v2 visit (DELFBORG at Kokkola)", () => {
    const v = recorded.find((r) => r.vesselName === "DELFBORG")!;
    const e = normaliseDigitrafficVisit(v, "2026-11-05T05:21:45Z", "recorded");
    expect(e.vesselImo).toBe("9393266");
    expect(e.portLocode).toBe("FIKOK");
    expect(e.eventTimestamp).toBe("2026-10-29T08:40:00.000Z");
    expect(e.digest).toMatch(/^0x[0-9a-f]{64}$/);
    // Digest ignores retrieval time so repeated fetches of identical records match.
    expect(normaliseDigitrafficVisit(v, "2026-11-06T00:00:00Z", "recorded").digest).toBe(e.digest);
  });

  it("confirms the recorded arrival for a policy that sailed before it", () => {
    const v = recorded.find((r) => r.vesselName === "DELFBORG")!;
    const e = normaliseDigitrafficVisit(v, "2026-11-05T05:21:45Z", "recorded");
    const a = assessEvidence(
      { vesselImo: "9393266", destinationLocode: "FIKOK", earliestArrival: sec("2026-10-22T00:00:00Z"), agreedArrivalDeadline: sec("2026-10-29T00:00:00Z"), delayThresholdSec: 86400 },
      [e],
      sec("2026-11-05T05:30:00Z"),
    );
    expect(a.status).toBe("ARRIVAL_CONFIRMED");
    expect(a.preview?.payoutEligible).toBe(false); // 8h40m late: within 24h
  });

  it("flags a recorded arrival that predates sailing as conflicting", () => {
    const v = recorded.find((r) => r.vesselName === "DELFBORG")!;
    const e = normaliseDigitrafficVisit({ ...v, eta: "2026-11-10T00:00:00.000Z" }, "2026-11-05T05:21:45Z", "recorded");
    const a = assessEvidence(
      { vesselImo: "9393266", destinationLocode: "FIKOK", earliestArrival: sec("2026-11-01T00:00:00Z"), agreedArrivalDeadline: sec("2026-11-12T00:00:00Z"), delayThresholdSec: 86400 },
      [e],
      sec("2026-11-05T05:30:00Z"),
    );
    expect(a.status).toBe("PENDING_CONFLICT");
  });
});

describe("report encoding", () => {
  it("round-trips and binds chain, pool and policy", () => {
    const s = SCENARIOS.find((x) => x.id === "late")!;
    const obs = s.observations[0];
    const ev = normaliseDigitrafficVisit(obs.visits[0], obs.retrievedAt, "synthetic");
    const data = encodeArrivalReport({
      chainId: 5042002n,
      pool: "0x000000000000000000000000000000000000dEaD",
      policyId: `0x${"11".repeat(32)}`,
      vesselImo: 9700029,
      destinationLocode: "FIKTK",
      evidence: ev,
    });
    const r = decodeArrivalReport(data);
    expect(r.chainId).toBe(5042002n);
    expect(r.destinationLocode).toBe(locodeToBytes32("FIKTK"));
    expect(r.arrivalTime).toBe(BigInt(sec("2026-12-11T18:40:00Z")));
    expect(r.observedAt).toBe(BigInt(sec("2026-12-11T19:00:00Z")));
    expect(r.evidenceDigest).toBe(ev.digest);
  });
});
