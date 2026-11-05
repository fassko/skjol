import { useState } from 'react'
import { useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { TokenUSDC } from '@web3icons/react'
import { ConnectKitButton } from 'connectkit'
import { POOL_ADDRESS, USDC_ADDRESS, poolAbi } from '@/contract'
import { usePoolData } from '@/hooks/usePoolData'
import { useTx } from '@/hooks/useTx'
import { parseUsdc } from '@/onchain-money'
import { usd, usdNumber } from '@/lib/format'
import { Card, Notice, Stat, TxStatus } from './ui'

function parseAmountSafe(v: string): bigint | undefined {
  if (!v.trim()) return undefined
  try {
    const n = parseUsdc(v)
    return n > 0n ? n : undefined
  } catch {
    return undefined
  }
}

export function PoolPanel() {
  const { isConnected, address } = useAccount()
  const { data, refetch } = usePoolData()
  const approveTx = useTx()
  const depositTx = useTx()
  const redeemTx = useTx()
  const claimTx = useTx()
  const [depositText, setDepositText] = useState('')
  const [redeemText, setRedeemText] = useState('')

  const pool = POOL_ADDRESS
  const depositAmount = parseAmountSafe(depositText)
  const redeemAmount = parseAmountSafe(redeemText)

  const needsApproval = data && depositAmount !== undefined ? data.allowance < depositAmount : false
  const depositTooMuch = data && depositAmount !== undefined ? depositAmount > data.usdcBalance : false
  const redeemTooMuch = data && redeemAmount !== undefined ? redeemAmount > data.redeemableUsdc : false

  async function approve() {
    if (!pool || depositAmount === undefined) return
    const ok = await approveTx.run({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [pool, depositAmount] })
    if (ok) void refetch()
  }

  async function deposit() {
    if (!pool || depositAmount === undefined || !address) return
    const ok = await depositTx.run({ address: pool, abi: poolAbi, functionName: 'deposit', args: [depositAmount, address] })
    if (ok) {
      setDepositText('')
      void refetch()
    }
  }

  async function claim() {
    if (!pool) return
    const ok = await claimTx.run({ address: pool, abi: poolAbi, functionName: 'claimPayout', args: [] })
    if (ok) void refetch()
  }

  async function redeem() {
    if (!pool || redeemAmount === undefined || !data || !address) return
    // Convert the USDC the funder asked for into shares; redeeming the full redeemable amount uses all redeemable shares.
    const shares =
      redeemAmount >= data.redeemableUsdc
        ? data.redeemableShares
        : (redeemAmount * data.redeemableShares) / (data.redeemableUsdc === 0n ? 1n : data.redeemableUsdc)
    if (shares === 0n) return
    const ok = await redeemTx.run({ address: pool, abi: poolAbi, functionName: 'redeem', args: [shares, address, address] })
    if (ok) {
      setRedeemText('')
      void refetch()
    }
  }

  const sharePriceText = data && data.totalSupply > 0n ? usdNumber(data.exitPrice, 4) : '1.0000'

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <TokenUSDC variant="branded" size={22} />
          <h2 className="display text-2xl font-semibold">Pool</h2>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)] text-pretty">
          Funders deposit USDC and receive pool shares. Premiums raise the share price and payouts lower it.
        </p>
        {!pool ? (
          <div className="mt-4">
            <Notice tone="warn">The pool is not deployed yet, so there is nothing to show. Set the pool address in the config.</Notice>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Free capital" value={data ? usd(data.freeCapital) : '...'} hint="Available to withdraw" />
            <Stat label="Total reserved" value={data ? usd(data.totalReserved) : '...'} hint="Held for active payouts" />
            <Stat label="Total assets" value={data ? usd(data.totalAssets) : '...'} />
            <Stat label="Exit price per share" value={data ? `${sharePriceText} USDC` : '...'} hint="If every open policy pays" />
          </div>
        )}
        <p className="mt-4 text-sm text-[var(--ink-2)] text-pretty">
          Reserved capital cannot be withdrawn because it is already promised to importers with active cover, and it is
          released back to funders only when a policy settles.
        </p>
        <p className="mt-2 text-sm text-[var(--ink-2)] text-pretty">
          Exits are priced as if every open policy pays out, and a minimum of{' '}
          {data ? usdNumber(data.minLiveShares, 0) : '1'} share stays in the pool while policies are open.
        </p>
      </Card>

      {pool && isConnected && data && data.owedPayout > 0n && (
        <Card>
          <h3 className="display text-xl font-semibold">Payout waiting for you</h3>
          <p className="mt-2 text-sm text-[var(--muted)] text-pretty">
            The pool could not send {usd(data.owedPayout)} to this wallet when your policy paid out, for example because the
            token issuer blocked the address. It is held for you and can be claimed to this same wallet.
          </p>
          <button
            className="btn btn-primary mt-4 w-full"
            disabled={claimTx.state.phase === 'wallet' || claimTx.state.phase === 'confirming'}
            onClick={() => void claim()}
          >
            Claim payout
          </button>
          <TxStatus state={claimTx.state} successText="Payout claimed." />
        </Card>
      )}

      {pool && (
        <Card>
          <h3 className="display text-xl font-semibold">Your position</h3>
          {!isConnected ? (
            <div className="mt-4">
              <p className="mb-3 text-sm text-[var(--muted)]">Connect a wallet to deposit or redeem.</p>
              <ConnectKitButton />
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Your shares" value={data ? usdNumber(data.shares, 4) : '...'} />
                <Stat label="Exit value" value={data ? usd(data.exitValue) : '...'} hint="What your shares receive on exit" />
                <Stat label="Redeemable now" value={data ? usd(data.redeemableUsdc) : '...'} hint="After reserves and the minimum share" />
              </div>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <label htmlFor="deposit" className="label">Deposit USDC</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="deposit"
                      className="field tabular-nums"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={depositText}
                      onChange={(e) => setDepositText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => data && setDepositText(usdNumber(data.usdcBalance, 6))}
                    >
                      Max
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    Wallet balance: {data ? usd(data.usdcBalance) : '...'}
                  </div>
                  {depositTooMuch && <div className="mt-1 text-xs text-[var(--danger)]">More than your USDC balance.</div>}
                  <div className="mt-3 flex flex-col gap-2">
                    {needsApproval ? (
                      <button className="btn btn-primary" disabled={depositTooMuch || approveTx.state.phase === 'wallet' || approveTx.state.phase === 'confirming'} onClick={() => void approve()}>
                        Approve USDC
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        disabled={depositAmount === undefined || depositTooMuch || depositTx.state.phase === 'wallet' || depositTx.state.phase === 'confirming'}
                        onClick={() => void deposit()}
                      >
                        Deposit
                      </button>
                    )}
                  </div>
                  <TxStatus state={approveTx.state} successText="USDC approved." />
                  <TxStatus state={depositTx.state} successText="Deposit confirmed." />
                </div>

                <div>
                  <label htmlFor="redeem" className="label">Redeem to USDC</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      id="redeem"
                      className="field tabular-nums"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={redeemText}
                      onChange={(e) => setRedeemText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => data && setRedeemText(usdNumber(data.redeemableUsdc, 6))}
                    >
                      Max
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">Up to {data ? usd(data.redeemableUsdc) : '...'} right now.</div>
                  {redeemTooMuch && (
                    <div className="mt-1 text-xs text-[var(--danger)]">
                      That is more than the free capital allows. Reserved capital cannot be withdrawn.
                    </div>
                  )}
                  <div className="mt-3">
                    <button
                      className="btn btn-primary w-full"
                      disabled={redeemAmount === undefined || redeemTooMuch || redeemTx.state.phase === 'wallet' || redeemTx.state.phase === 'confirming'}
                      onClick={() => void redeem()}
                    >
                      Redeem
                    </button>
                  </div>
                  <TxStatus state={redeemTx.state} successText="Redeemed." />
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
