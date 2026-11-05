/**
 * Live Swarm + Arkiv demo for prize docs. Skips unless RUN_SWARM_PRIZE_DEMO=1.
 * Usage: RUN_SWARM_PRIZE_DEMO=1 pnpm exec vitest run tests/swarm-prize-demo.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

const run = process.env.RUN_SWARM_PRIZE_DEMO === "1";

describe.runIf(run)("swarm prize demo (live)", () => {
  it(
    "uploads ciphertext to Swarm and writes a shipment entity on Arkiv",
    async () => {
      const { createShipment } = await import("../lib/insurance");
      const { swarmLink, swarmMode } = await import("../lib/swarm");
      const owner = getAddress(process.env.DEMO_OWNER ?? "0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F");
      const bytes = new Uint8Array(readFileSync("fixtures/documents/bl-baltic-wren.txt"));
      const r = await createShipment({
        owner,
        fileName: "bl-baltic-wren.txt",
        bytes,
        dataLabel: "synthetic",
      });
      const ciphertextUrl = swarmLink(r.document);
      const out = {
        shipmentId: r.shipmentId,
        arkivKey: r.arkivKey,
        arkivUrl: r.arkivKey ? `https://rabdi.explorer.arkiv.network/entity/${r.arkivKey}` : null,
        swarmMode: swarmMode(),
        documentMode: r.document.mode,
        swarmReference: r.document.reference,
        tagUid: r.document.tagUid,
        ciphertextUrl,
        size: r.document.size,
      };
      // eslint-disable-next-line no-console
      console.log("SWARM_PRIZE_DEMO_RESULT", JSON.stringify(out));
      expect(r.arkivKey).toBeTruthy();
      expect(r.document.reference).toMatch(/^[0-9a-f]{64}$/);
      expect(r.document.mode).not.toBe("local-dev");
      expect(ciphertextUrl).toContain(r.document.reference);
    },
    120_000,
  );
});
