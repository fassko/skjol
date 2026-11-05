import { handle } from "@/lib/http";
import { issueQuotes } from "@/lib/insurance";
import { requireSession } from "@/lib/session";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return issueQuotes(id, await requireSession());
});
