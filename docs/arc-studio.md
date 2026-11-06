# Arc Studio: the Skjol USDC pool

**Bounty:** Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio.

**Arc Studio project:** https://studio.arc.io/app/03aa1ed4-209d-44ee-b09c-2523a48babe3

Skjol's USDC pool was tested, deployed and given its own web app in Arc Studio. The live Skjol app now settles cover on that deployment. The Studio workspace is exported to [`arc-studio/`](../arc-studio/).

## The stablecoin logic

`ShipmentDelayPool` is an ERC-4626 vault over Arc USDC that sells fixed-payout arrival delay cover:

1. **Funding.** Funders deposit USDC and get `skjolUSDC` shares. Premiums raise the share value; payouts lower it.
2. **Conditional reserve.** Each purchase checks an EIP-712 quote signed by Skjol's underwriter, takes the premium, and reserves the full payout. Exits are priced on free capital (`balance − totalReserved − owed`), so a funder cannot withdraw money owed to an open policy or leave ahead of a payout.
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

The live pool is the second Studio deployment. It carries the fixes from Studio's review (below).

| | Address / transaction |
|---|---|
| Pool (`skjolUSDC`) | [`0xa7505609b6c380c3f87940db151ef4a5437f70c0`](https://explorer.testnet.arc.io/address/0xa7505609b6c380c3f87940db151ef4a5437f70c0), block 70874549 |
| Deployed by Arc Studio wallet | [`0xfddf934a32a0cb33e7181454b9f2501f8baff7a1`](https://explorer.testnet.arc.io/address/0xfddf934a32a0cb33e7181454b9f2501f8baff7a1) |
| Deploy (Studio) | [`0xe55df41f…90064a`](https://explorer.testnet.arc.io/tx/0xe55df41f51e800464ec1b2d9658e4130015679654f3f442415eaaea9ac90064a) |
| `transferOwnership` to `0x006B…364E` (Studio) | [`0x8fd950a2…77b033`](https://explorer.testnet.arc.io/tx/0x8fd950a21f5188e8e9d3b4f0c4a48244a095654cb79c8b8423a6c6696b77b033) |
| `acceptOwnership` (Skjol deployer) | [`0xd4b0f6fd…be83d`](https://explorer.testnet.arc.io/tx/0xd4b0f6fde1b25d2d566da6cc76fac52510a580c2cc0d850adca2cdc8514be83d) |
| `setSimulationOperator` | [`0x3aa7ddb5…c4641`](https://explorer.testnet.arc.io/tx/0x3aa7ddb5c0612b718a682ad81492ee527ef428189fff79ab513f87f9375c4641) |
| Funded with 20 USDC | [`0x3272025f…4ae10`](https://explorer.testnet.arc.io/tx/0x3272025f956043d6fdd6eacb4274c0c3984f7921a3d0f04d174c765b3b54ae10) |
| `skjolUSDC`/USDC Uniswap V2 pair | [`0xE89f57309472a3F26378EC887B738ED294b5d124`](https://explorer.testnet.arc.io/address/0xE89f57309472a3F26378EC887B738ED294b5d124) |
| First Studio pool (before the fixes) | [`0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4`](https://explorer.testnet.arc.io/address/0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4), pair [`0x4aEe8ECa01144ea44657795f1A0cd8CD81A478D2`](https://explorer.testnet.arc.io/address/0x4aEe8ECa01144ea44657795f1A0cd8CD81A478D2). Record: [`deployments/arc-testnet-studio-v1.json`](../deployments/arc-testnet-studio-v1.json) |

Constructor: CRE simulation forwarder `0x6E9E…eDc1`, Arc USDC `0x3600…0000`, quote signer `0x8198…5803` (Skjol's backend), max payout 20 USDC, max evidence age 6 h, minimum lead time 60 s, review delay 30 days. Full record: [`deployments/arc-testnet.json`](../deployments/arc-testnet.json).

## How it connects to the rest of Skjol

- **Live app.** [skjol-insurance.vercel.app](https://skjol-insurance.vercel.app) reads and writes this pool through `ARC_POOL_ADDRESS`. Quotes signed by its backend verify on the Studio deployment; `scripts/check-quote-hash.mts` matches the onchain `hashQuote`.
- **Chainlink CRE.** [`cre/arrival-evaluator`](../cre/arrival-evaluator) lists this pool first in `poolAddresses`. The earlier pool stays on the list, so policies already sold on it can still settle.
- **Studio app.** The app in [`arc-studio/`](../arc-studio/) is a second frontend on the same contract, for funders and for buying with a quote exported from Skjol.

Architecture diagram: [`docs/architecture.svg`](./architecture.svg), and **How it works** in the Studio app.

## Arc Studio's review, and what we changed

The first review raised five items. The contract source in [`arc-studio/contracts/`](../arc-studio/contracts/) and [`contracts/src/`](../contracts/src/) now fixes four of them. Each fix has a test, and the Studio suite has 41 passing tests. Studio re-reviewed the fixes, ran the tests and redeployed the pool from its Circle wallet; the live pool `0xa750…70c0` runs this version.

| Review finding | Fix | Test |
|---|---|---|
| Share value counts reserved capital, so a funder can redeem ahead of a payout and leave it to the funders who stay | Exits are priced on `availableCapital()` (assets − reserved − owed): `previewRedeem`, `previewWithdraw`, `maxWithdraw`, new `exitValue`. Deposits are still priced on gross assets, so nobody can buy in just before reserves are released. Every share can exit at any time at the worst-case price. A funder who wants full value while policies are open can sell on the Uniswap pair. | `test_FunderCannotExitAheadOfPayout`, `test_ExitWhileOpenLeavesReserveToStayers`, `test_DepositJustBeforeReleaseIsNotProfitable`, `test_RedeemPricedAsIfOpenPoliciesPay` |
| *Re-review of that fix:* the last funder could redeem every share while a payout was reserved, leaving the reserve with no shareholder; near-zero supply also opened the vault inflation attack | While a payout is reserved, `MIN_LIVE_SHARES` (1e6) must stay outstanding. A deposit that would mint 0 shares reverts (`ZeroShares`), and the first deposit must be at least 1 USDC (`FirstDepositTooSmall`). | `test_LastFunderCannotLeaveReserveWithoutShareholders`, `test_FirstDepositMinimumAndZeroShareDepositsRevert` |
| A USDC-blocklisted beneficiary makes the payout revert, so the policy stays open | The payout uses `trySafeTransfer`. If the transfer fails, the amount moves to `owedPayout[beneficiary]`, the policy settles and the reserve is released. The beneficiary claims it with `claimPayout()`. The claim pays only the beneficiary, so the token's blocklist is respected: a blocked address can claim once the issuer unblocks it. Owed money is excluded from pool assets. | `test_BlocklistedBeneficiaryPayoutIsOwedAndClaimable` |
| The workflow id and author aren't checked, and the simulation gate uses `tx.origin` | Reports now fail closed: `onReport` reverts with `ReportIdentityNotConfigured` unless the simulation operator or an expected workflow id or author is set. A forwarder alone is no longer enough. The `tx.origin` gate stays only while `simulationOperator` is set, for the CRE simulation forwarder. | `test_RejectsReportsWithoutWorkflowIdentity`, `test_SimulationOperatorGate` |
| Ownership transfer is single-step | `ReceiverTemplate` uses `Ownable2Step`. The new owner has to call `acceptOwnership`. | `test_OwnershipTransferIsTwoStep` |
| The 24-hour threshold is part of the signed quote | Not changed. The threshold belongs to each product and is fixed in the signed quote on purpose. The quote signer is the control. | — |

**Studio's second re-review** left one Medium open. An attacker who donates to the pool before the first deposit could keep the share supply low enough that funders can't exit while policies are open. No funds can be stolen, and it only works on an empty pool. `scripts/adopt-studio-pool.mts` refuses to fund a pool that has assets but no shares, and it funded this pool in a single 20 USDC deposit, so the attack window is closed for this deployment.

## How the fixed pool was redeployed from Arc Studio

This is how the live pool was deployed, kept so the redeploy can be repeated. The deployment has to come from Studio so the live pool stays Studio-built. Three steps. The Studio turns were run with the `arc-studio` CLI (`arc-studio run --session skjol-pool --prompt-file … --file …`), which sends these files into the workspace directly.

### 1. Paste this into the Studio project chat

> Update the pool contract to the reviewed and fixed version from our GitHub repo. Then test it, deploy it and hand it over.
>
> 1. Replace these three files with the versions at commit `d496dfa965a9abdac47a4e8085d385ef1ab71e0d`:
>    - `contracts/ShipmentDelayPool.sol` ← https://raw.githubusercontent.com/fassko/skjol/d496dfa965a9abdac47a4e8085d385ef1ab71e0d/arc-studio/contracts/ShipmentDelayPool.sol
>    - `contracts/cre/ReceiverTemplate.sol` ← https://raw.githubusercontent.com/fassko/skjol/d496dfa965a9abdac47a4e8085d385ef1ab71e0d/arc-studio/contracts/cre/ReceiverTemplate.sol
>    - `contracts/test/ShipmentDelayPool.t.sol` ← https://raw.githubusercontent.com/fassko/skjol/d496dfa965a9abdac47a4e8085d385ef1ab71e0d/arc-studio/contracts/test/ShipmentDelayPool.t.sol
> 2. Compile and run the Foundry tests. All 41 must pass. Show me the summary.
> 3. Review the changes against your earlier security review: exit pricing on `availableCapital()`, `trySafeTransfer` with `owedPayout` / `claimPayout`, reports rejected unless a workflow identity or the simulation operator is set (`ReportIdentityNotConfigured`), and `Ownable2Step`.
> 4. Deploy `ShipmentDelayPool` to Arc Testnet from the Circle wallet with exactly these constructor arguments:
>    - `forwarder`: `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` (CRE simulation forwarder)
>    - `token_`: `0x3600000000000000000000000000000000000000` (Arc USDC)
>    - `quoteSigner_`: `0x81986f54507a51BD6633020C58A2C115350b5803`
>    - `maxPayout_`: `20000000`
>    - `maxEvidenceAge_`: `21600`
>    - `minLeadTime_`: `60`
>    - `reviewDelay_`: `2592000`
>    - `shareName`: `Skjol USDC Pool`
>    - `shareSymbol`: `skjolUSDC`
> 5. Call `transferOwnership(0x006B92D63938d9B9e3485077e7A72C9a9944364E)`. Ownership is two-step now, so that address accepts it afterwards. Don't call `setSimulationOperator`; the new owner sets it.
> 6. Point the Studio app at the new pool (`POOL_ADDRESS` and the deploy block in `src/contract.ts`). Show the exit value with `previewRedeem`/`maxWithdraw` instead of `convertToAssets`, and add a **Claim payout** button for `owedPayout(account) > 0` that calls `claimPayout()`. Add `previewRedeem`, `exitValue`, `owedPayout`, `claimPayout`, `totalOwed` and `acceptOwnership` to the app's ABI.
> 7. Report the pool address, the deploy transaction hash, the deploy block and the `transferOwnership` transaction hash.

### 2. Take over the pool and switch Skjol to it

With the address and deploy transaction from Studio's report:

```bash
POOL=0x… DEPLOY_TX=0x… POOL_FUNDING=20000000 node --env-file=.env.local --import tsx scripts/adopt-studio-pool.mts
POOL_TOKEN=USDC SEED_AMOUNT=2000000 node --env-file=.env.local --import tsx scripts/seed-share-pair.mts
```

The first script checks that the pool is the fixed build, accepts ownership, sets the simulation operator, funds 20 USDC, rewrites `deployments/arc-testnet.json` (the old record is kept as `arc-testnet-studio-v1.json`) and puts the pool first in the CRE configs. The second creates and seeds the new share/USDC pair.

### 3. Point the app at it

Set `ARC_POOL_ADDRESS`, `NEXT_PUBLIC_POOL_ADDRESS`, `ARC_POOL_DEPLOY_BLOCK`, `USDC_SHARE_PAIR` and `NEXT_PUBLIC_USDC_SHARE_PAIR` in `.env.local` and in Vercel (Production and Preview). **Then redeploy production**, because env changes don't reach a running deployment. Finally, update the addresses in this file, `README.md` and `FEEDBACK.md`.

## Run the Studio app locally

```bash
cd arc-studio
bun install
bun run dev
bun run contracts:test
```
