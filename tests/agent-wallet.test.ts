import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "../lib/store/memory";
import { setStoreForTests } from "../lib/store";
import { checkSpend, issueApproval, ownerTagOf, saveAgentLimits, verifyApproval } from "../lib/agent-wallet";
import type { Session } from "../lib/session";
import { PRODUCTS, policyTerms, termsHash } from "../shared/products";

const session: Session = { address: "0x6518EAD9698ed3dD08845C9103f755D1D1a4cc47", demo: true, exp: 9_999_999_999 };
const other: Session = { ...session, address: "0x006B92D63938d9B9e3485077e7A72C9a9944364E" };
const quoteId = `0x${"ab".repeat(32)}`;
let mem: MemoryStore;

beforeAll(() => {
  process.env.SKJOL_MASTER_KEY = `0x${"11".repeat(32)}`;
  process.env.SESSION_SECRET = `0x${"22".repeat(32)}`;
  delete process.env.AGENT_PAUSED;
  mem = new MemoryStore();
  setStoreForTests(mem);
});

describe("freight agent spending controls", () => {
  it("applies the per-call limit to data calls only", async () => {
    await saveAgentLimits(session, { perCallMax: 0.02, dailyCap: 1, approvalThreshold: 0.5 });
    expect(await checkSpend(session, 10_000n, "data")).toEqual({ ok: true });
    const r = await checkSpend(session, 30_000n, "data");
    expect(r.ok).toBe(false);
    expect(await checkSpend(session, 300_000n, "cover")).toEqual({ ok: true });
  });

  it("counts settled spending in the last 24 hours against the daily cap", async () => {
    const now = Math.floor(Date.now() / 1000);
    const base = { ownerTag: ownerTagOf(session), kind: "data" as const, rail: "hedera" as const, network: "hedera:testnet", resource: "x", asset: "USDC", reason: "", reference: "", hcs: "" };
    await mem.putAgentSpend({ ...base, spendId: "a", amountUnits: 900_000n, status: "settled", createdAtSec: now - 60 });
    await mem.putAgentSpend({ ...base, spendId: "b", amountUnits: 900_000n, status: "declined", createdAtSec: now - 60 });
    await mem.putAgentSpend({ ...base, spendId: "c", amountUnits: 900_000n, status: "settled", createdAtSec: now - 2 * 86_400 });
    expect(await checkSpend(session, 100_000n, "cover")).toEqual({ ok: true });
    const over = await checkSpend(session, 100_001n, "cover");
    expect(over.ok).toBe(false);
  });

  it("blocks everything when the kill switch is on", async () => {
    await saveAgentLimits(session, { paused: true });
    const r = await checkSpend(session, 1n, "data");
    expect(r.ok).toBe(false);
    await saveAgentLimits(session, { paused: false });
  });

  it("clamps limits to the hard ceiling", async () => {
    const l = await saveAgentLimits(session, { perCallMax: 50, dailyCap: 500 });
    expect(l.perCallMax).toBe(1_000_000n);
    expect(l.dailyCap).toBe(20_000_000n);
  });
});

describe("cover approval tokens", () => {
  it("binds a token to the wallet and the quote", () => {
    const t = issueApproval(session, quoteId);
    expect(verifyApproval(session, quoteId, t)).toBe(true);
    expect(verifyApproval(session, quoteId.toUpperCase().replace("0X", "0x"), t)).toBe(true);
    expect(verifyApproval(other, quoteId, t)).toBe(false);
    expect(verifyApproval(session, `0x${"cd".repeat(32)}`, t)).toBe(false);
    expect(verifyApproval(session, quoteId, "123.forged")).toBe(false);
    expect(verifyApproval(session, quoteId, undefined)).toBe(false);
  });

  it("rejects an expired token", () => {
    const [, mac] = issueApproval(session, quoteId).split(".");
    expect(verifyApproval(session, quoteId, `${Math.floor(Date.now() / 1000) - 1}.${mac}`)).toBe(false);
  });
});

describe("currency-aware terms", () => {
  const base = { product: PRODUCTS["delay-standard-24h"], vesselName: "X", vesselImo: "9700017", destinationLocode: "FIHEL", agreedArrivalDeadline: "2026-12-10T12:00:00Z" };
  it("keeps USDC wording (and hash) unchanged and names EURC for euro cover", () => {
    expect(termsHash(policyTerms(base))).toBe(termsHash(policyTerms({ ...base, currency: "USDC" })));
    const eur = policyTerms({ ...base, currency: "EURC" });
    expect(eur).toContain("5.00 EURC (testnet)");
    expect(eur).not.toContain("USDC");
  });
});
