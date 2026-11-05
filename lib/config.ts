import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

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
  /** Evidence source for the app-side evaluator: "live" Digitraffic or "replay" fixtures. */
  evidenceSource: () => (opt("EVIDENCE_SOURCE") ?? "live") as "live" | "replay",
  /** "local-relay" (local chain only) or "cre-simulation"/"cre-deployed" (labels for runs done via the CRE CLI / DON). */
  evaluationRunner: () => (opt("EVALUATION_RUNNER") ?? "cre-simulation") as "local-relay" | "cre-simulation" | "cre-deployed",
  digitrafficBaseUrl: () => opt("DIGITRAFFIC_BASE_URL") ?? "https://meri.digitraffic.fi",
  digitrafficUser: () => opt("DIGITRAFFIC_USER") ?? "skjol-hackathon/0.1",
  cronSecret: () => opt("CRON_SECRET"),
  maxEvidenceAgeSec: () => Number(opt("MAX_EVIDENCE_AGE_SEC") ?? 6 * 3600),
};
