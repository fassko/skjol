// End-to-end check of Skjol's paid API from the buyer side, outside the app.
//   RAIL=arc    pays with a Circle Gateway nanopayment on Arc Testnet (deposits 1 USDC first if needed)
//   RAIL=hedera pays with Hedera testnet USDC through the x402 facilitator
// Usage: RAIL=arc BASE=http://localhost:3000 node --env-file=.env.local --import tsx scripts/x402-smoke.mts
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner } from "@x402/hedera";
import { PrivateKey } from "@hiero-ledger/sdk";
import { GatewayClient, registerBatchScheme } from "@circle-fin/x402-batching/client";
import { privateKeyToAccount } from "viem/accounts";

const rail = process.env.RAIL ?? "arc";
const base = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/api/paid/delay-risk?imo=${process.env.IMO ?? "9700017"}&port=${process.env.PORT_LOCODE ?? "FIHEL"}`;
const key = process.env.DEMO_CUSTOMER_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(key);

const client = new x402Client((_v, accepts) => {
  const pick = accepts.find((a) => (rail === "hedera" ? a.network.startsWith("hedera:") : a.network === "eip155:5042002"));
  if (!pick) throw new Error(`Server does not offer the ${rail} rail: ${accepts.map((a) => a.network).join(", ")}`);
  return pick;
});

if (rail === "arc") {
  const gw = new GatewayClient({ chain: "arcTestnet", privateKey: key });
  const bal = await gw.getBalances();
  console.log("gateway balance", JSON.stringify(bal, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  if (Number((bal as { gateway?: { formattedAvailable?: string } }).gateway?.formattedAvailable ?? 0) < 0.05) {
    const d = await gw.deposit(process.env.DEPOSIT ?? "1");
    console.log("deposited", d.formattedAmount, "tx", d.depositTxHash);
  }
  registerBatchScheme(client, { signer: account, networks: ["eip155:5042002"], fallbackScheme: new ExactEvmScheme(account) });
  client.setSpendControls({ allowedAssets: [{ network: "eip155:5042002", asset: "0x3600000000000000000000000000000000000000", maxAmountPerPayment: "100000" }] });
} else {
  const id = process.env.HEDERA_AGENT_ACCOUNT_ID!;
  const raw = process.env.HEDERA_AGENT_PRIVATE_KEY!;
  const pk = /^(0x)?[0-9a-fA-F]{64}$/.test(raw) ? PrivateKey.fromStringECDSA(raw) : PrivateKey.fromStringDer(raw);
  client.register("hedera:testnet", new ExactHederaScheme(createClientHederaSigner(id, pk, { network: "hedera:testnet" })));
  client.setSpendControls({ allowedAssets: [{ network: "hedera:testnet", asset: process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274", maxAmountPerPayment: "100000" }] });
}

const res = await wrapFetchWithPayment(fetch, client)(url);
console.log("HTTP", res.status);
const header = res.headers.get("PAYMENT-RESPONSE");
if (header) console.log("settlement", decodePaymentResponseHeader(header));
console.log(JSON.stringify(await res.json(), null, 2).slice(0, 1500));
