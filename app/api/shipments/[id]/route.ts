import { handle } from "@/lib/http";
import { loadOwnedShipment } from "@/lib/insurance";
import { requireSession } from "@/lib/session";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { rec, priv } = await loadOwnedShipment(id, await requireSession());
  return { shipmentId: id, status: rec.status, dataLabel: rec.dataLabel, arkivKey: rec.key, fileName: priv.fileName, extraction: priv.extraction, confirmed: priv.confirmed, storage: { mode: priv.document.mode, size: priv.document.size } };
});
