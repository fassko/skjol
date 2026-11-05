// Fixed product catalogue and explicit underwriting rules.
// Pure TypeScript (depends only on viem) so the Next.js backend, tests and the CRE workflow
// share one definition. AI never prices, decides eligibility or computes payouts.
import { keccak256, stringToHex } from "viem";
import { PORT_COUNTRIES, SUPPORTED_PORTS, normaliseLocode, portInfo, type EvidenceSourceKey } from "./ports";

export { SUPPORTED_PORTS, normaliseLocode };

export const USDC_DECIMALS = 6;

/** Settlement token of a pool. Both are 6-decimal Circle stablecoins; amounts use the same units. */
export type Currency = "USDC" | "EURC";
export const CURRENCIES: Currency[] = ["USDC", "EURC"];
export const EVENT_VESSEL_ARRIVAL_AT_PORT = 1 as const;

export type ProductId = "delay-standard-24h" | "delay-plus-24h" | "demo-fast-2m";

export interface Product {
  id: ProductId;
  name: string;
  /** Strict threshold in seconds: payout only when arrival is MORE than this after the deadline. */
  delayThresholdSec: number;
  /** Fixed amounts in USDC base units (6 decimals). Testnet-scale. */
  premium: bigint;
  payout: bigint;
  /** Purchases close this long before the agreed deadline. */
  purchaseCutoffLeadSec: number;
  /** Earliest / latest agreed deadline relative to quote time. */
  minDeadlineLeadSec: number;
  maxDeadlineLeadSec: number;
  demoOnly: boolean;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

export const PRODUCTS: Record<ProductId, Product> = {
  "delay-standard-24h": {
    id: "delay-standard-24h",
    name: "Arrival Delay Cover — Standard",
    delayThresholdSec: 24 * HOUR,
    premium: 500_000n, // 0.50 USDC
    payout: 5_000_000n, // 5.00 USDC
    purchaseCutoffLeadSec: 48 * HOUR,
    minDeadlineLeadSec: 72 * HOUR,
    maxDeadlineLeadSec: 60 * DAY,
    demoOnly: false,
  },
  "delay-plus-24h": {
    id: "delay-plus-24h",
    name: "Arrival Delay Cover — Plus",
    delayThresholdSec: 24 * HOUR,
    premium: 1_200_000n, // 1.20 USDC
    payout: 10_000_000n, // 10.00 USDC
    purchaseCutoffLeadSec: 48 * HOUR,
    minDeadlineLeadSec: 72 * HOUR,
    maxDeadlineLeadSec: 60 * DAY,
    demoOnly: false,
  },
  // Testnet demo product: same mechanics with a 2-minute threshold so a late-arrival payout can be
  // demonstrated live on Arc Testnet. Disabled unless DEMO_PRODUCTS_ENABLED=true.
  "demo-fast-2m": {
    id: "demo-fast-2m",
    name: "Demo Cover — 2 minute threshold (test only)",
    delayThresholdSec: 120,
    premium: 100_000n, // 0.10 USDC
    payout: 1_000_000n, // 1.00 USDC
    purchaseCutoffLeadSec: 60,
    minDeadlineLeadSec: 120,
    maxDeadlineLeadSec: DAY,
    demoOnly: true,
  },
};

export const QUOTE_VALIDITY_SEC = 30 * 60;

export function isValidImo(imo: string | number): boolean {
  const s = String(imo).trim();
  if (!/^\d{7}$/.test(s)) return false;
  const sum = [...s.slice(0, 6)].reduce((acc, d, i) => acc + Number(d) * (7 - i), 0);
  return sum % 10 === Number(s[6]);
}

export function locodeToBytes32(locode: string): `0x${string}` {
  return stringToHex(normaliseLocode(locode), { size: 32 });
}

export function voyageRefHash(voyageRef: string): `0x${string}` {
  return keccak256(stringToHex(voyageRef.trim().toUpperCase()));
}

export function formatUsdc(units: bigint): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0{1,4}$/, "");
  return `${neg ? "-" : ""}${whole}.${frac.length < 2 ? frac.padEnd(2, "0") : frac}`;
}

export interface ConfirmedShipment {
  vesselName: string;
  vesselImo: string;
  vesselMmsi?: string | null;
  voyageRef: string;
  originPort: string;
  destinationLocode: string;
  /** Sailing / departure date (ISO). Evidence older than this is rejected. */
  departureDate: string;
  /** Agreed arrival deadline (ISO, UTC). Contractual; independent of any ETA. */
  agreedArrivalDeadline: string;
}

export type EligibilityIssue = { field: string; code: string; message: string };

