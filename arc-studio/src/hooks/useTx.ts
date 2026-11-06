import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import type { Abi, Address, ContractFunctionArgs, ContractFunctionName } from 'viem'
import { CHAIN_ID } from '@/contract'
import { parseTxError } from '@/lib/format'

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

export type TxState = {
  phase: TxPhase
  hash?: `0x${string}`
  error?: string
}

type Call<TAbi extends Abi, TName extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>> = {
  address: Address
  abi: TAbi
  functionName: TName
  args: ContractFunctionArgs<TAbi, 'nonpayable' | 'payable', TName>
}

/** One write at a time: switch chain, sign, wait for the real receipt. */
export function useTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const run = useCallback(
    async <TAbi extends Abi, TName extends ContractFunctionName<TAbi, 'nonpayable' | 'payable'>>(
      call: Call<TAbi, TName>,
    ): Promise<boolean> => {
      setState({ phase: 'wallet' })
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        const hash = await writeContractAsync({
          ...call,
          chainId: CHAIN_ID,
        } as never)
        setState({ phase: 'confirming', hash })
        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        if (receipt && receipt.status !== 'success') {
          setState({ phase: 'error', hash, error: 'The transaction was mined but failed. Check the details and retry.' })
          return false
        }
        setState({ phase: 'success', hash })
        return true
      } catch (e) {
        const parsed = parseTxError(e)
        setState(parsed.cancelled ? { phase: 'idle' } : { phase: 'error', error: parsed.message })
        return false
      }
    },
    [chainId, publicClient, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, run, reset }
}
