# Skjol × Chainlink CRE

Arrival evaluator workflow that reads a policy from `ShipmentDelayPool` on Arc Testnet, fetches port-call evidence (Digitraffic / VesselFinder or labelled replay), and submits an arrival report through the CRE forwarder.

Chainlink currently enables **local simulation** for this hackathon project. DON deploy needs deploy access (usually after signing their MNDA).

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