/** Explicit eligibility rules. Returns all issues; empty array means eligible. */
export function checkEligibility(
  s: ConfirmedShipment,
  product: Product,
  nowSec: number,
  opts: {
    demoProductsEnabled: boolean;
    /** Evidence sources that can settle this product here. Omitted: every source counts as available. */
    availableSources?: EvidenceSourceKey[];
  },
): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];
  if (product.demoOnly && !opts.demoProductsEnabled) {
    issues.push({ field: "product", code: "PRODUCT_DISABLED", message: "This demo product is not enabled." });
  }
  if (!isValidImo(s.vesselImo)) {
    issues.push({ field: "vesselImo", code: "INVALID_IMO", message: "A valid 7-digit IMO number is required." });
  }
  const port = portInfo(s.destinationLocode);
  if (!port) {
    issues.push({
      field: "destinationLocode",
      code: "UNSUPPORTED_PORT",
      message: `Destination must be a supported port in ${Object.values(PORT_COUNTRIES).join(" or ")}.`,
    });
  } else if (opts.availableSources && !opts.availableSources.includes(port.source)) {
    issues.push({
      field: "destinationLocode",
      code: "PORT_DATA_UNAVAILABLE",
      message: `Arrival data for ${port.name} is not connected in this environment yet, so this cover cannot be offered there.`,
    });
  }
  if (!s.voyageRef.trim()) issues.push({ field: "voyageRef", code: "MISSING", message: "Voyage reference is required." });
  const deadline = Date.parse(s.agreedArrivalDeadline) / 1000;
  const departure = Date.parse(s.departureDate) / 1000;
  if (!Number.isFinite(deadline)) {
    issues.push({ field: "agreedArrivalDeadline", code: "MISSING", message: "An agreed arrival deadline is required." });
  } else {
    if (deadline - nowSec < product.minDeadlineLeadSec) {
      issues.push({
        field: "agreedArrivalDeadline",
        code: "TOO_SOON",
        message: "The agreed arrival deadline is too close to buy this cover.",
      });
    }
    if (deadline - nowSec > product.maxDeadlineLeadSec) {
      issues.push({ field: "agreedArrivalDeadline", code: "TOO_FAR", message: "The agreed arrival deadline is too far ahead." });
    }
  }
  if (!Number.isFinite(departure)) {
    issues.push({ field: "departureDate", code: "MISSING", message: "A departure date is required." });
  } else if (Number.isFinite(deadline) && departure >= deadline) {
    issues.push({ field: "departureDate", code: "AFTER_DEADLINE", message: "Departure must be before the agreed deadline." });
  }
  return issues;
}

export const TERMS_VERSION = "skjol-arrival-delay-terms-v1";

/** The Digitraffic wording is unchanged so terms hashes of existing Finnish policies stay valid. */
const EVIDENCE_WORDING: Record<EvidenceSourceKey, string> = {
  digitraffic: "official port-call arrival records (Fintraffic Digitraffic).",
  vesselfinder:
    "port arrival events detected from the vessel's AIS position reports (VesselFinder). Only an arrival inside the port counts; waiting at an outer anchorage is not arrival.",
};

/** Human-readable policy wording. Its hash is locked onchain at purchase. */
export function policyTerms(p: {
  product: Product;
  vesselName: string;
  vesselImo: string;
  destinationLocode: string;
  agreedArrivalDeadline: string;
  /** Defaults to USDC; the USDC wording is unchanged so earlier terms hashes stay valid. */
  currency?: Currency;
}): string {
  const info = portInfo(p.destinationLocode);
  const port = info?.name ?? p.destinationLocode;
  const cur = p.currency ?? "USDC";
  const hours = p.product.delayThresholdSec / 3600;
  const threshold = hours >= 1 ? `${hours} hours` : `${p.product.delayThresholdSec / 60} minutes`;
  return [
    `${TERMS_VERSION}`,
    `Product: ${p.product.name}.`,
    `Insured event: the recorded arrival of vessel ${p.vesselName} (IMO ${p.vesselImo}) at ${port} (${normaliseLocode(
      p.destinationLocode,
    )}).`,
    `Agreed arrival deadline: ${p.agreedArrivalDeadline} (UTC). This deadline is fixed and does not change when ETAs change.`,
    `Payout: a fixed ${formatUsdc(p.product.payout)} ${cur} (testnet) if the recorded arrival is more than ${threshold} after the agreed deadline. Arrival exactly at the threshold does not qualify.`,
    `Premium: ${formatUsdc(p.product.premium)} ${cur} (testnet), payable once at purchase.`,
    `Evidence: ${EVIDENCE_WORDING[info?.source ?? "digitraffic"]} Missing, stale or conflicting records keep the policy pending; they never close it automatically.`,
    `Not covered: container unloading, customs clearance, terminal delays, inland transport or delivery to you. A vessel can arrive on time while your container is delivered late.`,
  ].join("\n");
}

export function termsHash(terms: string): `0x${string}` {
  return keccak256(stringToHex(terms));
}
