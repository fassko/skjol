import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { config, optionalAccount } from "./config";

// Wallet sessions: the customer signs a short message; we issue an HMAC-signed cookie.
// Viewing or decrypting a shipment requires the session address to own it.

const COOKIE = "skjol_session";
const TTL_SEC = 12 * 3600;

export interface Session {
  address: Address;
  demo: boolean;
  exp: number;
}

function sign(payload: string) {
  return createHmac("sha256", Buffer.from(config.sessionSecret().replace(/^0x/, ""), "hex")).update(payload).digest("base64url");
}

export function signInMessage(address: string, issuedAt: string) {
  return `Sign in to Skjol shipment cover\nAddress: ${getAddress(address)}\nIssued at: ${issuedAt}\nThis signature only proves wallet ownership. It cannot move funds.`;
}

export async function createSession(address: Address, demo: boolean) {
  const s: Session = { address: getAddress(address), demo, exp: Math.floor(Date.now() / 1000) + TTL_SEC };
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SEC,
  });
  return s;
}

export async function verifyWalletSignIn(address: Address, issuedAt: string, signature: Hex) {
  const age = Date.now() - Date.parse(issuedAt);
  if (!(age >= -60_000 && age < 10 * 60_000)) throw new Error("Sign-in message expired");
  const ok = await verifyMessage({ address, message: signInMessage(address, issuedAt), signature });
  if (!ok) throw new Error("Invalid signature");
  return createSession(address, false);
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  return s.exp > Date.now() / 1000 ? s : null;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Please connect your wallet first.");
  return s;
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export function demoCustomer() {
  return config.demoCustomerEnabled() ? optionalAccount("DEMO_CUSTOMER_PRIVATE_KEY") : null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
