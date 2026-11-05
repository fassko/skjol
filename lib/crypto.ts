import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { config } from "./config";

// Envelope: version(1) | iv(12) | tag(16) | ciphertext. AES-256-GCM.
// Keys are derived per purpose/record from SKJOL_MASTER_KEY (kept in env / Vercel secrets,
// never written to Arkiv or Swarm).
const VERSION = 1;

function masterKeyBytes(): Buffer {
  return Buffer.from(config.masterKey().replace(/^0x/, ""), "hex");
}

export function deriveKey(context: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKeyBytes(), Buffer.from("skjol-v1"), Buffer.from(context), 32));
}

export function seal(plaintext: Uint8Array, context: string): Uint8Array {
  const key = deriveKey(context);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]));
}

export function open(envelope: Uint8Array, context: string): Uint8Array {
  const buf = Buffer.from(envelope);
  if (buf[0] !== VERSION) throw new Error("Unsupported envelope version");
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const ct = buf.subarray(29);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(context), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
}

export function sealJson(value: unknown, context: string): Uint8Array {
  return seal(new TextEncoder().encode(JSON.stringify(value)), context);
}

export function openJson<T>(envelope: Uint8Array, context: string): T {
  return JSON.parse(new TextDecoder().decode(open(envelope, context))) as T;
}

/** Opaque, keyed tag used as an indexed Arkiv attribute instead of a plaintext relationship. */
export function blindTag(kind: string, value: string): string {
  return createHmac("sha256", deriveKey("blind-index")).update(`${kind}:${value.toLowerCase()}`).digest("hex").slice(0, 40);
}
