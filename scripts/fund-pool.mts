// Fund a ShipmentDelayPool with its settlement token from the deployer wallet.
// Usage: POOL_TOKEN=EURC AMOUNT=10000000 node --env-file=.env.local --import tsx scripts/fund-pool.mts
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi } from "../lib/abi/ShipmentDelayPool.ts";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const tokenName = (process.env.POOL_TOKEN ?? "USDC").toUpperCase();
const file = tokenName === "USDC" ? "deployments/arc-testnet.json" : `deployments/arc-testnet-${tokenName.toLowerCase()}.json`;
const dep = JSON.parse(readFileSync(file, "utf8")) as { pool: Hex; token?: Hex; usdc?: Hex };
const token = (dep.token ?? dep.usdc) as Hex;
const amount = BigInt(process.env.AMOUNT ?? "10000000");
const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const deployer = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: arc, transport: http(RPC) });
const wal = createWalletClient({ chain: arc, transport: http(RPC), account: deployer });
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

const held = await pub.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [deployer.address] });
if (held < amount) throw new Error(`Deployer holds ${held} ${tokenName} units, needs ${amount}. Get test ${tokenName} from https://faucet.circle.com (Arc Testnet).`);
for (const [label, hash] of [
  ["approve", await wal.writeContract({ address: token, abi: erc20, functionName: "approve", args: [dep.pool, amount] })],
] as const) {
  await pub.waitForTransactionReceipt({ hash });
  console.log(label, hash);
}
const fund = await wal.writeContract({ address: dep.pool, abi: poolAbi, functionName: "fund", args: [amount] });
await pub.waitForTransactionReceipt({ hash: fund });
console.log("fund", fund);
console.log(`pool ${tokenName} balance:`, (await pub.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [dep.pool] })).toString());
