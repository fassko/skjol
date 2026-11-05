// Deploy ShipmentDelayPool to Arc Testnet with viem (the node does gas estimation, so Arc's
// USDC precompiles are handled natively). Writes deployments/arc-testnet.json. Prints no secrets.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { poolAbi, poolBytecode } from "../lib/abi/ShipmentDelayPool.ts";

const RPC = process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network";
const USDC = "0x3600000000000000000000000000000000000000" as const;
const MOCK_FORWARDER = "0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" as const; // CRE simulation (Arc Testnet)
const arc = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const deployer = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const signer = privateKeyToAccount(process.env.QUOTE_SIGNER_PRIVATE_KEY as Hex);
const forwarder = (process.env.CRE_FORWARDER ?? MOCK_FORWARDER) as Hex;
const funding = BigInt(process.env.POOL_FUNDING ?? "10000000");
const pub = createPublicClient({ chain: arc, transport: http(RPC) });
const wal = createWalletClient({ chain: arc, transport: http(RPC), account: deployer });
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

const out: Record<string, unknown> = { network: "arc-testnet", chainId: 5042002, usdc: USDC, forwarder, forwarderKind: forwarder === MOCK_FORWARDER ? "MockKeystoneForwarder (CRE simulation)" : "custom", deployer: deployer.address, quoteSigner: signer.address, txs: {} as Record<string, string> };
const txs = out.txs as Record<string, string>;
const wait = async (label: string, hash: Hex) => { const r = await pub.waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error(`${label} failed: ${hash}`); txs[label] = hash; console.log(label, hash); return r; };

const deployHash = await wal.deployContract({ abi: poolAbi, bytecode: poolBytecode, args: [forwarder, USDC, signer.address, 20_000_000n, 6n * 3600n, 60n, 30n * 86400n] });
const dr = await wait("deploy", deployHash);
const pool = dr.contractAddress!;
out.pool = pool; out.deployBlock = dr.blockNumber.toString();
console.log("pool", pool, "block", dr.blockNumber);
if (forwarder === MOCK_FORWARDER) await wait("setSimulationOperator", await wal.writeContract({ address: pool, abi: poolAbi, functionName: "setSimulationOperator", args: [deployer.address] }));
out.simulationOperator = forwarder === MOCK_FORWARDER ? deployer.address : null;
if (funding > 0n) {
  await wait("approve", await wal.writeContract({ address: USDC, abi: erc20, functionName: "approve", args: [pool, funding] }));
  await wait("fund", await wal.writeContract({ address: pool, abi: poolAbi, functionName: "fund", args: [funding] }));
}
out.poolBalance = (await pub.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [pool] })).toString();
mkdirSync("deployments", { recursive: true });
writeFileSync("deployments/arc-testnet.json", JSON.stringify(out, null, 2) + "\n");
console.log("pool USDC balance (6dp units):", out.poolBalance);
