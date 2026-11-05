import { handle } from "@/lib/http";
import { documentToText, fillMissingFromOffline, parseDocDate, splitPages, type Extraction } from "@/lib/ai/extract";
import { loadOwnedShipment } from "@/lib/insurance";
import { requireSession } from "@/lib/session";
import { ARKIV_EXPLORER } from "@/lib/store/arkiv";
import { readDocument, storageSummary, type StoredDocument } from "@/lib/swarm";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { rec, priv } = await loadOwnedShipment(id, await requireSession());
  let extraction = priv.extraction as Extraction;
  const dateMissing = (["departureDate", "agreedArrivalDeadline"] as const).some((f) => !parseDocDate(extraction.fields?.[f]?.value ?? ""));
  const doc = priv.document;
  if (dateMissing && (doc.mode === "local-dev" || doc.mode === "bee" || doc.mode === "gateway")) {
    try {
      const bytes = await readDocument(id, {
        mode: doc.mode as StoredDocument["mode"],
        reference: doc.reference,
        sha256: doc.sha256,
        size: doc.size,
        tagUid: doc.tagUid ?? null,
      });
      const read = await documentToText(priv.fileName, bytes);
      extraction = fillMissingFromOffline(extraction, read.pages?.length ? read.pages : splitPages(read.text));
    } catch (err) {
      console.warn("Could not recover dates from the stored document:", (err as Error).message);
    }
  }
  return {
    shipmentId: id,
    status: rec.status,
    dataLabel: rec.dataLabel,
    arkivKey: rec.key,
    arkivUrl: rec.key ? `${ARKIV_EXPLORER}/entity/${rec.key}` : null,
    fileName: priv.fileName,
    extraction,
    confirmed: priv.confirmed,
    storage: storageSummary({
      mode: doc.mode as StoredDocument["mode"],
      reference: doc.reference,
      size: doc.size,
      tagUid: doc.tagUid ?? null,
    }),
  };
});
