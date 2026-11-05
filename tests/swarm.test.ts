import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("swarm storeDocument", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env.SKJOL_MASTER_KEY = process.env.SKJOL_MASTER_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.SWARM_MODE = "local-dev";
    delete process.env.SWARM_POSTAGE_BATCH_ID;
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("encrypts, stores, and reads back in local-dev without a postage batch", async () => {
    const { storeDocument, readDocument, storageSummary, swarmLink } = await import("../lib/swarm");
    const id = "shp_test_local";
    const sample = new TextEncoder().encode("synthetic bol for swarm prize");
    const doc = await storeDocument(id, sample);
    expect(doc.mode).toBe("local-dev");
    expect(doc.tagUid).toBeNull();
    expect(doc.reference).toMatch(/^[0-9a-f]{64}$/);
    expect(swarmLink(doc)).toBeNull();
    const back = await readDocument(id, doc);
    expect(new TextDecoder().decode(back)).toBe("synthetic bol for swarm prize");
    expect(storageSummary(doc).label).toContain("NOT Swarm");
  });

  it("requires postage batch and creates a Bee tag for gateway uploads", async () => {
    process.env.SWARM_MODE = "gateway";
    process.env.SWARM_API_URL = "https://swarm.test";
    process.env.SWARM_POSTAGE_BATCH_ID = "ab".repeat(32);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/tags") && init?.method === "POST") {
        return new Response(JSON.stringify({ uid: 42 }), { status: 201 });
      }
      if (url.endsWith("/bytes") && init?.method === "POST") {
        const headers = new Headers(init.headers);
        expect(headers.get("Swarm-Postage-Batch-Id")).toBe("ab".repeat(32));
        expect(headers.get("Swarm-Tag")).toBe("42");
        return new Response(JSON.stringify({ reference: "cd".repeat(32) }), { status: 201 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { storeDocument, swarmLink } = await import("../lib/swarm");
    const doc = await storeDocument("shp_gw", new TextEncoder().encode("cipher-me"));
    expect(doc.tagUid).toBe(42);
    expect(doc.reference).toBe("cd".repeat(32));
    expect(swarmLink(doc)).toBe("https://swarm.test/bytes/" + "cd".repeat(32));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("fails closed when bee mode has no postage batch", async () => {
    process.env.SWARM_MODE = "bee";
    delete process.env.SWARM_POSTAGE_BATCH_ID;
    const { storeDocument } = await import("../lib/swarm");
    await expect(storeDocument("shp_x", new Uint8Array([1]))).rejects.toThrow(/SWARM_POSTAGE_BATCH_ID/);
  });

  it("marks gateway prize-ready without a client-held batch", async () => {
    process.env.SWARM_MODE = "gateway";
    delete process.env.SWARM_POSTAGE_BATCH_ID;
    const { swarmPrizeReady } = await import("../lib/swarm");
    expect(swarmPrizeReady("gateway")).toBe(true);
    expect(swarmPrizeReady("local-dev")).toBe(false);
    expect(swarmPrizeReady("bee")).toBe(false);
  });
});
