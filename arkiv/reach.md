# Reach

## Who is it for?

- **Small importers** buying parametric arrival-delay cover (fixed payout if the named vessel is late to the named port).
- **Hackathon / demo judges** verifying that cover state, evidence, and encrypted BoLs are real Arkiv + Swarm artifacts — not a mock DB.
- **Other apps** that could query public policy fields (status, IMO, port, deadline) on Rabdi without asking Skjol for API access, while private BoL ciphertext stays on Swarm.

## Can they try it today?

Yes, on the deployed Skjol app:

1. `/cover` — connect wallet, upload a sample BoL, see Arkiv entity + Swarm ciphertext links.
2. `/integrations` — run the Swarm roundtrip and inspect Arkiv writer status.
3. `/policies/{id}` — read Arkiv records and document storage for a purchased cover.
4. `/demo` — labelled scenarios without writing customer data.

## After Mumbai

We intend to keep building Skjol as arrival-delay cover: Arkiv remains the system of record for policies and evidence; Swarm remains the store for encrypted shipping documents. The Rabdi entities and Swarm references from the hackathon stay useful as a public test trail.
