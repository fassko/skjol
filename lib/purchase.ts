import "server-only";
import { erc20Abi, type Address, type Hex } from "viem";
import { poolAbi } from "./abi/ShipmentDelayPool";
import { publicClient, txLink } from "./chain";
import { chainConfig, poolByAddress } from "./config";
import { openJson } from "./crypto";
import { HttpError, demoCustomer, type Session } from "./session";
import { store, type QuotePrivate } from "./store";
import { createWalletClient, http } from "viem";
import { viemChain } from "./chain";
import { explainPurchaseError } from "../shared/purchase-error";

export function quoteArgs(message: Record<string, string | number>) {
  return {
    quoteId: message.quoteId as Hex,
    policyId: message.policyId as Hex,
    beneficiary: message.beneficiary as Hex,
    vesselImo: Number(message.vesselImo),
    voyageRefHash: message.voyageRefHash as Hex,
    destinationLocode: message.destinationLocode as Hex,
    eventType: Number(message.eventType),
    earliestArrival: BigInt(message.earliestArrival),
    agreedArrivalDeadline: BigInt(message.agreedArrivalDeadline),
    delayThreshold: Number(message.delayThreshold),
    premium: BigInt(message.premium),
    payout: BigInt(message.payout),
    termsHash: message.termsHash as Hex,
    purchaseCutoff: BigInt(message.purchaseCutoff),
    quoteExpiry: BigInt(message.quoteExpiry),
  };
}

/** Load a quote issued to this session (used by the demo purchase and the freight agent). */
export async function loadOwnedQuote(quoteId: string, session: Session) {
  const q = await store().getQuote(quoteId);
  if (!q) throw new HttpError(404, "Quote not found.");
  const priv = openJson<QuotePrivate & { currency?: string }>(q.sealed, `quote:${q.quoteId}`);
  if (priv.beneficiary.toLowerCase() !== session.address.toLowerCase()) throw new HttpError(403, "This quote was issued to another account.");
  const pool = poolByAddress(q.pool);
  if (!pool) throw new HttpError(409, "The pool for this quote is no longer configured.");
  return { record: q, priv, pool, args: quoteArgs(priv.message) };
}

/** Pay a quote's premium with a server-held account. Beneficiary stays the session that owns the quote. */
async function purchaseWithServerAccount(quoteId: string, session: Session, acct: NonNullable<ReturnType<typeof demoCustomer>>) {
  const { priv, pool, args } = await loadOwnedQuote(quoteId, session);
  const c = chainConfig();
  const token: Address = pool.token;
  const wallet = createWalletClient({ chain: viemChain(), transport: http(c.rpcUrl), account: acct });
  const pub = publicClient();
  const balance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [acct.address] });
  if (balance < args.premium) throw new HttpError(409, `The demo wallet does not hold enough test ${pool.currency} for this premium.`);
  const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [acct.address, pool.pool] });
  let approveTx: Hex | null = null;
  if (allowance < args.premium) {
    approveTx = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [pool.pool, args.premium] });
    await pub.waitForTransactionReceipt({ hash: approveTx });
  }
  // Simulate first so contract errors (expired, cutoff, collateral) surface as readable messages.
  try {
    await pub.simulateContract({ address: pool.pool, abi: poolAbi, functionName: "purchase", args: [args, priv.signature as Hex], account: acct });
  } catch (e) {
    throw new HttpError(409, explainPurchaseError(e, { currency: pool.currency, pool: pool.pool }));
  }
  const hash = await wallet.writeContract({ address: pool.pool, abi: poolAbi, functionName: "purchase", args: [args, priv.signature as Hex] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new HttpError(500, "Purchase transaction failed.");
  return { policyId: args.policyId, currency: pool.currency, premiumUnits: args.premium, approveTx, purchaseTx: hash, purchaseTxUrl: txLink(hash) };
}

/** Demo wallet purchase for the cover flow. Real wallets sign the same two calls in the browser. */
export async function purchaseWithDemoWallet(quoteId: string, session: Session) {
  const acct = demoCustomer();
  if (!acct || !session.demo || session.address !== acct.address) throw new HttpError(403, "Demo purchases are only available with the demo wallet.");
  return purchaseWithServerAccount(quoteId, session, acct);
}

/** Freight agent purchase: any logged-in session; premium paid from the server-held TEST key. */
export async function purchaseWithAgentFunds(quoteId: string, session: Session) {
  const acct = demoCustomer();
  if (!acct) throw new HttpError(403, "The freight agent needs the demo wallet key configured (test funds only).");
  return purchaseWithServerAccount(quoteId, session, acct);
}
