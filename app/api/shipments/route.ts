import { handle } from "@/lib/http";
import { createShipment } from "@/lib/insurance";
import { HttpError, requireSession } from "@/lib/session";
import { ARKIV_EXPLORER } from "@/lib/store/arkiv";
import { storageSummary } from "@/lib/swarm";
import { listMyShipments } from "@/lib/views";

export const maxDuration = 60;

export const GET = handle(async () => ({ shipments: await listMyShipments(await requireSession()) }));

export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Please attach a shipping document.");
  const synthetic = form.get("synthetic") === "true";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await createShipment({ owner: session.address, fileName: file.name, bytes, dataLabel: synthetic ? "synthetic" : "customer" });
  const storage = storageSummary(r.document);
  return {
    shipmentId: r.shipmentId,
    extraction: r.extraction,
    storage,
    arkivKey: r.arkivKey,
    arkivUrl: r.arkivKey ? `${ARKIV_EXPLORER}/entity/${r.arkivKey}` : null,
  };
});
