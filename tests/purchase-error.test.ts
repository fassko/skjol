import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, type Hex } from "viem";
import { poolAbi } from "../lib/abi/ShipmentDelayPool";
import { explainPurchaseError } from "../shared/purchase-error";

const POOL = "0x45FFfb2133bAD82eC6eBb140db4F3ce2F651B565";
// InsufficientCollateral(600000, 5000000) — the revert from the failed Arc purchase.
const DATA = "0xb07e3bc400000000000000000000000000000000000000000000000000000000000927c000000000000000000000000000000000000000000000000000000000004c4b40" as Hex;

describe("explainPurchaseError", () => {
  it("explains an underfunded pool with the amounts and the pool address", () => {
    const inner = new ContractFunctionRevertedError({ abi: poolAbi, functionName: "purchase", data: DATA });
    const wrapped = new BaseError("execution reverted", { cause: inner });
    const message = explainPurchaseError(wrapped, { currency: "USDC", pool: POOL });
    expect(message).toBe(
      "The USDC pool does not hold enough funds to pay this cover. After this premium it can cover 0.60 USDC, and this policy pays 5.00 USDC. Fund the pool at 0x45FFfb2133bAD82eC6eBb140db4F3ce2F651B565, then try again.",
    );
  });

  it("keeps a wallet cancellation readable", () => {
    expect(explainPurchaseError({ code: 4001 }, { currency: "USDC", pool: POOL })).toBe("You cancelled the request in your wallet.");
  });
});
