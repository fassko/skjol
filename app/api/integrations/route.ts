import { handle } from "@/lib/http";
import { ARC_TESTNET, ARKIV_RABDI, UNISWAP_V2, chainConfig, config, hederaConfig, poolConfigs, x402Config } from "@/lib/config";
import { addressLink, poolSnapshot, txLink } from "@/lib/chain";
import { SCHEMA_NAMES, writerAddresses } from "@/lib/store/arkiv";
import { store } from "@/lib/store";
import { swarmLabel, swarmMode, swarmPrizeReady } from "@/lib/swarm";
import { formatUsdc } from "@/shared/products";

function formatSnap(snap: Awaited<ReturnType<typeof poolSnapshot>>) {
  const nav =
    snap.totalSupply > 0n
      ? formatUsdc((snap.totalAssets * 1_000_000n) / snap.totalSupply)
      : "1.00";
  return {
    available: formatUsdc(snap.available),
    reserved: formatUsdc(snap.reserved),
    totalAssets: formatUsdc(snap.totalAssets),
    totalSupply: formatUsdc(snap.totalSupply),
    navPerShare: nav,
    shareSymbol: snap.shareSymbol,
    sharePair: snap.sharePair,
    sharePairUrl: snap.sharePair ? addressLink(snap.sharePair) : null,
  };
}

export const GET = handle(async () => {
  const c = chainConfig();
  const pool = await poolSnapshot().catch((e) => ({ error: (e as Error).message }));
  const pools = await Promise.all(
    poolConfigs().map(async (p) => {
      const snap = await poolSnapshot(p).catch((e) => ({ error: (e as Error).message }));
      return {
        currency: p.currency,
        pool: p.pool,
        poolUrl: addressLink(p.pool),
        token: p.token,
        shareSymbol: p.shareSymbol,
        sharePair: p.sharePair,
        sharePairUrl: p.sharePair ? addressLink(p.sharePair) : null,
        snapshot: "error" in snap ? snap : formatSnap(snap),
      };
    }),
  );
  const recentEvents = await store().listChainEvents({ limit: 10 }).catch(() => []);
  const writers = writerAddresses();
  const sim = "simulationOperator" in pool && pool.forwarder?.toLowerCase() === ARC_TESTNET.creSimulationForwarder.toLowerCase();
  return {
    arc: {
      chain: { id: c.id, name: c.name, explorer: c.explorer },
      pool: c.pool,
      poolUrl: addressLink(c.pool),
      usdc: c.usdc,
      snapshot: "error" in pool ? pool : { ...pool, ...formatSnap(pool), available: formatUsdc(pool.available), reserved: formatUsdc(pool.reserved) },
      pools,
      uniswap: {
        factory: UNISWAP_V2.factory,
        factoryUrl: addressLink(UNISWAP_V2.factory),
        router: UNISWAP_V2.router,
        routerUrl: addressLink(UNISWAP_V2.router),
      },
    },
    x402: {
      catalog: "/api/paid/catalog",
      arc: { network: x402Config.arcNetwork, facilitator: x402Config.gatewayUrl(), payTo: x402Config.arcPayTo() ?? null },
      hedera: { network: x402Config.hederaNetwork, facilitator: x402Config.hederaFacilitatorUrl(), payTo: x402Config.hederaPayTo() ?? null, token: x402Config.hederaUsdcToken() },
      auditTopic: hederaConfig.auditTopicId() ?? null,
      auditTopicUrl: hederaConfig.auditTopicId() ? `${hederaConfig.hashscan}/topic/${hederaConfig.auditTopicId()}` : null,
    },
    arkiv: {
      network: "Rabdi testnet",
      chainId: ARKIV_RABDI.id,
      explorer: ARKIV_RABDI.explorer,
      schemas: SCHEMA_NAMES,
      writers,
      writerUrls: Object.fromEntries(Object.entries(writers).map(([k, v]) => [k, `${ARKIV_RABDI.explorer}/address/${v}`])),
      recentEvents: recentEvents.map((e) => ({
        kind: e.kind,
        eventId: e.eventId,
        key: e.key,
        entityUrl: e.key ? `${ARKIV_RABDI.explorer}/entity/${e.key}` : null,
        policyId: e.policyId || null,
        txHash: e.txHash,
        txUrl: txLink(e.txHash),
      })),
    },
    swarm: {
      mode: swarmMode(),
      label: swarmLabel(swarmMode()),
      api: config.swarmApiUrl(),
      postageConfigured: !!config.swarmBatchId(),
      postageNote:
        swarmMode() === "gateway" && !config.swarmBatchId()
          ? "Public gateway stamps uploads server-side (no client-held batch)."
          : swarmMode() === "bee" && !config.swarmBatchId()
            ? "Set SWARM_POSTAGE_BATCH_ID for bee mode."
            : null,
      prizeReady: swarmPrizeReady(),
      docs: "/arkiv/swarm.md",
    },
    cre: {
      chainName: ARC_TESTNET.creChainName,
      forwarder: "error" in pool ? null : pool.forwarder,
      forwarderKind: sim ? "MockKeystoneForwarder (simulation)" : "KeystoneForwarder (production) or custom",
      simulationOperator: "error" in pool ? null : pool.simulationOperator,
      productionForwarder: ARC_TESTNET.creProductionForwarder,
      runner: config.evaluationRunner(),
      /** True only when the pool already points at the production Keystone forwarder. */
      deployed: !("error" in pool) && !!pool.forwarder && pool.forwarder.toLowerCase() === ARC_TESTNET.creProductionForwarder.toLowerCase(),
      mode: sim ? "simulation" : "production-forwarder",
    },
    ai: { enabled: config.aiEnabled() },
    flags: { replay: config.replayEnabled(), demoProducts: config.demoProductsEnabled(), demoWallet: config.demoCustomerEnabled() },
  };
});
