import { handle } from "@/lib/http";
import { purchaseWithDemoWallet } from "@/lib/purchase";
import { requireSession } from "@/lib/session";
import { runSync } from "@/lib/sync";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  const { quoteId } = (await req.json()) as { quoteId: string };
  const r = await purchaseWithDemoWallet(quoteId, await requireSession());
  const sync = await runSync().catch((e) => ({ error: (e as Error).message }));
  return { ...r, sync };
});
