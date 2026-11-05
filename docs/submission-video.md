# Submission video — plan and script

Desktop screen recording for the ETHGlobal Mumbai submission. Judges should leave knowing Skjol pays a fixed amount when a named vessel is late, and that the bill of lading is real ciphertext on Swarm with the reference sealed inside a live Arkiv entity.

**Length:** 3:00. Speak a little slower than conversation; the clicks are the proof.
**Frame:** 1920×1080, browser only, bookmarks bar hidden, zoom 110%.
**Voice:** one take, or voiceover laid on afterwards. No music under the Swarm and Arkiv tabs.

## Before record

1. Deployment with `SWARM_MODE=gateway` (or own Bee plus a postage batch). `local-dev` fails the prize.
2. Open **How it's built** (`/integrations`). The Swarm badge must read **Swarm public gateway · postage ready**. Arc must show free collateral above the cheapest premium.
3. Start **signed out**.
4. On **Get cover**, the page may open in **Assistant**. Switch to **Step by step** before you upload. The Storage strip only appears on the step-by-step review screen.
5. Have these two links in a notes window, for the backup shot if a live upload stalls:
   - Arkiv entity: https://rabdi.explorer.arkiv.network/entity/0x44a6479dec093210437f7475cea24b6fe2a8f0f28677801066170658b344a18d
   - Ciphertext: https://api.gateway.ethswarm.org/bytes/07c7603b501ecbaa138a31768a2cf4e64ed2d28bcde18f49036b9b094989b0fe

Film a **fresh** Baltic Wren upload. That entity above is an earlier synthetic run of the same sample. Say “this upload” while the new links are on screen.

## Shot plan

| Time | Where | Do this | Hold until the judge can read |
|------|--------|---------|--------------------------------|
| 0:00–0:18 | `/` | Headline, then the “Built on” row | Late ship / Arc, CRE, Arkiv + Swarm |
| 0:18–0:32 | `/cover` | **Use demo wallet**, then **Step by step** | Demo wallet chip in the header |
| 0:32–1:02 | Upload | **Bill of lading — Baltic Wren to Helsinki**, then **Read document** | Spinner: “Encrypting, storing and reading…” |
| 1:02–1:22 | Review | Rest the cursor on **Storage — Arkiv + Swarm** | Entity link, Swarm ref, “Open ciphertext on Swarm” |
| 1:22–1:38 | New tab | Open the ciphertext link | Garbage bytes, not a document |
| 1:38–1:58 | New tab | Open the Arkiv entity link | Schema, public fields, sealed payload |
| 1:58–2:28 | Review → Buy | **Confirm details**, pick the cheaper quote, tick the wording, **Buy with demo wallet** | Done screen with the Arc transaction link |
| 2:28–2:45 | `/policies/{id}` | Scroll **Document storage**, then the Arkiv panel | Same Swarm ref after purchase |
| 2:45–3:00 | `/integrations` | Swarm section, badge in frame | Postage-ready badge, then stop |

If the purchase hangs past ten seconds, skip to a policy you already bought and say the buy line over that page. Keep the ciphertext tab and the explorer tab. Those two are the prize.

### 90-second prize cut

Use this if a track asks only for Arkiv + Swarm. Times below are the marks to cite in `arkiv/swarm.md` after the cut.

| Mark | Beat |
|------|------|
| 0:00 | Demo wallet, Step by step, Baltic Wren, Read document |
| ~0:35 | Storage strip in frame |
| ~0:50 | Ciphertext tab |
| ~1:05 | Arkiv entity tab |
| ~1:20 | Back on the strip: “reference sealed, key stays on the server” |

After you export, replace the pending line in `arkiv/swarm.md` with the real timestamp, for example `0:35 — Storage strip, 0:50 — ciphertext, 1:05 — Arkiv entity`.

## Script

Read the left column. Do the right column while you say it. Pause on each link long enough to read the first characters.

### 0:00 — Home

