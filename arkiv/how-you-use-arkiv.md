# How we use Arkiv

## Filters, ownership, expiry → what users see

| Arkiv feature | How we use it | User-visible effect |
|---------------|---------------|---------------------|
| Indexed `ownerTag` | Blind HMAC of wallet | “My shipments” / “My policies” without publishing the address on the entity |
| Indexed `policyId` / `vesselImo` / `portLocode` / `status` | Policy list + detail + evaluator | Status pills, port, deadline, payout eligibility UI |
| Indexed `dataLabel` | `customer` vs `synthetic` | Provenance badges on shipments |
| `sealed` bytes | Private JSON (incl. Swarm `document.reference`) | Owner can decrypt BoL metadata; judges see Storage strip after auth |
| `createdBy` writer split | app / observer / sync keys | Users can trust which role wrote evidence vs cover vs sync |
| `$expiresAt` | Draft 30d; active 60d; settled retention | Cover records do not live forever; explorer shows expiry |
| Entity `$key` → explorer URL | Policy Arkiv panel + Storage strip | One click from the app to Rabdi entity pages |

## Does each feature change something users see?

Yes:

- Without Arkiv reads, `/policies` and policy detail would be empty.
- Without sealed shipment entities, cover upload would not persist extraction/Swarm linkage across sessions.
- Without observation/evaluation entities, “Check arrival now” and claim explanations would have nowhere durable to land.
- Without chain-event mirrors, the Arkiv panel could not show Arc settlement alongside app state.

Arkiv is not a write-only log: every primary customer surface (cover continuation, policy status, evidence timeline, integrations status) **reads** Arkiv entities.
