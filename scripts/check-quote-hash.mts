// Cross-check: viem EIP-712 hash of a quote == ShipmentDelayPool.hashQuote onchain.
import { createPublicClient, hashTypedData, http, type Hex } from "viem";
import { poolAbi } from "../lib/abi/ShipmentDelayPool.ts";
import { QUOTE_TYPES, buildQuoteMessage, quoteDomain } from "../shared/quote.ts";
import { PRODUCTS } from "../shared/products.ts";
import { SCENARIOS } from "../fixtures/scenarios.ts";
const pool = process.env.ARC_POOL_ADDRESS as Hex;
const pub = createPublicClient({ transport: http("https://rpc.testnet.arc.network") });
const { message } = buildQuoteMessage({ shipmentId: "shp_check", shipment: SCENARIOS[0].shipment, product: PRODUCTS["delay-standard-24h"], beneficiary: "0x6518EAD9698ed3dD08845C9103f755D1D1a4cc47", nowSec: 1_796_000_000 });
const local = hashTypedData({ domain: quoteDomain(5042002, pool), types: QUOTE_TYPES, primaryType: "Quote", message });
const onchain = await pub.readContract({ address: pool, abi: poolAbi, functionName: "hashQuote", args: [message] });
console.log("viem   ", local); console.log("onchain", onchain); console.log(local === onchain ? "MATCH" : "MISMATCH");
