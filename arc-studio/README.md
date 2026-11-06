# Skjol Pool

A USDC settlement pool for arrival delay cover on Arc Testnet. Importers buy cover for one shipment (vessel, destination port, deadline). If the vessel's recorded arrival is more than 24 hours after the deadline, the pool pays a fixed USDC amount to their wallet. Funders deposit USDC and earn from premiums.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- Deposit USDC into the pool and redeem it (reserved capital stays locked until policies settle).
- See what your shares receive on exit, and claim a payout the token could not deliver the first time.
- Paste a signed quote from Skjol, check it, and buy cover.
- Browse every policy and its status, evidence and payout transaction.
- Read a short explanation of how the flow works.

The full Skjol app is at https://skjol-insurance.vercel.app.

## Tech stack

- React, Vite, TypeScript, Tailwind CSS
- wagmi, viem, ConnectKit
- Solidity 0.8.30 with Foundry (OpenZeppelin Contracts, Chainlink CRE receiver)

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev            # start the web app
bun run contracts:build
bun run contracts:test
bun run check          # lint and typecheck
```

The deployed pool address and deploy block are set in `src/contract.ts`.

### Environment variables

- `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS`: optional outside Arc Studio. Used by the deploy scripts for forked-chain checks.
- `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`: only needed to deploy the contract with the deploy scripts.
