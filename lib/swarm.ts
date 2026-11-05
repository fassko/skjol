import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { open, seal } from "./crypto";

// Documents are encrypted by the app (AES-256-GCM, key derived per shipment) BEFORE upload.
// We upload ciphertext as plain /bytes (no Swarm-Encrypt), so the Swarm reference is a 32-byte
// content address that does NOT contain a decryption key. The reference itself is then sealed
// before it is stored in Arkiv, so the public record does not reveal where the document lives.

export type SwarmMode = "gateway" | "bee" | "local-dev";

export interface StoredDocument {
  mode: SwarmMode;
  reference: string; // 64 hex chars
  sha256: string; // of plaintext
  size: number;
}

const docContext = (shipmentId: string) => `swarm-doc:${shipmentId}`;

export function swarmMode(): SwarmMode {
  return config.swarmMode();
}

export function swarmLabel(mode: SwarmMode): string {
  if (mode === "gateway") return "Swarm (public gateway api.gateway.ethswarm.org)";
  if (mode === "bee") return "Swarm (own Bee node)";
  return "Local development storage — NOT Swarm";
}

async function uploadBytes(cipher: Uint8Array): Promise<string> {
  const mode = swarmMode();
  if (mode === "local-dev") {
    const ref = createHash("sha256").update(cipher).digest("hex");
    const dir = path.join(process.env.VERCEL ? "/tmp" : process.cwd(), ".data", "local-dev-blobs");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, ref), cipher);
    return ref;
  }
  const headers: Record<string, string> = { "Content-Type": "application/octet-stream" };
  const batch = config.swarmBatchId();
  if (mode === "bee") {
    if (!batch) throw new Error("SWARM_POSTAGE_BATCH_ID is required for SWARM_MODE=bee");
    headers["Swarm-Postage-Batch-Id"] = batch;
  }
  const res = await fetch(`${config.swarmApiUrl()}/bytes`, { method: "POST", headers, body: Buffer.from(cipher) });
  if (!res.ok) throw new Error(`Swarm upload failed: HTTP ${res.status}`);
  const { reference } = (await res.json()) as { reference: string };
  if (!/^[0-9a-f]{64}$/.test(reference)) throw new Error("Unexpected Swarm reference format");
  return reference;
}

async function downloadBytes(reference: string, mode: SwarmMode): Promise<Uint8Array> {
  if (!/^[0-9a-f]{64}$/.test(reference)) throw new Error("Invalid reference");
  if (mode === "local-dev") {
    const dir = path.join(process.env.VERCEL ? "/tmp" : process.cwd(), ".data", "local-dev-blobs");
    return new Uint8Array(await readFile(path.join(dir, reference)));
  }
  const res = await fetch(`${config.swarmApiUrl()}/bytes/${reference}`);
  if (!res.ok) throw new Error(`Swarm download failed: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function storeDocument(shipmentId: string, plaintext: Uint8Array): Promise<StoredDocument> {
  const cipher = seal(plaintext, docContext(shipmentId));
  const reference = await uploadBytes(cipher);
  return {
    mode: swarmMode(),
    reference,
    sha256: createHash("sha256").update(plaintext).digest("hex"),
    size: plaintext.length,
  };
}

/** Authorised retrieval: callers must check the viewer owns the shipment before calling. */
export async function readDocument(shipmentId: string, doc: StoredDocument): Promise<Uint8Array> {
  const cipher = await downloadBytes(doc.reference, doc.mode);
  const plain = open(cipher, docContext(shipmentId));
  const digest = createHash("sha256").update(plain).digest("hex");
  if (digest !== doc.sha256) throw new Error("Document integrity check failed");
  return plain;
}

export function swarmLink(doc: StoredDocument): string | null {
  if (doc.mode === "local-dev") return null;
  return `${config.swarmApiUrl()}/bytes/${doc.reference}`;
}
