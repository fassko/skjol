# Skjol × Chainlink CRE

Arrival evaluator workflow that reads a policy from `ShipmentDelayPool` on Arc Testnet, fetches port-call evidence (Digitraffic / VesselFinder or labelled replay), and submits an arrival report through the CRE forwarder.

Chainlink currently enables **local simulation** for this hackathon project. DON deploy needs deploy access (usually after signing their MNDA).

## Verified run: late arrival, payout on Arc Testnet

On 5 November 2026 this workflow settled a policy on the Arc Studio pool ([`0x2beb…8fa4`](https://explorer.testnet.arc.io/address/0x2bebcde5d15ddeba0f407018cd1f2d51ec578fa4)) through the CRE CLI with `--broadcast`.

1. The demo wallet bought **Demo Cover, 2-minute threshold** (0.10 USDC premium, 1.00 USDC payout) on the live pool: [purchase tx `0xc03b…2875`](https://explorer.testnet.arc.io/tx/0xc03b36a3fc47c99ea77462ad1b4ebaee6fe09d3aa7990b49c99e0dee87a52875).
2. A **synthetic** arrival 3 minutes after the deadline was recorded through `POST /api/demo/arrival`. It's labelled `replay:synthetic-demo` and stored on Arkiv ([entity](https://rabdi.explorer.arkiv.network/entity/0xe6a2961314e044b1bce9db89a9fc96b6340b3ec733e8c970d73e3c63816ff699)). Synthetic arrivals are only accepted for the demo product.
3. The workflow read the policy from the pool (EVM read), fetched the port-call record over HTTP, and decided:

```text
$ cre workflow simulate arrival-evaluator --target replay-settings --broadcast --non-interactive \
    --trigger-index 0 --http-payload '{"policyId":"0x760bf9485a662ea4b2bf160ca76796765c445b96568e04b97b69d76ce174c7ff"}'
✓ Workflow compiled
[USER LOG] Policy 0x760b…c7ff: ARRIVAL_CONFIRMED (ARRIVED_LATE_BEYOND_THRESHOLD) from 1 synthetic record(s)
[USER LOG] Report written for 0x760b…c7ff: tx 0xc6c0d16e…7450cc (payout preview: true)
✓ Workflow Simulation Result:
{
  "origin": "synthetic",
  "payoutEligiblePreview": "yes",
  "reasons": ["ARRIVED_LATE_BEYOND_THRESHOLD"],
  "reportSubmitted": true,
  "status": "ARRIVAL_CONFIRMED",
  "txHash": "0xc6c0d16e259db9553826f5a7095683b0f858a550d71c48bbf074ef9be07450cc"
}
```

4. The report went through the MockKeystoneForwarder to `onReport`. The pool recomputed the outcome from the locked terms and paid out: [report tx `0xc6c0…50cc`](https://explorer.testnet.arc.io/tx/0xc6c0d16e259db9553826f5a7095683b0f858a550d71c48bbf074ef9be07450cc) emits `EvidenceAccepted`, `ReserveReleased` and `PolicyPaidOut`, and transfers 1.00 USDC to the importer.

Reproduce: run the app with `REPLAY_ENABLED=true` and `DEMO_PRODUCTS_ENABLED=true`, buy the demo product with a deadline a few minutes out, call `POST /api/demo/arrival` with `minutesAfterDeadline` greater than 2 once that time has passed, then run the command above.

## Prerequisites

- CRE CLI (`cre version` → v1.x) and `cre login`
- `cre/.env` with `CRE_ETH_PRIVATE_KEY` = pool `simulationOperator` (64 hex, **no** `0x`). Copy from `cre/.env.example`.
- Optional: `VESSELFINDER_API_KEY_VAR` for live Indian ports (staging/production secrets)

## Targets (`workflow.yaml`)

| Target | Config | Use |
|--------|--------|-----|
| `replay-settings` | `config.replay.json` | App replay API on `localhost:3000` (synthetic/recorded) |
| `staging-settings` | `config.live.json` | Live Digitraffic / VesselFinder + MockKeystone |
| `production-settings` | `config.live.json` | Same live sources; for a future deployed workflow |

## Simulate (dry run — default)

From `cre/` (project root for this CRE project):

```bash
# HTTP trigger (handler 0). Uses a real Arc RPC read; does NOT broadcast a report.
cre workflow simulate arrival-evaluator \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{"policyId":"0x0000000000000000000000000000000000000000000000000000000000000001"}'
```

Replace `policyId` with a real active policy bytes32 when you have one. A missing/inactive policy should return a non-submitting status (nothing written).

Replay (app must be running on port 3000, `REPLAY_ENABLED=true`):

```bash
cre workflow simulate arrival-evaluator \
  --target replay-settings \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{"policyId":"<BYTES32>","clock":"2026-11-05T12:00:00.000Z"}'
```

Cron (handler 1) only evaluates `watchPolicyIds` in the config (currently empty).

## Simulate with broadcast (real MockKeystone write)

Pools on Arc Testnet still use `MockKeystoneForwarder` (`0x6E9E…5Dc1`). `--broadcast` sends a real report when evidence confirms arrival. The signing key in `cre/.env` must equal `simulationOperator`.

```bash
cre workflow simulate arrival-evaluator \
  --target staging-settings \
  --broadcast \
  --non-interactive \
  --trigger-index 0 \
  --http-payload '{"policyId":"<BYTES32>"}'
```

## Deploy (blocked until Chainlink enables access)

1. Sign the MNDA Chainlink sent and wait for deploy access (`cre whoami` → Deploy Access: enabled).
2. `cre secrets create secrets.yaml --target production-settings` (VesselFinder).
3. `cre workflow deploy arrival-evaluator --target production-settings`
4. As pool owner, point both pools at production `KeystoneForwarder` `0x76c9…1562`, set expected author / workflow name, clear `simulationOperator`.
5. Set `EVALUATION_RUNNER=cre-deployed` in the app.

Until then, keep pools on MockKeystone and use simulate / simulate `--broadcast`.

## Layout

```
cre/
  project.yaml           # RPCs per target
  secrets.yaml           # VESSELFINDER_API_KEY → env var
  .env.example
  arrival-evaluator/
    main.ts
    workflow.yaml
    config.live.json
    config.replay.json
```
