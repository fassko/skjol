# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Skjol Pool: USDC settlement pool and web app for arrival delay cover (ERC-4626 shares, EIP-712 quotes, Chainlink CRE evidence).

## Deployments (Arc Testnet, chain 5042002)

- ShipmentDelayPool (current, v2 with fixes): `0xa7505609b6c380c3f87940db151ef4a5437f70c0`, deploy block 70874549, deploy tx `0xe55df41f51e800464ec1b2d9658e4130015679654f3f442415eaaea9ac90064a`. Ownership is two-step: `transferOwnership` to `0x006B92D63938d9B9e3485077e7A72C9a9944364E` is sent (tx `0x8fd950a21f5188e8e9d3b4f0c4a48244a095654cb79c8b8423a6c6696b77b033`); that address must call `acceptOwnership()`, then `setSimulationOperator`.
- Superseded v1 pool (do not use): `0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4`
- Deployer (Circle developer-controlled wallet, id `4963feec-015f-5129-a1dc-d11871c20281`): `0xfddf934a32a0cb33e7181454b9f2501f8baff7a1`
- Pool address and deploy block are set in `src/contract.ts`. Owner-only helper script: `scripts/pool-admin.ts`.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```
