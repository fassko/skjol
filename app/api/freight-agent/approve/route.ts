import { issueApproval, recordSpend, requireAgentWallet } from "@/lib/agent-wallet";
import { handle } from "@/lib/http";
import { loadOwnedQuote } from "@/lib/purchase";
import { HttpError, requireSession } from "@/lib/session";

// Only a human tap in /agent reaches this route (it needs the session cookie). The token it returns
// lets the agent buy exactly this quote, for 10 minutes.
export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  requireAgentWallet(session);
  const { quoteId, approve } = (await req.json()) as { quoteId?: string; approve?: boolean };
  if (!quoteId || !/^0x[0-9a-f]{64}$/i.test(quoteId)) throw new HttpError(422, "quoteId is required");
  const { pool, args } = await loadOwnedQuote(quoteId, session);
  if (approve === false) {
    await recordSpend(
      session,
      { kind: "cover", rail: "arc-onchain", network: "eip155:5042002", resource: `pool:${pool.pool}`, amountUnits: args.premium, asset: pool.currency, status: "declined", reason: "Declined by the customer", reference: "" },
      "cover_declined",
    );
    return { approved: false };
  }
  return { approved: true, approvalToken: issueApproval(session, quoteId) };
});
