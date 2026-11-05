import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { extractShipment, parseDocDate } from "../lib/ai/extract";

const doc = (f: string) => readFileSync(new URL(`../fixtures/documents/${f}`, import.meta.url), "utf8");

beforeAll(() => {
  delete process.env.AI_GATEWAY_API_KEY; // deterministic offline extractor
  delete process.env.VERCEL_OIDC_TOKEN;
});

describe("document extraction (offline rules)", () => {
  it("parses common date formats", () => {
    expect(parseDocDate("2 December 2026 08:00 UTC")).toBe("2026-12-02T08:00:00.000Z");
    expect(parseDocDate("02.12.2026 08:00 UTC")).toBe("2026-12-02T08:00:00.000Z");
    expect(parseDocDate("10 December 2026, 12:00 UTC")).toBe("2026-12-10T12:00:00.000Z");
  });

  it("extracts a bill of lading with excerpts and page references", async () => {
    const x = await extractShipment(doc("bl-baltic-wren.txt"));
    expect(x.fields.vesselName.value).toBe("BALTIC WREN");
    expect(x.fields.vesselImo.value).toBe("9700017");
    expect(x.fields.voyageRef.value).toBe("BW-2648E");
    expect(x.fields.destinationLocode.value).toBe("FIHEL");
    expect(x.fields.departureDate.value).toBe("2026-12-02T08:00:00.000Z");
    expect(x.fields.agreedArrivalDeadline.value).toBe("2026-12-10T12:00:00.000Z");
    expect(x.fields.agreedArrivalDeadline.page).toBe(2);
    expect(x.fields.vesselImo.sourceExcerpt).toContain("IMO: 9700017");
    expect(x.issues.filter((i) => i.kind !== "unverified")).toEqual([]);
  });

  it("ignores prompt-injection text and never invents amounts", async () => {
    const x = await extractShipment(doc("bl-nordic-tern.txt"));
    expect(x.fields.vesselName.value).toBe("NORDIC TERN");
    expect(x.fields.voyageRef.value).toBe("NT-0912N");
    expect(x.fields.destinationLocode.value).toBe("FIKTK");
    expect(JSON.stringify(x)).not.toMatch(/1,000,000/);
  });

  it("flags missing LOCODE-less ports and an ETA that is not a deadline", async () => {
    const x = await extractShipment(doc("bl-aurora-skerry.txt"));
    expect(x.fields.eta.value).toBe("2026-12-09T18:00:00.000Z");
    expect(x.fields.agreedArrivalDeadline.value).toBe("2026-12-10T12:00:00.000Z");
    expect(x.fields.destinationLocode.value).toBe("FITKU");
  });

  it("extracts an Indian destination (Nhava Sheva) as a supported port", async () => {
    const x = await extractShipment(doc("bl-indus-heron.txt"));
    expect(x.fields.vesselName.value).toBe("INDUS HERON");
    expect(x.fields.vesselImo.value).toBe("9700055");
    expect(x.fields.voyageRef.value).toBe("IH-118W");
    expect(x.fields.destinationLocode.value).toBe("INNSA");
    expect(x.fields.agreedArrivalDeadline.value).toBe("2026-12-10T12:00:00.000Z");
    expect(x.fields.eta.value).toBe("2026-12-09T22:00:00.000Z");
    expect(x.issues.filter((i) => i.field === "destinationLocode")).toEqual([]);
  });

  it("flags conflicting vessel, IMO and port", async () => {
    const x = await extractShipment(doc("bl-conflicting-imo.txt"));
    const conflicted = x.issues.filter((i) => i.kind === "conflicting").map((i) => i.field);
    expect(conflicted).toEqual(expect.arrayContaining(["vesselImo", "vesselName", "destinationLocode"]));
    expect(x.fields.vesselImo.status).toBe("conflicting");
    expect(x.issues.some((i) => i.field === "agreedArrivalDeadline" && i.kind === "missing")).toBe(true);
  });
});
