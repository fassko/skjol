# Why Arkiv

## If we swapped Arkiv for Postgres, what would users lose?

- **Wallet-owned, expiring records** anyone can query on a public testnet explorer without our API — policies, observations, and chain-event mirrors become ordinary private rows.
- **Shared trust for evidence** — port-call observations and evaluations are written by a dedicated observer key; other parties can verify `createdBy` instead of trusting a central DB dump.
- **Natural retention** — drafts expire; settled policies age out on-chain rather than relying on our ops to delete rows.
- **Cross-app composability** — another Mumbai or production app can filter `skjol.v1.policy` by IMO/port/status without a Skjol partnership agreement.

## What we kept off Arkiv (and why)

| Kept off / sealed | Why |
|-------------------|-----|
| BoL plaintext | Sensitive commercial document |
| Swarm reference (clear) | Avoid advertising document location on a public entity; sealed inside `ShipmentPrivate` |
| Decryption keys | Server-only (`SKJOL_MASTER_KEY`) |
| Owner wallet (clear on shipment) | Blind `ownerTag` for listings; wallet only inside sealed JSON |
| AI extraction / confirmed fields | Private to the shipper until they act on-chain |

Public on Arkiv: policy status, vessel IMO, port, deadlines, premiums/payouts, purchase/settlement txs, and public port-call observation payloads (already public maritime data).
