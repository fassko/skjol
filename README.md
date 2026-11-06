# Skjol

**[Open the live app](https://skjol-insurance.vercel.app)** · [How it’s built](https://skjol-insurance.vercel.app/integrations)

Parametric **arrival delay cover** for small importers: pay a fixed premium in test USDC/EURC; if the named vessel’s recorded arrival at the named port is more than 24 hours after the agreed deadline, a fixed payout is sent to the wallet.

Built for ETHGlobal Mumbai on **Arc** (settlement), **Arkiv** (application DB), **Swarm** (encrypted BoL storage), and **Chainlink CRE** (arrival evaluation).

**Arc Studio project:** [studio.arc.io/app/03aa1ed4-…](https://studio.arc.io/app/03aa1ed4-209d-44ee-b09c-2523a48babe3). The USDC pool was tested and deployed in Arc Studio, which also built a pool app on it. Arc bounty: *Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio*. Details: [`docs/arc-studio.md`](./docs/arc-studio.md).

## How it works

1. **Upload a bill of lading** and confirm the vessel, destination port, and arrival deadline.
2. **Choose cover and pay a fixed premium** in test USDC or EURC. The pool reserves the payout when you buy.
3. **Evaluate the arrival evidence.** If the recorded arrival is more than 24 hours late, the pool sends the fixed payout to your wallet.

Try [Get cover](https://skjol-insurance.vercel.app/cover) with **Use demo wallet (test funds)**. This is a testnet prototype built for ETHGlobal Mumbai. Chainlink CRE currently runs through local simulation with a test forwarder; production DON deployment is pending. See the [CRE workflow notes](./cre/README.md).

## How it’s built

![Skjol system diagram: funders deposit capital into the Arc pool, importers buy delay cover, Chainlink CRE evaluates arrival evidence, Arkiv stores records, Swarm stores encrypted documents, and the pool pays the importer.](./docs/architecture.svg)

The system diagram from the app’s [How it’s built page](https://skjol-insurance.vercel.app/integrations).

- **Arc:** USDC/EURC pools reserve collateral and settle payouts. Capital funders receive ERC-4626 shares, with share trading through Uniswap V2. The USDC pool ([`0x2beb…8fa4`](https://explorer.testnet.arc.io/address/0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4)) was deployed from [Arc Studio](https://studio.arc.io/app/03aa1ed4-209d-44ee-b09c-2523a48babe3); its Studio app is in [`arc-studio/`](./arc-studio).
- **Chainlink CRE:** evaluates port-call evidence from Digitraffic or VesselFinder, with labelled replay data for demos.
- **Arkiv:** stores shipment, policy, and event records, including sealed document references.
- **Swarm:** stores AES-256-GCM-encrypted bills of lading; decryption keys stay on the server.
- **Freight agent:** discovers and pays for port data through Arc nanopayments or Hedera x402, and buys cover within configured limits. Available through the [agent UI](https://skjol-insurance.vercel.app/agent) and MCP.

License: [MIT](./LICENSE).

## Arkiv writers + one query you can run

Rabdi testnet · chain id `7794095` · explorer https://rabdi.explorer.arkiv.network

Writer wallets (from `ARKIV_*_PRIVATE_KEY`):

| Role | Address |
|------|---------|
| app | [`0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F`](https://rabdi.explorer.arkiv.network/address/0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F) |
| observer | [`0x6da9E22E6833605f5a4b45F6F2bCb2362EDEE4Ee`](https://rabdi.explorer.arkiv.network/address/0x6da9E22E6833605f5a4b45F6F2bCb2362EDEE4Ee) |
| sync | [`0x93c3deaEDDb1B2E66082a1445bC0f25fb2487f5B`](https://rabdi.explorer.arkiv.network/address/0x93c3deaEDDb1B2E66082a1445bC0f25fb2487f5B) |

Example shipment entity (encrypted BoL on Swarm, metadata on Arkiv):

- https://rabdi.explorer.arkiv.network/entity/0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d
- Swarm ciphertext: https://api.gateway.ethswarm.org/bytes/07c7603b501ecbaa138a31768a2cf4e64ed2d28bcde18f49036b9b094989b0fe

Query that shipment by id (schema `skjol.v1.shipment`, writer = app):

```ts
import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { defineSchema, str } from "@arkiv-network/sdk/schema";
import { eq } from "@arkiv-network/sdk/query";
import { http } from "viem";

const Shipments = defineSchema("skjol.v1.shipment", {
  shipmentId: str().indexed(),
  status: str().indexed(),
  dataLabel: str().indexed(),
});

const client = createPublicClient({
  chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY! }),
  transport: http(),
});

const { entities } = await client
  .select({ $key: true, $expiresAt: true, status: true, dataLabel: true })
  .from(Shipments)
  .createdBy("0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F")
  .where(eq("shipmentId", "shp_08a9642d8966468f922e"))
  .fetch();
```

Prize docs: [`arkiv/schema.md`](./arkiv/schema.md), [`arkiv/friction.md`](./arkiv/friction.md), [`arkiv/reach.md`](./arkiv/reach.md), [`arkiv/why-arkiv.md`](./arkiv/why-arkiv.md), [`arkiv/how-you-use-arkiv.md`](./arkiv/how-you-use-arkiv.md), [`arkiv/swarm.md`](./arkiv/swarm.md).

## Swarm (encrypted documents)

BoLs are AES-256-GCM encrypted in the app, uploaded to Swarm `/bytes` (public gateway stamps postage server-side; own Bee uses `SWARM_POSTAGE_BATCH_ID`), then the content reference is sealed inside the Arkiv shipment entity. See [`arkiv/swarm.md`](./arkiv/swarm.md).

Demo checklist:

1. Set `SWARM_MODE=gateway` (or `bee` + postage) — not `local-dev` for judges.
2. Confirm `/integrations` shows Swarm **prize-ready**.
3. `POST /api/swarm/roundtrip` or upload on `/cover` and open the Storage strip links.

## Freight agent (MCP)

`/agent` is a phone agent that finds paid port data, pays each call itself (Arc nanopayments or Hedera USDC via x402), and buys arrival-delay cover inside limits set on the server. Test stablecoins only.

The same tools are an MCP server at `POST /api/mcp`. The client brings the model. Skjol still checks the payee allow-list, the spending limits, and the cover approval before anything is signed.

Sign in on `/agent`, open **Wallet & limits**, and choose **Show MCP token**. The token is the sign-in session and expires with it (12 hours).

```json
{
  "mcpServers": {
    "skjol-freight": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer <token from /agent>" }
    }
  }
}
```

Tools: `discoverServices`, `callPaidService`, `listShipments`, `getShipment`, `getQuotes`, `buyCover`, `approveCover`, `getSpendingStatus`. Premiums above the approval threshold (default 0.50) go through `approveCover`, which asks the person in the MCP client before it mints a token for `buyCover`.

Details: [`docs/freight-agent-x402.md`](./docs/freight-agent-x402.md).

## Develop

```bash
pnpm install
cp .env.example .env.local   # fill secrets
pnpm dev
```

## How we used AI

Cursor / Composer agents helped implement Swarm postage + Bee tags, the Storage strip UI, and the `/arkiv` prize documentation. Product rules, contracts, and Arkiv schemas were directed by the team; AI-generated text was reviewed before submit.
