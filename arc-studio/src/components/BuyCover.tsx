import { useMemo, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { erc20Abi, recoverAddress, type Hex } from 'viem'
import { Check, X, Ship } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { CHAIN_ID, POOL_ADDRESS, USDC_ADDRESS, poolAbi } from '@/contract'
import { parseSignedQuote, type SignedQuote } from '@/lib/quote'
import { formatDateTime, formatDuration, locodeToText, shortAddr, usd } from '@/lib/format'
import { usePoolData } from '@/hooks/usePoolData'
import { useTx } from '@/hooks/useTx'
import { AddressLink, Card, Notice, TxStatus } from './ui'

type Check = { ok: boolean; label: string; detail?: string }

function QuoteSummary({ signed }: { signed: SignedQuote }) {
  const q = signed.quote
  const rows: [string, React.ReactNode][] = [
    ['Vessel (IMO)', <span className="tabular-nums">{q.vesselImo}</span>],
    ['Destination port', <span className="mono">{locodeToText(q.destinationLocode)}</span>],
    ['Agreed arrival deadline', formatDateTime(q.agreedArrivalDeadline)],
    ['Pays out if arrival is more than', formatDuration(q.delayThreshold) + ' late'],
    ['Premium you pay', <strong className="tabular-nums">{usd(q.premium)}</strong>],
    ['Payout if delayed', <strong className="tabular-nums">{usd(q.payout)}</strong>],
    ['Buy before', formatDateTime(q.purchaseCutoff)],
    ['Quote expires', formatDateTime(q.quoteExpiry)],
    ['Paid to', <AddressLink address={q.beneficiary} />],
  ]
  return (
    <dl className="divide-y divide-[var(--border)] rounded-2xl bg-[var(--surface-muted)] px-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm">
          <dt className="text-[var(--muted)]">{k}</dt>
          <dd className="text-right">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function BuyCover({ onOpenPolicy }: { onOpenPolicy: (id: Hex) => void }) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { data: pool, refetch } = usePoolData()
  const approveTx = useTx()
  const buyTx = useTx()
  const [text, setText] = useState('')

  const parsed = useMemo<{ signed?: SignedQuote; error?: string }>(() => {
    if (!text.trim()) return {}
    try {
      return { signed: parseSignedQuote(text) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Could not read the quote.' }
    }
  }, [text])
  const signed = parsed.signed

  const verify = useQuery({
    queryKey: ['verify-quote', POOL_ADDRESS, signed?.signature, signed?.quote.quoteId, signed?.quote.premium.toString(), signed?.quote.payout.toString(), signed?.quote.quoteExpiry.toString()],
    enabled: Boolean(signed && POOL_ADDRESS && publicClient),
    refetchInterval: 15000,
    queryFn: async () => {
      if (!signed || !POOL_ADDRESS || !publicClient) throw new Error('not ready')
      const base = { address: POOL_ADDRESS, abi: poolAbi } as const
      const [digest, quoteSigner, used, available, maxPayout, paused, block] = await Promise.all([
        publicClient.readContract({ ...base, functionName: 'hashQuote', args: [signed.quote] }),
        publicClient.readContract({ ...base, functionName: 'quoteSigner' }),
        publicClient.readContract({ ...base, functionName: 'quoteUsed', args: [signed.quote.quoteId] }),
        publicClient.readContract({ ...base, functionName: 'availableCapital' }),
        publicClient.readContract({ ...base, functionName: 'maxPayout' }),
        publicClient.readContract({ ...base, functionName: 'purchasesPaused' }),
        publicClient.getBlock(),
      ])
      let recovered: string | undefined
      try {
        recovered = await recoverAddress({ hash: digest, signature: signed.signature })
      } catch {
        recovered = undefined
      }
      return { quoteSigner, recovered, used, available, maxPayout, paused, now: block.timestamp }
    },
  })

  const checks: Check[] = useMemo(() => {
    if (!signed || !verify.data) return []
    const q = signed.quote
    const v = verify.data
    const list: Check[] = [
      {
        ok: v.recovered?.toLowerCase() === v.quoteSigner.toLowerCase(),
        label: 'Signed by Skjol\u2019s underwriting key',
        detail: v.recovered ? `Signer ${shortAddr(v.recovered)}, pool expects ${shortAddr(v.quoteSigner)}` : 'Signature could not be read',
      },
      { ok: v.now <= q.quoteExpiry, label: 'Quote has not expired' },
      { ok: v.now <= q.purchaseCutoff, label: 'Purchase window is still open' },
      { ok: !v.used, label: 'Quote has not been used before' },
      { ok: q.payout <= v.maxPayout, label: 'Payout is within the pool limit', detail: `Limit ${usd(v.maxPayout)}` },
      {
        ok: v.available + q.premium >= q.payout,
        label: 'Pool has enough free capital to back the payout',
        detail: `Free capital ${usd(v.available)}`,
      },
      { ok: !v.paused, label: 'New cover is open' },
    ]
    list.push({
      ok: Boolean(address) && address?.toLowerCase() === q.beneficiary.toLowerCase(),
      label: 'Connected wallet is the one named in the quote',
      detail: address ? undefined : 'Connect a wallet',
    })
    if (pool) list.push({ ok: pool.usdcBalance >= q.premium, label: 'Your USDC balance covers the premium', detail: `Balance ${usd(pool.usdcBalance)}` })
    return list
  }, [signed, verify.data, address, pool])

  const allOk = checks.length > 0 && checks.every((c) => c.ok)
  const needsApproval = signed && pool ? pool.allowance < signed.quote.premium : false
  const busy = (s: string) => s === 'wallet' || s === 'confirming'

  async function approve() {
    if (!signed || !POOL_ADDRESS) return
    const ok = await approveTx.run({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [POOL_ADDRESS, signed.quote.premium] })
    if (ok) void refetch()
  }

  async function buy() {
    if (!signed || !POOL_ADDRESS) return
    const ok = await buyTx.run({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'purchase', args: [signed.quote, signed.signature] })
    if (ok) {
      void refetch()
      void verify.refetch()
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <Ship size={22} aria-hidden />
          <h2 className="display text-2xl font-semibold">Buy arrival delay cover</h2>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)] text-pretty">
          Skjol prices your shipment and signs a quote. Paste it here to buy. If the vessel&apos;s recorded arrival at the
          port is more than 24 hours after your deadline, the payout goes straight to your wallet. Cover is for vessel
          arrival only, not container discharge, customs release or delivery.
        </p>
        {!POOL_ADDRESS && (
          <div className="mt-4">
            <Notice tone="warn">The pool is not deployed yet, so quotes cannot be checked or bought.</Notice>
          </div>
        )}
        <label htmlFor="quote" className="label mt-5 block">Signed quote (JSON)</label>
        <textarea
          id="quote"
          className="field mono mt-2 min-h-[160px] py-3 text-xs"
          placeholder='{"quoteId":"0x...","policyId":"0x...","beneficiary":"0x...","vesselImo":9393266, ... ,"signature":"0x..."}'
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        {parsed.error && <div className="mt-2 text-sm text-[var(--danger)]">{parsed.error}</div>}
      </Card>

      {signed && (
        <Card>
          <h3 className="display text-xl font-semibold">Your cover</h3>
          <div className="mt-4">
            <QuoteSummary signed={signed} />
          </div>

          <h4 className="label mt-6">Checks before you buy</h4>
          {verify.isLoading && <div className="mt-2 text-sm text-[var(--muted)]">Checking the quote against the pool...</div>}
          {verify.isError && <div className="mt-2 text-sm text-[var(--danger)]">Could not check the quote. Retry in a moment.</div>}
          <ul className="mt-2 space-y-2">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <Check size={18} className="mt-0.5 shrink-0 text-[var(--success)]" aria-hidden />
                ) : (
                  <X size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" aria-hidden />
                )}
                <span>
                  {c.label}
                  {c.detail ? <span className="block text-xs text-[var(--muted)]">{c.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            {!isConnected ? (
              <ConnectKitButton />
            ) : needsApproval ? (
              <button className="btn btn-primary w-full" disabled={!allOk || busy(approveTx.state.phase)} onClick={() => void approve()}>
                Approve {usd(signed.quote.premium)} premium
              </button>
            ) : (
              <button className="btn btn-primary w-full" disabled={!allOk || busy(buyTx.state.phase)} onClick={() => void buy()}>
                Buy cover for {usd(signed.quote.premium)}
              </button>
            )}
          </div>
          <TxStatus state={approveTx.state} successText="Premium approved. You can buy now." />
          <TxStatus state={buyTx.state} successText="Cover purchased. Your payout is reserved." />
          {buyTx.state.phase === 'success' && (
            <button className="btn btn-ghost mt-3 w-full" onClick={() => onOpenPolicy(signed.quote.policyId)}>
              View this policy
            </button>
          )}
        </Card>
      )}
    </div>
  )
}
