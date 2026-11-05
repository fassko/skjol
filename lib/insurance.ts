import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAddress, type Address, type Hex } from "viem";
import { REQUIRED, documentToText, extractShipment, type Extraction } from "./ai/extract";
import { chainConfig, config } from "./config";
import { blindTag, openJson, sealJson } from "./crypto";
import { signQuote } from "./chain";
import { storeDocument } from "./swarm";
import { HttpError, type Session } from "./session";
import { store, type PolicyPrivate, type PolicyRecord, type QuotePrivate, type ShipmentPrivate, type ShipmentRecord } from "./store";
import { PRODUCTS, checkEligibility, formatUsdc, isValidImo, normaliseLocode, type ConfirmedShipment, type ProductId } from "../shared/products";
import { buildQuoteMessage } from "../shared/quote";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const shipmentContext = (id: string) => `shipment:${id}`;

// --------------------------------------------------------------- shipments
export async function createShipment(p: { owner: Address; fileName: string; bytes: Uint8Array; dataLabel: "customer" | "synthetic" }) {
  if (p.bytes.length === 0 || p.bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(400, "Please upload a document under 2 MB.");
  const shipmentId = `shp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const { text, pages } = await documentToText(p.fileName, p.bytes);
  if (!text.trim()) throw new HttpError(422, "We could not read any text from this document.");
  const [extraction, doc] = await Promise.all([extractShipment(text, pages), storeDocument(shipmentId, p.bytes)]);
  const priv: ShipmentPrivate = {
    owner: getAddress(p.owner),
    fileName: p.fileName.slice(0, 120),
    document: doc,
    extraction,
    confirmed: null,
  };
  const rec = await store().putShipment({
    shipmentId,
    ownerTag: blindTag("owner", p.owner),
    status: "extracted",
    dataLabel: p.dataLabel,
    createdAtSec: Math.floor(Date.now() / 1000),
    sealed: sealJson(priv, shipmentContext(shipmentId)),
  });
  return { shipmentId, extraction, document: doc, arkivKey: rec.key };
}

export async function loadOwnedShipment(shipmentId: string, session: Session) {
  const rec = await store().getShipment(shipmentId);
  if (!rec) throw new HttpError(404, "Shipment not found.");
  if (rec.ownerTag !== blindTag("owner", session.address)) throw new HttpError(403, "This shipment belongs to another account.");
  const priv = openJson<ShipmentPrivate>(rec.sealed, shipmentContext(shipmentId));
  return { rec, priv };
}

export const ConfirmedShipmentSchema = z.object({
  vesselName: z.string().trim().min(2).max(60),
  vesselImo: z.string().trim().refine(isValidImo, "Enter a valid 7-digit IMO number"),
  vesselMmsi: z.string().trim().regex(/^\d{9}$/).nullable().optional(),
  voyageRef: z.string().trim().min(2).max(40),
  originPort: z.string().trim().min(2).max(80),
  destinationLocode: z.string().trim().transform(normaliseLocode).pipe(z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}$/)),
  departureDate: z.string().datetime(),
  agreedArrivalDeadline: z.string().datetime(),
});

/** Customer confirmation is mandatory before quoting. Unresolved conflicts must be answered. */
export async function confirmShipment(shipmentId: string, session: Session, input: unknown, acknowledgedConflicts: boolean) {
  const { rec, priv } = await loadOwnedShipment(shipmentId, session);
  const parsed = ConfirmedShipmentSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const extraction = priv.extraction as Extraction;
  const conflicts = extraction.issues.filter((i) => i.kind === "conflicting");
  if (conflicts.length && !acknowledgedConflicts) {
    throw new HttpError(409, `Please confirm which value is correct for: ${conflicts.map((c) => c.field).join(", ")}.`);
  }
  const confirmed: ConfirmedShipment = { ...parsed.data, vesselMmsi: parsed.data.vesselMmsi ?? null };
  const next: ShipmentPrivate = { ...priv, confirmed };
  await store().updateShipment(rec, { status: "confirmed", sealed: sealJson(next, shipmentContext(shipmentId)) });
  return { shipmentId, confirmed, requiredFields: REQUIRED };
}

// ------------------------------------------------------------------ quotes
export interface QuoteOffer {
  quoteId: Hex;
  policyId: Hex;
  productId: ProductId;
  productName: string;
  premium: string; // USDC decimal string
  payout: string;
  premiumUnits: string;
  payoutUnits: string;
  thresholdHours: number;
  agreedArrivalDeadline: string;
  purchaseCutoff: string;
  quoteExpiry: string;
  terms: string;
  chainId: number;
  pool: Address;
  usdc: Address;
  message: Record<string, string | number>;
  signature: Hex;
  demoOnly: boolean;
}

export async function issueQuotes(shipmentId: string, session: Session, nowSec = Math.floor(Date.now() / 1000)) {
  const { rec, priv } = await loadOwnedShipment(shipmentId, session);
  if (!priv.confirmed) throw new HttpError(409, "Please review and confirm the shipment details before requesting a quote.");
  const shipment = priv.confirmed as ConfirmedShipment;
  const c = chainConfig();
  if (!c.pool) throw new HttpError(503, "The insurance pool is not configured yet.");

  const offers: QuoteOffer[] = [];
  const declined: { productId: ProductId; reasons: string[] }[] = [];
  for (const product of Object.values(PRODUCTS)) {
    if (product.demoOnly && !config.demoProductsEnabled()) continue;
    const issues = checkEligibility(shipment, product, nowSec, { demoProductsEnabled: config.demoProductsEnabled() });
    if (issues.length) {
      declined.push({ productId: product.id, reasons: issues.map((i) => i.message) });
      continue;
    }
    const { message, terms } = buildQuoteMessage({ shipmentId, shipment, product, beneficiary: session.address, nowSec });
    const signature = await signQuote(message);
    const msgJson = Object.fromEntries(Object.entries(message).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) as Record<string, string | number>;
    const qpriv: QuotePrivate & { shipmentId: string; vesselName: string; voyageRef: string } = {
      beneficiary: session.address,
      message: msgJson,
      signature,
      terms,
      shipmentId,
      vesselName: shipment.vesselName,
      voyageRef: shipment.voyageRef,
    };
    await store().putQuote({
      quoteId: message.quoteId,
      shipmentTag: blindTag("shipment", shipmentId),
      policyId: message.policyId,
      productId: product.id,
      premiumUnits: product.premium,
      payoutUnits: product.payout,
      deadlineSec: Number(message.agreedArrivalDeadline),
      thresholdSec: product.delayThresholdSec,
      quoteExpirySec: Number(message.quoteExpiry),
      termsHash: message.termsHash,
      chainId: c.id,
      pool: c.pool,
      sealed: sealJson(qpriv, `quote:${message.quoteId}`),
    });
    offers.push({
      quoteId: message.quoteId,
      policyId: message.policyId,
      productId: product.id,
      productName: product.name,
      premium: formatUsdc(product.premium),
      payout: formatUsdc(product.payout),
      premiumUnits: product.premium.toString(),
      payoutUnits: product.payout.toString(),
      thresholdHours: product.delayThresholdSec / 3600,
      agreedArrivalDeadline: shipment.agreedArrivalDeadline,
      purchaseCutoff: new Date(Number(message.purchaseCutoff) * 1000).toISOString(),
      quoteExpiry: new Date(Number(message.quoteExpiry) * 1000).toISOString(),
      terms,
      chainId: c.id,
      pool: c.pool,
      usdc: c.usdc,
      message: msgJson,
      signature,
      demoOnly: product.demoOnly,
    });
  }
  if (offers.length && rec.status === "confirmed") await store().updateShipment(rec, { status: "quoted" });
  return { shipmentId, offers, declined };
}

// ---------------------------------------------------------------- policies
export interface PolicyView {
  policy: PolicyRecord;
  priv: PolicyPrivate | null;
  owned: boolean;
}

export async function listMyPolicies(session: Session) {
  const recs = await store().listPolicies({ ownerTag: blindTag("owner", session.address) });
  return recs.map((p) => ({ policy: p, priv: safeOpen(p) }));
}

export function safeOpen(p: PolicyRecord): PolicyPrivate | null {
  try {
    return openJson<PolicyPrivate>(p.sealed, `policy:${p.policyId}`);
  } catch {
    return null;
  }
}

export async function getPolicyView(policyId: string, session: Session | null): Promise<PolicyView | null> {
  const p = await store().getPolicy(policyId);
  if (!p) return null;
  const owned = !!session && p.ownerTag === blindTag("owner", session.address);
  return { policy: p, priv: owned ? safeOpen(p) : null, owned };
}
