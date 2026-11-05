import { BaseError, ContractFunctionRevertedError } from "viem";
import { formatUsdc } from "./products";

/** Shown when the pool cannot reserve the payout. `availableAfterPremium` is free capital plus the premium. */
export function insufficientCollateralMessage(p: {
  currency: string;
  pool: string;
  availableAfterPremium: bigint;
  payout: bigint;
}): string {
  return `The ${p.currency} pool does not hold enough funds to pay this cover. After this premium it can cover ${formatUsdc(p.availableAfterPremium)} ${p.currency}, and this policy pays ${formatUsdc(p.payout)} ${p.currency}. Fund the pool at ${p.pool}, then try again.`;
}

const PURCHASE_ERRORS: Record<string, string> = {
  QuoteExpired: "This quote has expired. Request a new one, then buy again.",
  PurchaseCutoffPassed: "The purchase window for this shipment has closed.",
  NotBeneficiary: "The connected wallet is not the account this quote was issued to.",
  InvalidQuoteSignature: "The pool rejected the quote signature.",
  QuoteAlreadyUsed: "This quote has already been purchased.",
  PolicyExists: "Cover for this shipment is already active.",
  PurchasesPaused: "Purchases are paused on this pool.",
  InvalidQuoteTerms: "The pool rejected the quote terms.",
};

/** Turn a viem purchase revert into a sentence the buyer can act on. */
export function explainPurchaseError(error: unknown, opts: { currency: string; pool: string }): string {
  const revert = error instanceof ContractFunctionRevertedError
    ? error
    : error instanceof BaseError
      ? error.walk((e) => e instanceof ContractFunctionRevertedError)
      : null;
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revert.data?.errorName;
    if (name === "InsufficientCollateral") {
      const available = revert.data?.args?.[0];
      const required = revert.data?.args?.[1];
      if (typeof available === "bigint" && typeof required === "bigint") {
        return insufficientCollateralMessage({
          currency: opts.currency,
          pool: opts.pool,
          availableAfterPremium: available,
          payout: required,
        });
      }
    }
    if (name && PURCHASE_ERRORS[name]) return PURCHASE_ERRORS[name];
    if (name) return `The pool rejected this purchase (${name}).`;
  }
  const err = error as { code?: number; shortMessage?: string; message?: string };
  if (err.code === 4001) return "You cancelled the request in your wallet.";
  const msg = err.shortMessage || err.message;
  if (msg && msg.length < 240 && !msg.includes("Raw Call") && !msg.includes("Request Arguments")) return msg;
  return "The purchase transaction failed.";
}
