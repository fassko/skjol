// One encrypted Swarm upload + Arkiv shipment write for prize docs.
// Usage: node --env-file=.env.local --import tsx scripts/swarm-prize-demo.mts
import { readFileSync } from "node:fs";
import { getAddress } from "viem";
import { createShipment } from "../lib/insurance";
import { swarmLink, swarmMode } from "../lib/swarm";

const owner = getAddress(process.env.DEMO_OWNER ?? "0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F");
const samplePath = new URL("../fixtures/documents/bl-baltic-wren.txt", import.meta.url);
let bytes: Uint8Array;
try {
  bytes = new Uint8Array(readFileSync(samplePath));
} catch {
  bytes = new TextEncoder().encode(
    [
      "BILL OF LADING",
      "Vessel: BALTIC WREN",
      "IMO: 9123456",
      "Voyage: BW-HEL-01",
      "Port of loading: Rotterdam",
      "Port of discharge: FIHEL",
      "Shipped on board: 2026-03-01",
      "Agreed arrival: 2026-03-10",
    ].join("\n"),
  );
}

console.log("swarm mode:", swarmMode());
const r = await createShipment({
  owner,
  fileName: "bl-baltic-wren.txt",
  bytes,
  dataLabel: "synthetic",
});

const ciphertextUrl = swarmLink(r.document);
console.log(
  JSON.stringify(
    {
      shipmentId: r.shipmentId,
      arkivKey: r.arkivKey,
      arkivUrl: r.arkivKey ? `https://rabdi.explorer.arkiv.network/entity/${r.arkivKey}` : null,
      swarmMode: r.document.mode,
      swarmReference: r.document.reference,
      tagUid: r.document.tagUid,
      ciphertextUrl,
      size: r.document.size,
    },
    null,
    2,
  ),
);
