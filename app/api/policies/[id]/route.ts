import { handle } from "@/lib/http";
import { getSession, HttpError } from "@/lib/session";
import { policyDetail } from "@/lib/views";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new HttpError(400, "Invalid policy id");
  const d = await policyDetail(id as `0x${string}`, await getSession());
  if (!d) throw new HttpError(404, "Policy not found yet. If you just bought it, it appears after the next sync.");
  return d;
});
