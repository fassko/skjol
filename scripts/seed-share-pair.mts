// Create (if needed) and seed a Uniswap V2 pair: pool shares ↔ settlement token on Arc Testnet.
// Usage: POOL_TOKEN=USDC SEED_AMOUNT=5000000 node --env-file=.env.local --import tsx scripts/seed-share-pair.mts
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../lib/abi/ShipmentDelayPool.ts";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const tokenName = (process.env.POOL_TOKEN ?? "USDC").toUpperCase();
const file = tokenName === "USDC" ? "deployments/arc-testnet.json" : `deployments/arc-testnet-${tokenName.toLowerCase()}.json`;
const dep = JSON.parse(readFileSync(file, "utf8")) as {
  pool: Hex;
  token?: Hex;
  usdc?: Hex;
  uniswap?: { factory?: string; router?: string };
  txs?: Record<string, string>;
};
const pool = dep.pool;
const token = (dep.token ?? dep.usdc) as Hex;
const seed = BigInt(process.env.SEED_AMOUNT ?? "5000000"); // 5 units @ 6dp
const factory = (process.env.UNISWAP_V2_FACTORY ?? dep.uniswap?.factory ?? "0x7483847d46db2920dd64efa676cf72dcf765814f") as Address;
const router = (process.env.UNISWAP_V2_ROUTER ?? dep.uniswap?.router ?? "0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9") as Address;

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const deployer = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: arc, transport: http(RPC) });
const wal = createWalletClient({ chain: arc, transport: http(RPC), account: deployer });

const erc20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
]);
const factoryAbi = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function createPair(address,address) returns (address)",
]);
const routerAbi = parseAbi([
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
]);

const wait = async (label: string, hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} failed: ${hash}`);
  console.log(label, hash);
  return r;
};

const [tokenBal, shareBal] = await Promise.all([
  pub.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [deployer.address] }),
  pub.readContract({ address: pool, abi: poolAbi, functionName: "balanceOf", args: [deployer.address] }),
]);
if (tokenBal < seed) throw new Error(`Need ${seed} ${tokenName} in deployer wallet for pair seed (have ${tokenBal}).`);
if (shareBal < seed) throw new Error(`Need ${seed} pool shares for pair seed (have ${shareBal}). Fund the pool first.`);

let pair = await pub.readContract({ address: factory, abi: factoryAbi, functionName: "getPair", args: [pool, token] });
if (pair === "0x0000000000000000000000000000000000000000") {
  const hash = await wal.writeContract({ address: factory, abi: factoryAbi, functionName: "createPair", args: [pool, token] });
  await wait("createPair", hash);
  pair = await pub.readContract({ address: factory, abi: factoryAbi, functionName: "getPair", args: [pool, token] });
}
console.log("pair", pair);

for (const [label, address, spender] of [
  ["approveToken", token, router],
  ["approveShares", pool, router],
] as const) {
  const allowance = await pub.readContract({ address, abi: erc20, functionName: "allowance", args: [deployer.address, spender] });
  if (allowance < seed) {
    await wait(label, await wal.writeContract({ address, abi: erc20, functionName: "approve", args: [spender, seed] }));
  }
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
const liqHash = await wal.writeContract({
  address: router,
  abi: routerAbi,
  functionName: "addLiquidity",
  args: [pool, token, seed, seed, (seed * 95n) / 100n, (seed * 95n) / 100n, deployer.address, deadline],
});
await wait("addLiquidity", liqHash);

dep.uniswap = { factory, router, ...(dep.uniswap ?? {}) };
(dep as { sharePair?: string }).sharePair = pair;
dep.txs = { ...(dep.txs ?? {}), addLiquidity: liqHash };
writeFileSync(file, JSON.stringify(dep, null, 2) + "\n");
console.log(`seeded ${seed} shares + ${seed} ${tokenName} →`, file);
