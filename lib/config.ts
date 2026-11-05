import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import type { EvidenceSourceKey } from "../shared/ports";

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function req(name: string): string {
  const v = opt(name);
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export type ChainMode = "arc-testnet" | "local";

export const ARC_TESTNET = {
  id: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorer: "https://explorer.testnet.arc.io",
  usdc: "0x3600000000000000000000000000000000000000" as Address, // ERC-20 interface, 6 decimals
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address, // Circle EURC, 6 decimals
  creSimulationForwarder: "0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" as Address, // MockKeystoneForwarder
  creProductionForwarder: "0x76c9cf548b4179F8901cda1f8623568b58215E62" as Address, // KeystoneForwarder
  creChainName: "arc-testnet",
};

export const ARKIV_RABDI = {
  id: 7794095,
  explorer: "https://rabdi.explorer.arkiv.network",
};

export function chainMode(): ChainMode {
  return (opt("CHAIN_MODE") as ChainMode) ?? "arc-testnet";
}

export function chainConfig() {
  const mode = chainMode();
  if (mode === "local") {
    return {
      mode,
      id: Number(opt("LOCAL_CHAIN_ID") ?? 31337),
      name: "Local Anvil (demo)",
      rpcUrl: opt("LOCAL_RPC_URL") ?? "http://127.0.0.1:8545",
      explorer: null as string | null,
      usdc: req("LOCAL_USDC_ADDRESS") as Address,
      pool: req("LOCAL_POOL_ADDRESS") as Address,
      deployBlock: BigInt(opt("LOCAL_POOL_DEPLOY_BLOCK") ?? "0"),
    };
  }
  return {
    mode,
    id: ARC_TESTNET.id,
    name: ARC_TESTNET.name,
    rpcUrl: opt("ARC_RPC_URL") ?? ARC_TESTNET.rpcUrl,
    explorer: ARC_TESTNET.explorer as string | null,
    usdc: (opt("ARC_USDC_ADDRESS") ?? ARC_TESTNET.usdc) as Address,
    pool: (opt("ARC_POOL_ADDRESS") ?? opt("NEXT_PUBLIC_POOL_ADDRESS")) as Address,
    deployBlock: BigInt(opt("ARC_POOL_DEPLOY_BLOCK") ?? "0"),
  };
}

export type Currency = "USDC" | "EURC";

export interface PoolConfig {
  currency: Currency;
  pool: Address;
  token: Address;
  deployBlock: bigint;
}

/** Every configured pool. USDC is the primary pool; the EURC pool is optional. */
export function poolConfigs(): PoolConfig[] {
  const c = chainConfig();
  const out: PoolConfig[] = [];
  if (c.pool) out.push({ currency: "USDC", pool: c.pool, token: c.usdc, deployBlock: c.deployBlock });
  const eurcPool = opt("ARC_EURC_POOL_ADDRESS") ?? opt("NEXT_PUBLIC_EURC_POOL_ADDRESS");
  if (c.mode === "arc-testnet" && eurcPool) {
    out.push({
      currency: "EURC",
      pool: eurcPool as Address,
      token: (opt("ARC_EURC_ADDRESS") ?? ARC_TESTNET.eurc) as Address,
      deployBlock: BigInt(opt("ARC_EURC_POOL_DEPLOY_BLOCK") ?? "0"),
    });
  }
  return out;
}

export function poolFor(currency: Currency): PoolConfig | null {
  return poolConfigs().find((p) => p.currency === currency) ?? null;
}

export function poolByAddress(pool: string): PoolConfig | null {
  return poolConfigs().find((p) => p.pool.toLowerCase() === pool.toLowerCase()) ?? null;
}

export function account(envName: string) {
  return privateKeyToAccount(req(envName) as Hex);
}

export function optionalAccount(envName: string) {
  const v = opt(envName);
  return v ? privateKeyToAccount(v as Hex) : null;
}

export const config = {
  arkivAccessKey: () => opt("ARKIV_ACCESS_KEY") ?? "",
  /** Store backend: "arkiv" (Rabdi testnet) or "memory" (unit tests only). */
  storeBackend: () => (opt("STORE_BACKEND") ?? "arkiv") as "arkiv" | "memory",
  masterKey: () => req("SKJOL_MASTER_KEY"),
  sessionSecret: () => req("SESSION_SECRET"),
  swarmMode: () => (opt("SWARM_MODE") ?? "gateway") as "gateway" | "bee" | "local-dev",
  swarmApiUrl: () => opt("SWARM_API_URL") ?? "https://api.gateway.ethswarm.org",
  swarmBatchId: () => opt("SWARM_POSTAGE_BATCH_ID"),
  aiModel: () => opt("AI_MODEL") ?? "google/gemini-3.8-flash",
  aiEnabled: () => !!(opt("AI_GATEWAY_API_KEY") || opt("VERCEL_OIDC_TOKEN")),
  demoProductsEnabled: () => opt("DEMO_PRODUCTS_ENABLED") === "true",
  demoCustomerEnabled: () => opt("DEMO_CUSTOMER_ENABLED") === "true" && !!opt("DEMO_CUSTOMER_PRIVATE_KEY"),
  /** Enables the labelled replay endpoint and synthetic demo arrivals. */
  replayEnabled: () => opt("REPLAY_ENABLED") === "true",
  /** Evidence source for the app-side evaluator: "live" (Digitraffic / VesselFinder) or "replay" fixtures. */
  evidenceSource: () => (opt("EVIDENCE_SOURCE") ?? "live") as "live" | "replay",
  /** "local-relay" (local chain only) or "cre-simulation"/"cre-deployed" (labels for runs done via the CRE CLI / DON). */
  evaluationRunner: () => (opt("EVALUATION_RUNNER") ?? "cre-simulation") as "local-relay" | "cre-simulation" | "cre-deployed",
  digitrafficBaseUrl: () => opt("DIGITRAFFIC_BASE_URL") ?? "https://meri.digitraffic.fi",
  digitrafficUser: () => opt("DIGITRAFFIC_USER") ?? "skjol-hackathon/0.1",
  /** VesselFinder PortCalls (Indian ports). Without a key those ports are not offered for real products. */
  vesselFinderBaseUrl: () => opt("VESSELFINDER_BASE_URL") ?? "https://api.vesselfinder.com",
  vesselFinderApiKey: () => opt("VESSELFINDER_API_KEY"),
  /**
   * Sources able to settle a product here. Real products need a live source; the test-only demo
   * product can also settle from labelled synthetic arrivals when replay is enabled.
   */
  availableEvidenceSources: (demoOnly: boolean): EvidenceSourceKey[] => {
    if (demoOnly && opt("REPLAY_ENABLED") === "true") return ["digitraffic", "vesselfinder"];
    return opt("VESSELFINDER_API_KEY") ? ["digitraffic", "vesselfinder"] : ["digitraffic"];
  },
  cronSecret: () => opt("CRON_SECRET"),
  maxEvidenceAgeSec: () => Number(opt("MAX_EVIDENCE_AGE_SEC") ?? 6 * 3600),
  /** Public base URL of this deployment, used in x402 resource URLs. */
  publicBaseUrl: () => (opt("PUBLIC_BASE_URL") ?? (opt("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${opt("VERCEL_PROJECT_PRODUCTION_URL")}` : "http://localhost:3000")).replace(/\/$/, ""),
};

// x402 paid API (seller side) and the freight agent (buyer side).
export const x402Config = {
  /** Circle Gateway (nanopayments, batched settlement) facilitator for Arc Testnet. */
  gatewayUrl: () => opt("CIRCLE_GATEWAY_URL") ?? "https://gateway-api-testnet.circle.com",
  /** Facilitator that verifies and settles `hedera:testnet` exact payments. */
  hederaFacilitatorUrl: () => opt("HEDERA_FACILITATOR_URL") ?? "https://x402.org/facilitator",
  arcNetwork: "eip155:5042002" as const,
  hederaNetwork: "hedera:testnet" as const,
  /** Seller address receiving Arc nanopayments (Gateway balance). */
  arcPayTo: () => (opt("X402_ARC_PAY_TO") ?? opt("DEPLOYER_ADDRESS")) as Address | undefined,
  /** Seller Hedera account (0.0.x) receiving Hedera USDC; must be associated with the token. */
  hederaPayTo: () => opt("HEDERA_PAYEE_ACCOUNT_ID"),
  /** Hedera testnet USDC (HTS token). */
  hederaUsdcToken: () => opt("HEDERA_USDC_TOKEN_ID") ?? "0.0.429274",
};

export const hederaConfig = {
  agentAccountId: () => opt("HEDERA_AGENT_ACCOUNT_ID"),
  agentPrivateKey: () => opt("HEDERA_AGENT_PRIVATE_KEY"),
  auditTopicId: () => opt("HEDERA_AUDIT_TOPIC_ID"),
  hashscan: "https://hashscan.io/testnet",
  enabled: () => !!(opt("HEDERA_AGENT_ACCOUNT_ID") && opt("HEDERA_AGENT_PRIVATE_KEY")),
};

/** Defaults for the agent's spending controls (each user can tighten them in /agent). Units: USD micro (6 dp). */
export const agentDefaults = {
  perCallMax: () => BigInt(opt("AGENT_PER_CALL_MAX_UNITS") ?? "50000"), // 0.05
  dailyCap: () => BigInt(opt("AGENT_DAILY_CAP_UNITS") ?? "2000000"), // 2.00 (data + cover)
  approvalThreshold: () => BigInt(opt("AGENT_APPROVAL_THRESHOLD_UNITS") ?? "500000"), // cover above 0.50 needs a tap
  globalKillSwitch: () => opt("AGENT_PAUSED") === "true",
};
