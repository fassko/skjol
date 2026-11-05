import { depositToGateway } from "@/lib/agent-wallet";
import { handle } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const maxDuration = 120;

/** Move test USDC from the agent wallet into its Circle Gateway balance (funds nanopayments). */
export const POST = handle(async (req: Request) => {
  const { amount } = (await req.json()) as { amount?: string };
  return depositToGateway(await requireSession(), amount ?? "1");
});
