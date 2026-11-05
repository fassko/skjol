# Arkiv feedback (friction)

What should Arkiv improve today — things that got in our way, or missing pieces that would make building easier.

## What got in the way

1. **Access keys vs wallets** — App writes need both an access key and funded writer keys. The split is clear once documented, but first-time setup still means three private keys (`app` / `observer` / `sync`) plus the access key. A single “dev bundle” (faucet + one scoped writer) would shorten the path to first entity.

2. **Expiry can only move later** — Retention design must front-load windows (`ACTIVE_DAYS` vs `SETTLED_RETENTION_DAYS`). We wanted shorter draft TTL and longer settled retention; we had to size the active window so settled records would not outlive renewal. Documenting “expiry is monotonic” next to `ExpirationTime` APIs would help.

3. **Blind indexes vs SQL mental model** — We store `ownerTag` (HMAC) instead of addresses so listings stay private. That is the right privacy pattern, but newcomers looking for `WHERE owner = 0x…` will not find it. A short “private ownership index” recipe in the SDK docs would reduce wrong designs (putting wallets in clear indexed fields).

4. **Entity explorer ↔ SDK `$key`** — Linking from the app to `https://rabdi.explorer.arkiv.network/entity/{key}` works well for demos. Making `$key` copy-pasteable from every SDK error / empty-result message would speed debugging when a write succeeded but a filter did not.

## When something broke

- **Expectation:** Query returns the shipment we just wrote.  
- **What happened:** Empty result because `createdBy` did not match the writer that actually wrote (wrong role key).  
- **Reproduce:** Write with `ARKIV_APP_PRIVATE_KEY`, query with `.createdBy(observerAddress)`.  
- **Ask:** Stronger defaults or lint — warn if `.from(Shipments)` is used without `.createdBy(...)`.

## Missing today that would help

- Typed “sealed blob” helpers (encrypt-then-store patterns) as a first-class example next to public fields — our Swarm reference lives only inside sealed JSON; that pattern should be a cookbook page for Arkiv + Swarm.
- Clearer postage/Swarm pairing examples on the Arkiv side (who points at whom) for the bonus track.
