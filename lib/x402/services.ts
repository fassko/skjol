import "server-only";
import { ARC_TESTNET, config, x402Config } from "../config";
import { SUPPORTED_PORTS } from "../../shared/products";

// Skjol's paid data services. One definition feeds the x402 route config, the public catalog
// (Circle Discovery API listing shape) and the freight agent's spending checks.

export interface PaidService {
  id: "vessel-arrivals" | "delay-risk";
  path: string;
  method: "GET";
  /** USD price per call, charged in USDC on Arc (Circle Gateway) or USDC on Hedera testnet. */
  price: `$${string}`;
  priceUnits: bigint;
  description: string;
  tags: string[];
  input: Record<string, string>;
  inputSchema: { properties: Record<string, { type: string; description: string; enum?: string[] }>; required: string[] };
  outputExample: Record<string, unknown>;
}

const portEnum = Object.keys(SUPPORTED_PORTS);

export const PAID_SERVICES: PaidService[] = [
  {
    id: "vessel-arrivals",
    path: "/api/paid/vessel-arrivals",
    method: "GET",
    price: "$0.005",
    priceUnits: 5_000n,
    description: "Recorded port calls (ETA, actual arrival, status) for one vessel at a Finnish port, normalised from Fintraffic Digitraffic.",
    tags: ["shipping", "maritime", "port-calls", "logistics", "digitraffic"],
    input: { imo: "9700017", port: "FIHEL" },
    inputSchema: {
      properties: {
        imo: { type: "string", description: "7-digit IMO number of the vessel" },
        port: { type: "string", description: "UN/LOCODE of a supported Finnish port", enum: portEnum },
      },
      required: ["imo", "port"],
    },
    outputExample: { vesselImo: "9700017", port: "FIHEL", origin: "live", records: [{ eventTimestamp: "2026-11-01T06:10:00Z", latestEta: "2026-11-01T05:30:00Z", sourceStatus: "Arrived" }] },
  },
  {
    id: "delay-risk",
    path: "/api/paid/delay-risk",
    method: "GET",
    price: "$0.01",
    priceUnits: 10_000n,
    description:
      "Arrival delay signal for a vessel heading to a Finnish port: latest ETA versus your agreed deadline, recent ETA accuracy and a low/elevated/high band. Informational; Skjol cover is priced by fixed rules.",
    tags: ["shipping", "maritime", "risk", "insurance", "eta"],
    input: { imo: "9700017", port: "FIHEL", deadline: "2026-12-10T12:00:00Z" },
    inputSchema: {
      properties: {
        imo: { type: "string", description: "7-digit IMO number of the vessel" },
        port: { type: "string", description: "UN/LOCODE of a supported Finnish port", enum: portEnum },
        deadline: { type: "string", description: "Agreed arrival deadline (ISO 8601, UTC). Optional." },
      },
      required: ["imo", "port"],
    },
    outputExample: { band: "elevated", latestEta: "2026-12-10T20:00:00Z", etaVsDeadlineHours: 8, recentCalls: 6, meanEtaErrorHours: 3.1 },
  },
];

export function serviceByPath(path: string) {
  return PAID_SERVICES.find((s) => s.path === path) ?? null;
}

export function serviceUrl(s: PaidService) {
  return `${config.publicBaseUrl()}${s.path}`;
}

/** Catalog entries in the Circle Agent Marketplace Discovery API `ServiceListing` shape. */
export function catalog() {
  const arcPayTo = x402Config.arcPayTo();
  const hederaPayTo = x402Config.hederaPayTo();
  return PAID_SERVICES.map((s) => ({
    resource: serviceUrl(s),
    type: "http",
    x402Version: 2,
    accepts: [
      ...(arcPayTo ? [{ scheme: "exact", network: x402Config.arcNetwork, asset: ARC_TESTNET.usdc, amount: s.priceUnits.toString(), payTo: arcPayTo, extra: { name: "GatewayWalletBatched" } }] : []),
      ...(hederaPayTo ? [{ scheme: "exact", network: x402Config.hederaNetwork, asset: x402Config.hederaUsdcToken(), amount: s.priceUnits.toString(), payTo: hederaPayTo }] : []),
    ],
    metadata: {
      provider: {
        name: "Skjol",
        description: "Parametric vessel-arrival delay cover and Finnish port-call data",
        category: "FINANCIAL_ANALYSIS",
        tags: s.tags,
        website: config.publicBaseUrl(),
      },
      path: s.path,
      method: s.method,
      description: s.description,
      mimeType: "application/json",
      input: { type: "object", ...s.inputSchema },
      output: { type: "object", example: s.outputExample },
      siwx: false,
      supportsVanillax402: !!hederaPayTo,
      supportsCircleGateway: !!arcPayTo,
    },
  }));
}
