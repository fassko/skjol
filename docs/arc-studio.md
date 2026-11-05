# Arc Studio: the Skjol USDC pool

**Bounty:** Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio.

**Arc Studio project:** https://studio.arc.io/app/03aa1ed4-209d-44ee-b09c-2523a48babe3

Skjol's USDC pool was tested, deployed and given its own web app in Arc Studio. The live Skjol app now settles cover on that deployment. The Studio workspace is exported to [`arc-studio/`](../arc-studio/).

## The stablecoin logic

`ShipmentDelayPool` is an ERC-4626 vault over Arc USDC that sells fixed-payout arrival delay cover:

1. **Funding.** Funders deposit USDC and get `skjolUSDC` shares. Premiums raise the share value; payouts lower it.
2. **Conditional reserve.** Each purchase checks an EIP-712 quote signed by Skjol's underwriter, takes the premium, and reserves the full payout. Redeems are capped by free capital (`balance − totalReserved`), so a funder cannot withdraw money owed to an open policy.
3. **Automated settlement.** A Chainlink CRE workflow reads the port-call record and calls `onReport` with evidence only: arrival time, observed time, evidence digest, source id, bound to this chain and pool. The contract recomputes the outcome from the locked terms. If the vessel arrived more than 24 hours after the deadline, it pays the fixed USDC payout to the importer. Otherwise it releases the reserve back to funders.
4. **Fallback.** When no evidence can ever arrive, the owner can resolve a policy, but only 30 days after the deadline plus threshold.

## What Arc Studio did

| Step | Result |
|---|---|
| Compiled the contract | Solidity 0.8.30, `via_ir`, OpenZeppelin 5.6.1; contract source unchanged |
| Tests | 33 Foundry tests pass: our 21 ported, plus 12 new boundary tests (exactly 24 h late, one second either side, duplicate report, wrong chain id, wrong pool, review window edges, redeem blocked by reserves). See [`arc-studio/contracts/test/ShipmentDelayPool.t.sol`](../arc-studio/contracts/test/ShipmentDelayPool.t.sol) |
| Security review | Static analysis plus a manual review. No high-severity static findings. Findings are listed below |
| Deploy | From a Circle developer-controlled wallet on Arc Testnet |
| Hand-over | Set the CRE simulation operator, then transferred ownership to the Skjol deployer |
| Web app | Pool, Buy cover (paste a Skjol-signed quote), Policies, How it works. See [`arc-studio/src/`](../arc-studio/src/) |

## Deployment (Arc Testnet, chain id 5042002)

| | Address / transaction |
|---|---|
| Pool (`skjolUSDC`) | [`0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4`](https://explorer.testnet.arc.io/address/0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4), block 70866278 |
| Deployed by Arc Studio wallet | [`0xfddf934a32a0cb33e7181454b9f2501f8baff7a1`](https://explorer.testnet.arc.io/address/0xfddf934a32a0cb33e7181454b9f2501f8baff7a1) |
| Deploy | [`0xc1fed758…ec6566a`](https://explorer.testnet.arc.io/tx/0xc1fed758bad34c7fcb9832a71ba7bc6d5b833680de5abbc325209c729ec6566a) |
| `setSimulationOperator` | [`0x93cc9f5c…bf4117a`](https://explorer.testnet.arc.io/tx/0x93cc9f5c393684b3b025039fc15d472d0a328e5df864e30422a27a165bf4117a) |
| `transferOwnership` to `0x006B…364E` | [`0xbb732e81…053d6cb49`](https://explorer.testnet.arc.io/tx/0xbb732e819fea665287475b453c1b569e90ee64a01823a92c7eae345053d6cb49) |
| Funded with 6 USDC | [`0xf8981dd7…f8c78cf`](https://explorer.testnet.arc.io/tx/0xf8981dd7447135f82dfaca81841e4cc05d79a3b403365a51d563c4fe5f8c78cf) |
| `skjolUSDC`/USDC Uniswap V2 pair | [`0x4aEe8ECa01144ea44657795f1A0cd8CD81A478D2`](https://explorer.testnet.arc.io/address/0x4aEe8ECa01144ea44657795f1A0cd8CD81A478D2) |

Constructor: CRE simulation forwarder `0x6E9E…eDc1`, Arc USDC `0x3600…0000`, quote signer `0x8198…5803` (Skjol's backend), max payout 20 USDC, max evidence age 6 h, minimum lead time 60 s, review delay 30 days. Full record: [`deployments/arc-testnet.json`](../deployments/arc-testnet.json).

## How it connects to the rest of Skjol

- **Live app.** [skjol-insurance.vercel.app](https://skjol-insurance.vercel.app) reads and writes this pool through `ARC_POOL_ADDRESS`. Quotes signed by its backend verify on the Studio deployment; `scripts/check-quote-hash.mts` matches the onchain `hashQuote`.
- **Chainlink CRE.** [`cre/arrival-evaluator`](../cre/arrival-evaluator) lists this pool first in `poolAddresses`. The earlier pool stays on the list, so policies already sold on it can still settle.
- **Studio app.** The app in [`arc-studio/`](../arc-studio/) is a second frontend on the same contract, for funders and for buying with a quote exported from Skjol.

Architecture diagram: [`docs/architecture.svg`](./architecture.svg), and **How it works** in the Studio app.

## Open items from Arc Studio's review

- The pool does not yet check the CRE workflow id or author, and the simulation gate uses `tx.origin`. Before a production forwarder: call `setExpectedWorkflowId` or `setExpectedAuthor`, and clear `simulationOperator`.
- The 24-hour threshold is part of the signed quote, so the quote signer must keep signing 24 h.
- If a beneficiary is USDC-blocklisted, the payout transfer reverts and the policy stays active until a no-pay review.
- Share value counts reserved capital as pool assets. A funder can redeem free capital ahead of a payout, leaving later funders to absorb it.
- Ownership transfer is single-step.

## Run the Studio app locally

```bash
cd arc-studio
bun install
bun run dev
bun run contracts:test
```
