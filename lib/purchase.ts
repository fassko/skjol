import "server-only";
import { erc20Abi, type Hex } from "viem";
import { poolAbi } from "./abi/ShipmentDelayPool";
import { publicClient, txLink } from "./chain";
import { chainConfig } from "./config";
import { openJson } from "./crypto";
import { HttpError, demoCustomer, type Session } from "./session";
import { store, type QuotePrivate } from "./store";
import { createWalletClient, http } from "viem";
import { viemChain } from "./chain";

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

/** Demo wallet purchase (server-held TEST key). Real wallets sign the same two calls in the browser. */
export async function purchaseWithDemoWallet(quoteId: string, session: Session) {
  const acct = demoCustomer();
  if (!acct || !session.demo || session.address !== acct.address) throw new HttpError(403, "Demo purchases are only available with the demo wallet.");
  const q = await store().getQuote(quoteId);
  if (!q) throw new HttpError(404, "Quote not found.");
  const priv = openJson<QuotePrivate>(q.sealed, `quote:${q.quoteId}`);
  if (priv.beneficiary.toLowerCase() !== session.address.toLowerCase()) throw new HttpError(403, "This quote was issued to another account.");
  const c = chainConfig();
  const args = quoteArgs(priv.message);
  const wallet = createWalletClient({ chain: viemChain(), transport: http(c.rpcUrl), account: acct });
  const pub = publicClient();
  const allowance = await pub.readContract({ address: c.usdc, abi: erc20Abi, functionName: "allowance", args: [acct.address, c.pool] });
  let approveTx: Hex | null = null;
  if (allowance < args.premium) {
    approveTx = await wallet.writeContract({ address: c.usdc, abi: erc20Abi, functionName: "approve", args: [c.pool, args.premium] });
    await pub.waitForTransactionReceipt({ hash: approveTx });
  }
  // Simulate first so contract errors (expired, cutoff, collateral) surface as readable messages.
  try {
    await pub.simulateContract({ address: c.pool, abi: poolAbi, functionName: "purchase", args: [args, priv.signature as Hex], account: acct });
  } catch (e) {
    const name = (e as { cause?: { data?: { errorName?: string } } }).cause?.data?.errorName ?? (e as Error).message.slice(0, 160);
    throw new HttpError(409, `The pool rejected this purchase: ${name}`);
  }
  const hash = await wallet.writeContract({ address: c.pool, abi: poolAbi, functionName: "purchase", args: [args, priv.signature as Hex] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new HttpError(500, "Purchase transaction failed.");
  return { policyId: args.policyId, approveTx, purchaseTx: hash, purchaseTxUrl: txLink(hash) };
}
