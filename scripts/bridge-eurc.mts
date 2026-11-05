// Bridge test EURC between Ethereum Sepolia / Base Sepolia and Arc Testnet with Circle Bridge Kit.
// Usage: KEY_ENV=DEMO_CUSTOMER_PRIVATE_KEY CHAIN=Ethereum_Sepolia AMOUNT=2 DIRECTION=in \
//          node --env-file=.env.local --import tsx scripts/bridge-eurc.mts
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

const keyEnv = process.env.KEY_ENV ?? "DEMO_CUSTOMER_PRIVATE_KEY";
const privateKey = process.env[keyEnv] as `0x${string}`;
if (!privateKey) throw new Error(`${keyEnv} is not set`);
const chain = process.env.CHAIN ?? "Ethereum_Sepolia";
const amount = process.env.AMOUNT ?? "1";
const direction = process.env.DIRECTION ?? "in";

const kit = new BridgeKit();
kit.on("*", (p: unknown) => console.log("event", JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 240)));
const adapter = createViemAdapterFromPrivateKey({ privateKey });
const from = direction === "in" ? chain : "Arc_Testnet";
const to = direction === "in" ? "Arc_Testnet" : chain;
console.log(`Bridging ${amount} EURC ${from} -> ${to}`);
const r = await kit.bridge({ from: { adapter, chain: from }, to: { adapter, chain: to }, amount, token: "EURC" });
console.log("state", r.state);
for (const s of r.steps) console.log(`${s.state.padEnd(7)} ${s.name.padEnd(12)} ${s.explorerUrl ?? s.txHash ?? ""}`);
