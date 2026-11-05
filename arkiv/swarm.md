# Arkiv + Swarm

How Skjol splits encrypted bills of lading (BoLs) across **Swarm** (ciphertext blobs) and **Arkiv** (queryable shipment entities that point at those blobs).

## What lives where

| Layer | What | Where |
|-------|------|--------|
| Document plaintext | Bill of lading / booking file | Never stored raw |
| AES-256-GCM ciphertext | `seal(plaintext, swarm-doc:{shipmentId})` | Swarm `/bytes` (or local-dev blobs) |
| Decryption key | HKDF from `SKJOL_MASTER_KEY` + context | Server env only — never on Swarm or Arkiv |
| Swarm content reference (64 hex) | Content address of **ciphertext** (no Swarm-Encrypt; the ref does **not** embed a key) | Inside Arkiv shipment `sealed` → `document.reference` |
| Bee tag UID | Upload label from `POST /tags` when the Bee/API supports it | Inside Arkiv shipment `sealed` → `document.tagUid` |
| Public Arkiv fields | `shipmentId`, `status`, `dataLabel`, `createdAtSec`, `ownerTag` | Indexed on `skjol.v1.shipment` |

We deliberately **do not** use Bee `Swarm-Encrypt`. An encrypted Swarm reference embeds its key; Arkiv entities are public. App-side encryption + a sealed reference matches the prize caution: never store a key-bearing Swarm ref on Arkiv as plaintext.

## Entity field that holds the Swarm reference

- Schema: `skjol.v1.shipment` ([`lib/store/arkiv.ts`](../lib/store/arkiv.ts))
- Public entity key: `$key` (Arkiv entity id)
- Swarm reference path (after authorised decrypt of `sealed`): `ShipmentPrivate.document.reference`
- Related: `document.mode`, `document.sha256`, `document.size`, `document.tagUid`

## Sample entity + Swarm link

Live synthetic demo upload (`shp_08a9642d8966468f922e`, Baltic Wren sample BoL), 2026-11-05:

| Field | Value |
|-------|--------|
| Arkiv entity key | `0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d` |
| Arkiv explorer | https://rabdi.explorer.arkiv.network/entity/0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d |
| Swarm reference | `07c7603b501ecbaa138a31768a2cf4e64ed2d28bcde18f49036b9b094989b0fe` |
| Ciphertext URL | https://api.gateway.ethswarm.org/bytes/07c7603b501ecbaa138a31768a2cf4e64ed2d28bcde18f49036b9b094989b0fe |

Open the ciphertext URL: you should see unreadable bytes (AES-GCM envelope). The app decrypts only for the shipment owner after session auth. The Swarm reference is **not** stored in a public Arkiv field; it lives inside the entity’s sealed payload (see schema).

Reproduce: `RUN_SWARM_PRIZE_DEMO=1 pnpm exec vitest run tests/swarm-prize-demo.test.ts`

## Postage stamp batch + Bee node / gateway

| Item | Value |
|------|--------|
| Postage stamp batch ID | **Supplied by the Swarm public gateway** (client does not hold a batch when `SWARM_MODE=gateway`). Own-Bee demos set `SWARM_POSTAGE_BATCH_ID` and send `Swarm-Postage-Batch-Id`. |
| Wallet that bought the batch (or who supplied it) | Swarm Foundation / public gateway operator at `api.gateway.ethswarm.org` (gateway stamps uploads server-side). For `SWARM_MODE=bee`, document the Gnosis wallet that bought the batch. |
| Upload through | `SWARM_MODE=gateway` · API `https://api.gateway.ethswarm.org` |

Notes:

- `SWARM_MODE=bee` **fails closed** without `SWARM_POSTAGE_BATCH_ID` and creates a Bee tag (`POST /tags` + `Swarm-Tag`).
- The public gateway does not expose `/stamps` or `/tags` to clients; postage is applied by the gateway. Bee tags are best-effort when the API supports them.

## Code paths

| Action | File |
|--------|------|
| Encrypt + upload + tag | [`lib/swarm.ts`](../lib/swarm.ts) — `storeDocument`, `uploadBytes`, `createBeeTag` |
| Download + integrity check | [`lib/swarm.ts`](../lib/swarm.ts) — `readDocument` |
| Create shipment (BoL → Swarm + Arkiv) | [`lib/insurance.ts`](../lib/insurance.ts) — `createShipment` |
| HTTP upload / read | [`app/api/shipments/route.ts`](../app/api/shipments/route.ts), [`app/api/shipments/[id]/route.ts`](../app/api/shipments/[id]/route.ts) |
| Synthetic roundtrip | [`app/api/swarm/roundtrip/route.ts`](../app/api/swarm/roundtrip/route.ts) |
| Prize demo script | [`tests/swarm-prize-demo.test.ts`](../tests/swarm-prize-demo.test.ts) |
| Judge-visible UI | [`app/components/ui.tsx`](../app/components/ui.tsx) `StorageStrip`; cover [`app/cover/flow.tsx`](../app/cover/flow.tsx); policy [`app/policies/[id]/detail.tsx`](../app/policies/[id]/detail.tsx); integrations [`app/integrations/page.tsx`](../app/integrations/page.tsx) |

## Steps to run one upload and one read

**Prerequisites**

1. `pnpm install`
2. Copy [`.env.example`](../.env.example) → `.env.local`. Set `SKJOL_MASTER_KEY`, `SESSION_SECRET`, Arkiv keys, and `SWARM_MODE=gateway` (or `bee` + `SWARM_POSTAGE_BATCH_ID`).
3. `pnpm dev` (or use the deployed URL).

**Upload (synthetic roundtrip — no customer data)**

```bash
curl -sS -X POST http://localhost:3000/api/swarm/roundtrip | jq .
```

You should see `reference` (64 hex), `ciphertextUrl`, and `plaintextMatches: true`.

**Upload (cover flow)**

1. Open `/cover`, connect a wallet, upload a sample BoL.
2. On “Check the details”, the **Storage — Arkiv + Swarm** strip shows the Arkiv entity link, Swarm reference, and ciphertext URL.
3. Open the ciphertext link (garbage). Open the Arkiv entity in the Rabdi explorer.

**Read**

- Owner: `GET /api/shipments/{id}` (session cookie) returns `storage.reference` + `storage.ciphertextUrl`; the server can decrypt via `readDocument` when re-extracting dates.
- Policy holder: policy detail → **Document storage** strip.

## Demo video

**Pending cut:** no demo video file is in the repo yet. After recording, replace this line with the timestamp (e.g. `01:12` — upload → Storage strip → open ciphertext on Swarm → open Arkiv entity).

Suggested beat to film: `/cover` sample upload → Storage strip → open ciphertext URL → open Arkiv entity `0x44a6479d…a18d`.

## What got in the way with Swarm

- Public gateway vs own Bee: `/stamps` and `/tags` are not available on `api.gateway.ethswarm.org`; the gateway stamps uploads itself. Own Bee needs funded xBZZ + a client-held batch.
- Bee `Swarm-Encrypt` would put a key in the reference — unsafe to place on public Arkiv entities — so we encrypt in-app and seal the content hash inside Arkiv `sealed`.
- Tag sync is eventually consistent; the roundtrip polls once and reports `tagSynced` as best-effort when tags exist.
- Ultra-light / download-only nodes cannot upload; prize demos use the public gateway or a postage-funded Bee.
