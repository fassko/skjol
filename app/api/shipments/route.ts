import { handle } from "@/lib/http";
import { createShipment } from "@/lib/insurance";
import { HttpError, requireSession } from "@/lib/session";
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
  return { shipmentId: r.shipmentId, extraction: r.extraction, storage: { mode: r.document.mode, reference: r.document.reference, size: r.document.size }, arkivKey: r.arkivKey };
});
