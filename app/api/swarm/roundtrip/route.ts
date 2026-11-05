import { randomUUID } from "node:crypto";
import { handle } from "@/lib/http";
import { readBeeTag, readDocument, storeDocument, swarmLabel, swarmLink } from "@/lib/swarm";

// Demonstrates one encrypted upload + authorised read with a synthetic sample (no customer data).
export const POST = handle(async () => {
  const id = `roundtrip_${randomUUID().slice(0, 8)}`;
  const sample = new TextEncoder().encode(`SYNTHETIC SAMPLE ${new Date().toISOString()} — Skjol Swarm round trip`);
  const t0 = Date.now();
  const doc = await storeDocument(id, sample);
  const t1 = Date.now();
  const back = await readDocument(id, doc);
  const t2 = Date.now();
  const tag = doc.tagUid != null ? await readBeeTag(doc.tagUid) : null;
  return {
    storage: swarmLabel(doc.mode),
    mode: doc.mode,
    reference: doc.reference,
    tagUid: doc.tagUid,
    tagSynced: tag ? tag.synced >= tag.processed && tag.processed > 0 : null,
    tag: tag,
    ciphertextUrl: swarmLink(doc),
    note: "The reference points to AES-256-GCM ciphertext; the key is derived server-side and never stored on Swarm or Arkiv. Uploads use a postage stamp batch and a Bee tag (upload label).",
    plaintextMatches: new TextDecoder().decode(back) === new TextDecoder().decode(sample),
    uploadMs: t1 - t0,
    readMs: t2 - t1,
  };
});