A late ship is a loss most cargo policies exclude. The importer still pays rent, wages, and missed sales. Skjol is arrival-delay cover for that gap: a fixed payout when the named vessel’s recorded arrival is more than twenty-four hours after the deadline in the contract. No claim form.

**On screen:** hold the headline. Do not scroll the market charts.

Premiums and payouts settle in test USDC on Arc. Chainlink CRE checks the port-call record. The shipping document never sits in a database we control.

**On screen:** the “Built on” row. Point at Arkiv + Swarm as you name it.

### 0:18 — Sign in and upload

I’ll use the demo wallet so this runs on test funds.

**On screen:** `/cover` → **Use demo wallet (test funds)**. When the header shows the demo wallet, click **Step by step**.

This is a synthetic bill of lading, Baltic Wren, bound for Helsinki. It is labelled synthetic. I am not uploading a customer document.

**On screen:** **Bill of lading — Baltic Wren to Helsinki**. Wait until the filename and the synthetic tag appear. Click **Read document**. Leave the spinner up. Do not talk over the whole wait; one sentence is enough:

The file is encrypted with AES-256-GCM on the server, the ciphertext is uploaded to Swarm, and only then do we write the shipment on Arkiv.

### 1:02 — Storage strip

This strip is the whole storage design.

**On screen:** **Storage — Arkiv + Swarm**. Read it top to bottom with the cursor.

Swarm holds ciphertext only. The content reference is not a public field. It sits inside the sealed payload on the Arkiv entity. The decryption key never leaves the server, and we do not use Swarm-Encrypt, because that would put a key inside a reference on a public entity.

### 1:22 — Ciphertext

Opening the Swarm link shows bytes, not a bill of lading.

**On screen:** click **Open ciphertext on Swarm**. Stay on the raw response for a full three seconds. Do not try to decode it.

### 1:38 — Arkiv entity

The same upload is an entity on Arkiv Rabdi. Public fields are the shipment id, status, and a blind owner tag — an HMAC, not the wallet. The document reference is in the sealed bytes.

**On screen:** click the Arkiv entity link from the strip (or the back button, then the entity link). Scroll enough to show the schema name `skjol.v1.shipment` and that the body is not the bill of lading. Name the app writer only if the explorer shows `createdBy`: `0xDc19…E75F`.

### 1:58 — Buy

Back in the app I confirm the vessel, the port, and the deadline. The ETA on the document does not move that deadline.

**On screen:** return to the review form. Click **Confirm details**. On the quote step, choose the smaller premium. Tick the acknowledgement. Click **Buy with demo wallet**.

The premium is test USDC. The payout is reserved in the pool at purchase. The transaction is on Arc.

**On screen:** the done state. Click the transaction link only if it appears within a few seconds; otherwise leave the hash visible and move on.

### 2:28 — Policy

The policy page reads Arkiv for status, and it shows the same document storage. The Swarm reference survived purchase. It was not only on the upload screen.

**On screen:** open the new policy. **Document storage**, then the Arkiv panel. One second on each.

### 2:45 — Close

Integrations is read from this deployment. Swarm is the public gateway, postage is applied by the gateway, and the round trip can prove upload plus decrypt. Cover state, evidence, and the encrypted bill of lading are Arkiv and Swarm records.

**On screen:** `/integrations`, Swarm section, badge in frame. Stop on the badge. End.

## If something breaks on camera

| What you see | What to do |
|--------------|------------|
| Swarm badge says local dev | Stop. Fix `SWARM_MODE` and record again. Do not narrate a local blob as Swarm. |
| Upload errors | Open the backup ciphertext and entity links. Say they are this morning’s synthetic Baltic Wren upload, same path. |
| Buy fails (collateral, quote) | Cut to **How it's built**, show free collateral or the error in one sentence, then end on the storage proof you already filmed. |
| Assistant is on and there is no strip | Click **Step by step** and upload again. Do not describe storage you cannot point at. |

## What to leave out

The freight agent and the EURC bridge are separate cuts. This video is the cover path plus the two links a judge can open.
