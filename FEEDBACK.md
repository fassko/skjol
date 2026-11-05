# Uniswap developer feedback

Skjol sells parametric arrival-delay cover. Capital providers fund the pool that pays claims, and since ETHGlobal Mumbai they receive ERC-4626 vault shares for it (`skjolUSDC`, `skjolEURC`). Premiums raise the value of a share and claim payouts lower it. We listed the shares against USDC on a Uniswap V2 pair on Arc Testnet so a provider can exit without waiting for free capital to redeem against.

## What we built

| Piece | Where |
|---|---|
| Pool shares (ERC-4626, plain ERC-20 to the AMM) | [`contracts/src/ShipmentDelayPool.sol`](./contracts/src/ShipmentDelayPool.sol) L30, `fund` L200, `maxWithdraw` / `maxRedeem` L211–L224 |
| Create and seed the share/USDC pair (`createPair`, `addLiquidity`) | [`scripts/seed-share-pair.mts`](./scripts/seed-share-pair.mts) |
| Quote and swap in the app (`getAmountsOut`, `swapExactTokensForTokens`) | [`app/capital/page.tsx`](./app/capital/page.tsx) `TradePanel` L378–L500 |
| Router ABI (the two functions we call) | [`lib/abi/uniswap-v2.ts`](./lib/abi/uniswap-v2.ts) |
| Factory and router addresses | [`lib/config.ts`](./lib/config.ts) L78–L81, [`shared/capital-public.ts`](./shared/capital-public.ts) |
| NAV tests (premium raises, payout lowers) | [`contracts/test/ShipmentDelayPool.t.sol`](./contracts/test/ShipmentDelayPool.t.sol) L147, L165 |

On Arc Testnet (chain id `5042002`):

| | Address / tx |
|---|---|
| USDC pool (`skjolUSDC`) | [`0xf9a17a1b28eecaa8ef15cae0473c39a9c9e91301`](https://explorer.testnet.arc.io/address/0xf9a17a1b28eecaa8ef15cae0473c39a9c9e91301) |
| skjolUSDC / USDC pair | [`0x74BC77B067091afd1A7AcB65c4d205002444cC5B`](https://explorer.testnet.arc.io/address/0x74BC77B067091afd1A7AcB65c4d205002444cC5B) |
| Seed liquidity (5 shares + 5 USDC) | [`0xc04629be…d828d9`](https://explorer.testnet.arc.io/tx/0xc04629be43abca883fec8507b0a6fdf7c765951fe9f8f1592c2fb34f3fd828d9) |
| V2 factory / router used | `0x7483847d46db2920dd64efa676cf72dcf765814f` / `0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9` |

## What worked

- **V2 was quick to get running.** Creating the pair, seeding it, quoting and swapping took about a hundred lines of TypeScript with viem. Nothing about Uniswap slowed the first swap down.
- **ERC-4626 shares need no adapter.** The vault share is an ordinary ERC-20, so the pair accepted it as is. We didn't have to write a wrapper or ask anyone to whitelist a token.
- **Permit2 is at its usual address on Arc Testnet** (`0x000000000022D473030F116dDEE9F6B43aC78BA3`, 9,152 bytes of code), so tooling that assumes it works unchanged.

## What got in the way

1. **The deployments page doesn't list Arc Testnet.** [developers.uniswap.org/deployments](https://developers.uniswap.org/deployments) lists Arc mainnet (chain id `5042`) for v2, v3 and v4. Every Arc track at this hackathon runs on Arc Testnet (`5042002`). We checked the mainnet addresses against the testnet RPC:

   | Contract (mainnet address) | Code on Arc Testnet |
   |---|---|
   | UniswapV2Factory `0x89e5…9eba` | none |
   | UniswapV2Router02 `0x1f7d…2EfA` | none |
   | UniswapV3Factory `0xf0db…3918` | none |
   | v4 PoolManager `0x8366…0951` | 24,009 bytes |
   | Universal Router `0x4fcA…9Fb1` | 24,546 bytes |

   So v4 appears to exist on the testnet at the mainnet addresses, but nothing says so, and v2 and v3 aren't there at all. We used a V2 factory that other Arc builders had deployed (`0x7483…814f`, 618 pairs, the pairs report `Uniswap V2` / `UNI-V2`). We can't tell from the outside whether it is canonical bytecode. **Ask:** add Arc Testnet to the deployments page and `deployments.json`, including the v4 addresses if they are official, and mark unofficial deployments as such.

2. **The gas token is a stablecoin, and there is no guidance for that.** On Arc, USDC is the native gas token with 18 decimals, and the same balance is exposed as a 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000`. The router we used returns `0x6bE2C68117ca58086bD6a14E525835584d7f721E` from `WETH()`, which is a different token from the `0x3600…` USDC that the rest of Arc and Circle's tools use. We used only the token-to-token router functions to avoid sending liquidity through a second USDC wrapper. **Ask:** a short page on chains whose native asset is a stablecoin: which representation pools should use, and what the `ETH` router paths mean there.

3. **A vault share's value moves outside the pool, and constant-product pricing ignores that.** Our share's fair value is `convertToAssets(1e6)`. It rises a little with every premium and falls in one step when a claim is paid. The pair can't see either change. After a payout, the pool keeps quoting the old price until someone arbitrages it, and the liquidity providers absorb that loss. People who see delay evidence early can sell first. V2 has no way to stop this; we documented it as a limitation. **Ask:** a reference v4 hook for pairs of a vault share and its underlying asset, for example one that anchors to `convertToAssets` or raises the fee while the vault's value is about to change. Builders listing ERC-4626 shares, LST/LRT shares or RWA fund shares all hit this.

4. **Seeding a pair means doing the ratio math yourself.** The first deposit sets the price. We seed shares and USDC 1:1, which is only right while a share is worth exactly 1.00. A pool listed later would need the current value worked out by hand. A "seed at this price" helper in the SDK, or a script in the docs, would prevent wrongly priced first deposits.

## What we'd build next

The v4 PoolManager appears to be on Arc Testnet, so the next step is a v4 hook on the share/USDC pool that addresses problem 3:

- reads the pool's committed payouts and the share's value from `ShipmentDelayPool`
- raises the swap fee, or blocks sells, while a Chainlink CRE arrival evaluation is pending for a policy that would pay out
- lets the price follow `convertToAssets` without waiting for arbitrage

That would make the AMM part of the insurance logic: secondary-market liquidity for the people underwriting arrival delay, priced so their own claims can't be front-run.

## Our own limitations

- Testnet only, with test USDC and EURC. Pool size and liquidity are a few units.
- The EURC pool has no seeded pair yet. Only `skjolUSDC` trades.
- Swaps use a fixed 0.5% slippage and a 10-minute deadline from the client. There is no multi-hop routing and we don't use the Uniswap API.
