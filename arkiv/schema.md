# Arkiv schema

Skjol’s application database on **Arkiv Rabdi testnet** (chain id `7794095`). Schemas are defined in [`lib/store/arkiv.ts`](../lib/store/arkiv.ts) with `@arkiv-network/sdk`.

Authenticity: every read is filtered by the authorised **writer** address (`createdBy`). Schema names only namespace fields.

## Writers

| Role | Env key | Writes |
|------|---------|--------|
| `app` | `ARKIV_APP_PRIVATE_KEY` | shipments, quotes, agent spend/settings |
| `observer` | `ARKIV_OBSERVER_PRIVATE_KEY` | observations, evaluations |
| `sync` | `ARKIV_SYNC_PRIVATE_KEY` | policies, chain events, sync cursors |

Addresses:

- app: [`0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F`](https://rabdi.explorer.arkiv.network/address/0xDc19D52102BEe63eD7eA5cf10B040A1F2B81E75F)
- observer: [`0x6da9E22E6833605f5a4b45F6F2bCb2362EDEE4Ee`](https://rabdi.explorer.arkiv.network/address/0x6da9E22E6833605f5a4b45F6F2bCb2362EDEE4Ee)
- sync: [`0x93c3deaEDDb1B2E66082a1445bC0f25fb2487f5B`](https://rabdi.explorer.arkiv.network/address/0x93c3deaEDDb1B2E66082a1445bC0f25fb2487f5B)

Example shipment entity: [`0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d`](https://rabdi.explorer.arkiv.network/entity/0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d) (`shipmentId` `shp_08a9642d8966468f922e`).

## Expiration

| Kind | TTL |
|------|-----|
| Drafts (shipments / quotes before purchase) | 30 days |
| Active policy trail (policy + tied records) | 60 days, renewed while cover is open |
| After settlement | retained ~90 days from settlement |
| Agent settings / config-like | 120 days |

## Entities

### `skjol.v1.shipment` (writer: app)

| Field | Indexed | Notes |
|-------|---------|--------|
| `shipmentId` | yes | App id |
| `ownerTag` | yes | Blind HMAC of owner wallet |
| `status` | yes | e.g. `extracted` |
| `dataLabel` | yes | `customer` \| `synthetic` |
| `createdAtSec` | yes | |
| `sealed` | no | AES-GCM JSON: owner, fileName, **document** (`mode`, `reference`, `sha256`, `size`, `tagUid`), extraction, confirmed |

### `skjol.v1.quote` (writer: app)

Indexed: `quoteId`, `shipmentTag`, `policyId`, `productId`, `deadlineSec`, `quoteExpirySec`, `chainId`.  
`sealed`: beneficiary, signed quote message, signature, terms.

### `skjol.v1.policy` (writer: sync)

Indexed: `policyId`, `status`, `ownerTag`, `shipmentTag`, `productId`, `vesselImo`, `portLocode`, `deadlineSec`, `chainId`, `pool`, `lastEvaluation`.  
Public premium/payout/tx fields; `sealed` holds shipment link, beneficiary, vessel name, voyage, wording.

### `skjol.v1.observation` (writer: observer)

Public port-call evidence: `observationId`, `policyId`, `digest`, `source`, `origin`, vessel/port times, `record` bytes.

### `skjol.v1.evaluation` (writer: observer)

Indexed status/runner/clock; `sealed` holds reasons + plain-language explanation (owner-only).

### `skjol.v1.chain-event` (writer: sync)

Mirrored Arc pool events: `eventId`, `kind`, `policyId`, block/tx/log, amounts.

### `skjol.v1.sync-cursor` (writer: sync)

Per-chain sync progress.

### `skjol.v1.agent-spend` / `skjol.v1.agent-settings` (writer: app)

Freight-agent ledger and spend limits.

## What we query

- List my shipments: `ownerTag` + schema shipment.
- Policy by id: `policyId` + `createdBy` sync writer.
- Observations/evaluations by `policyId`.
- Agent spend by `ownerTag` for daily caps.

Explorer: https://rabdi.explorer.arkiv.network  
RPC / access keys: https://hub.arkiv.network
