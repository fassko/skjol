import { handle } from "@/lib/http";
import { evaluatePolicy } from "@/lib/evaluator";
import { HttpError } from "@/lib/session";
import { runSync } from "@/lib/sync";

export const maxDuration = 120;

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) throw new HttpError(400, "Invalid policy id");
  const body = (await req.json().catch(() => ({}))) as { clock?: string };
  const r = await evaluatePolicy(id as `0x${string}`, { clockIso: body.clock });
  const sync = r.reportTx ? await runSync().catch((e) => ({ error: (e as Error).message })) : null;
  return { ...r, sync };
});
