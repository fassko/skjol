import { handle } from "@/lib/http";
import { issueQuotes } from "@/lib/insurance";
import { requireSession } from "@/lib/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const currency = new URL(req.url).searchParams.get("currency") === "EURC" ? "EURC" : "USDC";
  return issueQuotes(id, await requireSession(), { currency });
});
