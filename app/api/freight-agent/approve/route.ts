import { decideCoverApproval } from "@/lib/freight-ops";
import { handle } from "@/lib/http";
import { HttpError, requireSession } from "@/lib/session";

// Only a human tap in /agent reaches this route (it needs the session cookie). The token it returns
// lets the agent buy exactly this quote, for 10 minutes. MCP clients use approveCover instead.
export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const { quoteId, approve } = (await req.json()) as { quoteId?: string; approve?: boolean };
  if (!quoteId) throw new HttpError(422, "quoteId is required");
  return decideCoverApproval(session, quoteId, approve !== false);
});
