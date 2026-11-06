import { useReadContracts, useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { CHAIN_ID, POOL_ADDRESS, USDC_ADDRESS, poolAbi } from '@/contract'

const ONE_SHARE = 1_000_000n // shares use the same 6 decimals as USDC

export type PoolData = {
  freeCapital: bigint
  totalReserved: bigint
  totalAssets: bigint
  totalSupply: bigint
  /** USDC value of one whole share. */
  sharePrice: bigint
  shares: bigint
  redeemableUsdc: bigint
  redeemableShares: bigint
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
        poolRead('convertToAssets', [ONE_SHARE]),
        ...(user
          ? [
              poolRead('balanceOf', [user]),
              poolRead('maxWithdraw', [user]),
              poolRead('maxRedeem', [user]),
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

  const data: PoolData | undefined = r
    ? {
        freeCapital: val(0),
        totalReserved: val(1),
        totalAssets: val(2),
        totalSupply: val(3),
        sharePrice: val(4),
        shares: val(5),
        redeemableUsdc: val(6),
        redeemableShares: val(7),
        usdcBalance: val(8),
        allowance: val(9),
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
