import { useReadContracts, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CHAIN_ID, POOL_ADDRESS, USDC_ADDRESS, poolAbi } from '@/contract'

const ONE_SHARE = 1_000_000n // shares use the same 6 decimals as USDC

export type PoolData = {
  freeCapital: bigint
  totalReserved: bigint
  totalAssets: bigint
  totalSupply: bigint
  totalOwed: bigint
  /** Shares that must stay in the pool while any policy is open. */
  minLiveShares: bigint
  /** USDC a whole share receives on exit (priced as if every open policy pays out). */
  exitPrice: bigint
  shares: bigint
  /** USDC the funder can withdraw right now (maxWithdraw). */
  redeemableUsdc: bigint
  redeemableShares: bigint
  /** USDC the funder's whole position receives on exit (previewRedeem). */
  exitValue: bigint
  /** Payout the token refused to send, waiting for this wallet to claim. */
  owedPayout: bigint
  usdcBalance: bigint
  allowance: bigint
}

export function usePoolData() {
  const { address } = useAccount()
  const pool = POOL_ADDRESS
  const user = address

  const common = { chainId: CHAIN_ID } as const
  const poolRead = (functionName: string, args?: readonly unknown[]) =>
    ({ ...common, address: pool as Address, abi: poolAbi, functionName, args }) as never

  const contracts = pool
    ? [
        poolRead('availableCapital'),
        poolRead('totalReserved'),
        poolRead('totalAssets'),
        poolRead('totalSupply'),
        poolRead('previewRedeem', [ONE_SHARE]),
        poolRead('totalOwed'),
        poolRead('MIN_LIVE_SHARES'),
        ...(user
          ? [
              poolRead('balanceOf', [user]),
              poolRead('maxWithdraw', [user]),
              poolRead('maxRedeem', [user]),
              poolRead('owedPayout', [user]),
              { ...common, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [user] } as never,
              { ...common, address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [user, pool] } as never,
            ]
          : []),
      ]
    : []

  const query = useReadContracts({
    contracts,
    query: { enabled: Boolean(pool), refetchInterval: 8000 },
  })

  const r = query.data
  const val = (i: number): bigint => {
    const item = r?.[i]
    return item && item.status === 'success' ? (item.result) : 0n
  }
  const shares = val(7)

  const exit = useReadContract({
    chainId: CHAIN_ID,
    address: pool,
    abi: poolAbi,
    functionName: 'previewRedeem',
    args: [shares],
    query: { enabled: Boolean(pool) && shares > 0n, refetchInterval: 8000 },
  })

  const data: PoolData | undefined = r
    ? {
        freeCapital: val(0),
        totalReserved: val(1),
        totalAssets: val(2),
        totalSupply: val(3),
        exitPrice: val(4),
        totalOwed: val(5),
        minLiveShares: val(6),
        shares,
        redeemableUsdc: val(8),
        redeemableShares: val(9),
        owedPayout: val(10),
        usdcBalance: val(11),
        allowance: val(12),
        exitValue: shares > 0n ? (exit.data ?? 0n) : 0n,
      }
    : undefined

  return { data, isLoading: query.isLoading, refetch: query.refetch }
}

export function useQuoteSigner() {
  return useReadContract({
    chainId: CHAIN_ID,
    address: POOL_ADDRESS,
    abi: poolAbi,
    functionName: 'quoteSigner',
    query: { enabled: Boolean(POOL_ADDRESS) },
  })
}
