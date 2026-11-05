import { handle } from "@/lib/http";
import { ARC_TESTNET, ARKIV_RABDI, chainConfig, config } from "@/lib/config";
import { addressLink, poolSnapshot } from "@/lib/chain";
import { SCHEMA_NAMES, writerAddresses } from "@/lib/store/arkiv";
import { store } from "@/lib/store";
import { swarmLabel, swarmMode } from "@/lib/swarm";
import { formatUsdc } from "@/shared/products";

export const GET = handle(async () => {
  const c = chainConfig();
  const pool = await poolSnapshot().catch((e) => ({ error: (e as Error).message }));
  const recentEvents = await store().listChainEvents({ limit: 10 }).catch(() => []);
  const writers = writerAddresses();
  const sim = "simulationOperator" in pool && pool.forwarder?.toLowerCase() === ARC_TESTNET.creSimulationForwarder.toLowerCase();
  return {
    arc: {
      chain: { id: c.id, name: c.name, explorer: c.explorer },
      pool: c.pool,
      poolUrl: addressLink(c.pool),
      usdc: c.usdc,
      snapshot: "error" in pool ? pool : { ...pool, available: formatUsdc(pool.available), reserved: formatUsdc(pool.reserved) },
    },
    arkiv: {
      network: "Rabdi testnet",
      chainId: ARKIV_RABDI.id,
      explorer: ARKIV_RABDI.explorer,
      schemas: SCHEMA_NAMES,
      writers,
      writerUrls: Object.fromEntries(Object.entries(writers).map(([k, v]) => [k, `${ARKIV_RABDI.explorer}/address/${v}`])),
      recentEvents: recentEvents.map((e) => ({ kind: e.kind, eventId: e.eventId, key: e.key })),
      sampleQuery: `publicClient.select().from(defineSchema("skjol.v1.chain-event", {...})).createdBy("${writers.sync}").where(eq("kind", "PolicyPaidOut")).fetch()`,
    },
    swarm: { mode: swarmMode(), label: swarmLabel(swarmMode()), api: config.swarmApiUrl() },
    cre: {
      chainName: ARC_TESTNET.creChainName,
      forwarder: "error" in pool ? null : pool.forwarder,
      forwarderKind: sim ? "MockKeystoneForwarder (simulation)" : "KeystoneForwarder (production) or custom",
      simulationOperator: "error" in pool ? null : pool.simulationOperator,
      productionForwarder: ARC_TESTNET.creProductionForwarder,
      runner: config.evaluationRunner(),
      deployed: false,
    },
    ai: { enabled: config.aiEnabled(), model: config.aiEnabled() ? config.aiModel() : null },
    flags: { replay: config.replayEnabled(), demoProducts: config.demoProductsEnabled(), demoWallet: config.demoCustomerEnabled() },
  };
});
