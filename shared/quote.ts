// EIP-712 quote typed data (must match ShipmentDelayPool.QUOTE_TYPEHASH and domain).
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import {
  EVENT_VESSEL_ARRIVAL_AT_PORT,
  QUOTE_VALIDITY_SEC,
  locodeToBytes32,
  policyTerms,
  termsHash,
  voyageRefHash,
  type ConfirmedShipment,
  type Product,
} from "./products";

export const QUOTE_TYPES = {
  Quote: [
    { name: "quoteId", type: "bytes32" },
    { name: "policyId", type: "bytes32" },
    { name: "beneficiary", type: "address" },
    { name: "vesselImo", type: "uint32" },
    { name: "voyageRefHash", type: "bytes32" },
    { name: "destinationLocode", type: "bytes32" },
    { name: "eventType", type: "uint8" },
    { name: "earliestArrival", type: "uint64" },
    { name: "agreedArrivalDeadline", type: "uint64" },
    { name: "delayThreshold", type: "uint32" },
    { name: "premium", type: "uint128" },
    { name: "payout", type: "uint128" },
    { name: "termsHash", type: "bytes32" },
    { name: "purchaseCutoff", type: "uint64" },
    { name: "quoteExpiry", type: "uint64" },
  ],
} as const;

export function quoteDomain(chainId: number, pool: Address) {
  return { name: "SkjolShipmentDelayPool", version: "1", chainId, verifyingContract: pool } as const;
}

export interface QuoteMessage {
  quoteId: Hex;
  policyId: Hex;
  beneficiary: Address;
  vesselImo: number;
  voyageRefHash: Hex;
  destinationLocode: Hex;
  eventType: number;
  earliestArrival: bigint;
  agreedArrivalDeadline: bigint;
  delayThreshold: number;
  premium: bigint;
  payout: bigint;
  termsHash: Hex;
  purchaseCutoff: bigint;
  quoteExpiry: bigint;
}

/** Deterministic IDs: policyId binds shipment + product + beneficiary; quoteId adds issue time. */
export function derivePolicyId(shipmentId: string, productId: string, beneficiary: Address): Hex {
  return keccak256(stringToHex(`skjol:policy:${shipmentId}:${productId}:${beneficiary.toLowerCase()}`));
}

export function buildQuoteMessage(p: {
  shipmentId: string;
  shipment: ConfirmedShipment;
  product: Product;
  beneficiary: Address;
  nowSec: number;
}): { message: QuoteMessage; terms: string } {
  const deadline = Math.floor(Date.parse(p.shipment.agreedArrivalDeadline) / 1000);
  const departure = Math.floor(Date.parse(p.shipment.departureDate) / 1000);
  const terms = policyTerms({
    product: p.product,
    vesselName: p.shipment.vesselName,
    vesselImo: p.shipment.vesselImo,
    destinationLocode: p.shipment.destinationLocode,
    agreedArrivalDeadline: p.shipment.agreedArrivalDeadline,
  });
  const policyId = derivePolicyId(p.shipmentId, p.product.id, p.beneficiary);
  const purchaseCutoff = deadline - p.product.purchaseCutoffLeadSec;
  const message: QuoteMessage = {
    quoteId: keccak256(stringToHex(`skjol:quote:${policyId}:${p.nowSec}`)),
    policyId,
    beneficiary: p.beneficiary,
    vesselImo: Number(p.shipment.vesselImo),
    voyageRefHash: voyageRefHash(p.shipment.voyageRef),
    destinationLocode: locodeToBytes32(p.shipment.destinationLocode),
    eventType: EVENT_VESSEL_ARRIVAL_AT_PORT,
    earliestArrival: BigInt(departure),
    agreedArrivalDeadline: BigInt(deadline),
    delayThreshold: p.product.delayThresholdSec,
    premium: p.product.premium,
    payout: p.product.payout,
    termsHash: termsHash(terms),
    purchaseCutoff: BigInt(purchaseCutoff),
    quoteExpiry: BigInt(Math.min(p.nowSec + QUOTE_VALIDITY_SEC, purchaseCutoff)),
  };
  return { message, terms };
}
