// Take over a pool that Arc Studio deployed, and point Skjol at it.
// Studio deploys from its Circle wallet and calls transferOwnership(DEPLOYER_ADDRESS); ownership is
// two-step, so this script accepts it, sets the CRE simulation operator, funds the pool, writes
// deployments/arc-testnet.json and adds the pool to the CRE configs. Prints no secrets.
// Then seed the Uniswap pair: POOL_TOKEN=USDC SEED_AMOUNT=2000000 ... scripts/seed-share-pair.mts
// Usage: POOL=0x… DEPLOY_TX=0x… POOL_FUNDING=10000000 node --env-file=.env.local --import tsx scripts/adopt-studio-pool.mts
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../lib/abi/ShipmentDelayPool.ts";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as const;
const MOCK_FORWARDER = "0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1";
const STUDIO_APP = "https://studio.arc.io/app/03aa1ed4-209d-44ee-b09c-2523a48babe3";
if (!process.env.POOL || !process.env.DEPLOY_TX) throw new Error("Set POOL (new pool address) and DEPLOY_TX (Studio's deploy transaction).");
const pool = getAddress(process.env.POOL);
const deployTx = process.env.DEPLOY_TX as Hex;
const funding = BigInt(process.env.POOL_FUNDING ?? "10000000");

const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const me = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: arc, transport: http(RPC) });
const wal = createWalletClient({ chain: arc, transport: http(RPC), account: me });
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const ownable2 = parseAbi(["function pendingOwner() view returns (address)", "function acceptOwnership()"]);
const read = <T,>(functionName: string, abi: readonly unknown[] = poolAbi, args: unknown[] = []) =>
  pub.readContract({ address: pool, abi: abi as typeof poolAbi, functionName: functionName as never, args: args as never }) as Promise<T>;

const txs: Record<string, string> = { deploy: deployTx };
const send = async (label: string, hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} failed: ${hash}`);
  txs[label] = hash;
  console.log(label, hash);
};

const deployReceipt = await pub.getTransactionReceipt({ hash: deployTx });
if (deployReceipt.contractAddress && getAddress(deployReceipt.contractAddress) !== pool) {
  throw new Error(`DEPLOY_TX created ${deployReceipt.contractAddress}, not ${pool}`);
}
const studioWallet = deployReceipt.from;

// Sanity: this must be the reviewed-and-fixed contract, not an older build.
await read<bigint>("MIN_LIVE_SHARES").catch(() => {
  throw new Error("Pool has no MIN_LIVE_SHARES(): it is not the fixed contract. Make Studio deploy arc-studio/contracts/ShipmentDelayPool.sol.");
});
if (getAddress(await read<Hex>("asset")) !== USDC) throw new Error("Pool asset is not Arc USDC.");

if (getAddress(await read<Hex>("owner")) !== me.address) {
  const pending = await read<Hex>("pendingOwner", ownable2);
  if (getAddress(pending) !== me.address) throw new Error(`Owner is ${await read("owner")}; ask Studio to call transferOwnership(${me.address}) first.`);
  await send("acceptOwnership", await wal.writeContract({ address: pool, abi: ownable2, functionName: "acceptOwnership" }));
}

const forwarder = getAddress(await read<Hex>("getForwarderAddress"));
if (forwarder === getAddress(MOCK_FORWARDER) && getAddress(await read<Hex>("simulationOperator")) !== me.address) {
  await send("setSimulationOperator", await wal.writeContract({ address: pool, abi: poolAbi, functionName: "setSimulationOperator", args: [me.address] }));
}

if (funding > 0n) {
  await send("approve", await wal.writeContract({ address: USDC, abi: erc20, functionName: "approve", args: [pool, funding] }));
  await send("fund", await wal.writeContract({ address: pool, abi: poolAbi, functionName: "fund", args: [funding] }));
}

const file = "deployments/arc-testnet.json";
const prev = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
writeFileSync("deployments/arc-testnet-studio-v1.json", JSON.stringify(prev, null, 2) + "\n");
const out = {
  ...prev,
  builtWith: "Arc Studio",
  arcStudioApp: STUDIO_APP,
  deployer: studioWallet,
  deployerKind: "Circle developer-controlled wallet (Arc Studio)",
  owner: me.address,
  quoteSigner: await read<Hex>("quoteSigner"),
  forwarder,
  simulationOperator: await read<Hex>("simulationOperator"),
  pool,
  deployBlock: deployReceipt.blockNumber.toString(),
  txs,
  poolBalance: (await pub.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [pool] })).toString(),
  deployerShares: (await read<bigint>("balanceOf", poolAbi, [me.address])).toString(),
  previousPool: prev.pool,
  sharePair: null,
};
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");

for (const cfg of ["cre/arrival-evaluator/config.live.json", "cre/arrival-evaluator/config.replay.json"]) {
  const c = JSON.parse(readFileSync(cfg, "utf8")) as { poolAddress: string; poolAddresses: string[] };
  c.poolAddress = pool.toLowerCase();
  c.poolAddresses = [pool.toLowerCase(), ...c.poolAddresses.filter((p) => p.toLowerCase() !== pool.toLowerCase())];
  writeFileSync(cfg, JSON.stringify(c, null, 2) + "\n");
}

console.log(`
Done. ${file} updated (previous record kept in deployments/arc-testnet-studio-v1.json); CRE configs list the new pool first.
Next:
  1. POOL_TOKEN=USDC SEED_AMOUNT=2000000 node --env-file=.env.local --import tsx scripts/seed-share-pair.mts
  2. Set in .env.local and Vercel (Production + Preview), then redeploy production:
     ARC_POOL_ADDRESS=${pool}
     NEXT_PUBLIC_POOL_ADDRESS=${pool}
     ARC_POOL_DEPLOY_BLOCK=${deployReceipt.blockNumber}
     USDC_SHARE_PAIR / NEXT_PUBLIC_USDC_SHARE_PAIR = the pair printed by step 1
  3. Update the addresses in README.md, FEEDBACK.md, docs/arc-studio.md and arc-studio/src/contract.ts.`);
