import { handle } from "@/lib/http";
import { confirmShipment } from "@/lib/insurance";
import { requireSession } from "@/lib/session";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = (await req.json()) as { shipment: unknown; acknowledgedConflicts?: boolean };
  return confirmShipment(id, await requireSession(), body.shipment, !!body.acknowledgedConflicts);
});
