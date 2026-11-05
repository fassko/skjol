import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { isHex, parseAbiItem, stringToHex, type Hex, type PublicClient } from 'viem'
import { CHAIN_ID, POOL_ADDRESS, POOL_DEPLOY_BLOCK, STATUS_LABELS, poolAbi } from '@/contract'
import { formatDateTime, formatDuration, locodeToText, shortHash, usd } from '@/lib/format'
import { AddressLink, Card, Notice, TxLink } from './ui'

const purchasedEvent = parseAbiItem(
  'event PolicyPurchased(bytes32 indexed policyId, address indexed beneficiary, bytes32 indexed quoteId, uint32 vesselImo, bytes32 destinationLocode, uint64 agreedArrivalDeadline, uint32 delayThreshold, uint128 premium, uint128 payout, bytes32 termsHash)',
)
const paidEvent = parseAbiItem(
  'event PolicyPaidOut(bytes32 indexed policyId, address indexed beneficiary, uint128 payout, uint64 arrivalTime, uint64 delaySeconds)',
)
const closedEvent = parseAbiItem('event PolicyClosedNoPayout(bytes32 indexed policyId, uint64 arrivalTime, int64 delaySeconds)')
const reviewEvent = parseAbiItem('event PolicyResolvedByReview(bytes32 indexed policyId, bool paid, bytes32 reasonHash)')

const CHUNK = 9000n

type Purchased = { policyId: Hex; blockNumber: bigint; txHash: Hex; logIndex: number }

/** Scan from the deploy block to the head in bounded ranges. Halves the range if the node rejects it. */
async function getLogsChunked(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  fetchRange: (from: bigint, to: bigint) => Promise<{ blockNumber: bigint; transactionHash: Hex; logIndex: number; args: Record<string, unknown> }[]>,
) {
  const out: { blockNumber: bigint; transactionHash: Hex; logIndex: number; args: Record<string, unknown> }[] = []
  let from = fromBlock
  let size = CHUNK
  while (from <= toBlock) {
    const to = from + size - 1n > toBlock ? toBlock : from + size - 1n
    try {
      out.push(...(await fetchRange(from, to)))
      from = to + 1n
    } catch (e) {
      if (size <= 500n) throw e
      size = size / 2n
    }
  }
  return out
}

function usePolicyList() {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['policy-list', POOL_ADDRESS, POOL_DEPLOY_BLOCK?.toString()],
    enabled: Boolean(client && POOL_ADDRESS && POOL_DEPLOY_BLOCK !== undefined),
    refetchInterval: 20000,
    queryFn: async () => {
      if (!client || !POOL_ADDRESS || POOL_DEPLOY_BLOCK === undefined) return { items: [] as Purchased[], head: 0n }
      const head = await client.getBlockNumber()
      const logs = await getLogsChunked(client, POOL_DEPLOY_BLOCK, head, async (fromBlock, toBlock) => {
        const r = await client.getLogs({ address: POOL_ADDRESS, event: purchasedEvent, fromBlock, toBlock })
        return r.map((l) => ({ blockNumber: l.blockNumber, transactionHash: l.transactionHash, logIndex: l.logIndex, args: { ...l.args } }))
      })
      const items: Purchased[] = logs
        .map((l) => ({ policyId: l.args.policyId as Hex, blockNumber: l.blockNumber, txHash: l.transactionHash, logIndex: l.logIndex }))
        .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1))
      return { items, head }
    },
  })
}

function usePolicy(id: Hex | undefined) {
  const client = usePublicClient({ chainId: CHAIN_ID })
  return useQuery({
    queryKey: ['policy', POOL_ADDRESS, id],
    enabled: Boolean(client && POOL_ADDRESS && id),
    refetchInterval: 15000,
    queryFn: async () => {
      if (!client || !POOL_ADDRESS || !id) throw new Error('not ready')
      const policy = await client.readContract({ address: POOL_ADDRESS, abi: poolAbi, functionName: 'getPolicy', args: [id] })
      const status = STATUS_LABELS[policy.status] ?? 'None'
      let settlementTx: Hex | undefined
      if (status !== 'Active' && status !== 'None' && POOL_DEPLOY_BLOCK !== undefined) {
        const event = status === 'PaidOut' ? paidEvent : status === 'ClosedNoPayout' ? closedEvent : reviewEvent
        const head = await client.getBlockNumber()
        const logs = await getLogsChunked(client, POOL_DEPLOY_BLOCK, head, async (fromBlock, toBlock) => {
          const r = await client.getLogs({ address: POOL_ADDRESS, event, args: { policyId: id }, fromBlock, toBlock } as never)
          return (r as unknown as { blockNumber: bigint; transactionHash: Hex; logIndex: number }[]).map((l) => ({
            blockNumber: l.blockNumber,
            transactionHash: l.transactionHash,
            logIndex: l.logIndex,
            args: {},
          }))
        })
        settlementTx = logs.length > 0 ? logs[logs.length - 1].transactionHash : undefined
      }
      return { policy, status, settlementTx }
    },
  })
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  Active: { label: 'Active', color: 'var(--accent-hover)' },
  PaidOut: { label: 'Paid out', color: 'var(--success)' },
  ClosedNoPayout: { label: 'Closed, no payout', color: 'var(--muted)' },
  ResolvedByReview: { label: 'Resolved by review', color: 'var(--warn)' },
  None: { label: 'Not found', color: 'var(--danger)' },
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.None
  return (
    <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ color: s.color, borderColor: s.color }}>
      {s.label}
    </span>
  )
}

function PolicyDetail({ id }: { id: Hex }) {
  const { data, isLoading, isError } = usePolicy(id)
  if (isLoading) return <div className="text-sm text-[var(--muted)]">Loading policy...</div>
  if (isError || !data) return <Notice tone="danger">Could not load this policy. Retry in a moment.</Notice>
  const { policy: p, status, settlementTx } = data
  if (status === 'None') return <Notice tone="warn">No policy exists with this id.</Notice>

  const rows: [string, React.ReactNode][] = [
    ['Policy id', <span className="mono break-all text-xs">{id}</span>],
    ['Vessel (IMO)', <span className="tabular-nums">{p.vesselImo}</span>],
    ['Destination port', <span className="mono">{locodeToText(p.destinationLocode)}</span>],
    ['Agreed arrival deadline', formatDateTime(p.agreedArrivalDeadline)],
    ['Pays out if more than', formatDuration(p.delayThreshold) + ' late'],
    ['Premium paid', usd(p.premium)],
    ['Payout', usd(p.payout)],
    ['Paid to', <AddressLink address={p.beneficiary} />],
    ['Bought', formatDateTime(p.purchasedAt)],
  ]
  if (status !== 'Active') {
    if (status !== 'ResolvedByReview') rows.push(['Recorded arrival', formatDateTime(p.recordedArrival)])
    rows.push(['Settled', formatDateTime(p.settledAt)])
    rows.push([
      status === 'ResolvedByReview' ? 'Review reason hash' : 'Evidence digest',
      <span className="mono break-all text-xs">{p.settlementEvidence}</span>,
    ])
    rows.push([
      status === 'PaidOut' ? 'Payout transaction' : status === 'ClosedNoPayout' ? 'Close transaction' : 'Review transaction',
      settlementTx ? <TxLink hash={settlementTx} /> : <span className="text-[var(--muted)]">Looking up...</span>,
    ])
  }
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <StatusPill status={status} />
      </div>
      <dl className="divide-y divide-[var(--border)] rounded-2xl bg-[var(--surface-muted)] px-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="shrink-0 text-[var(--muted)]">{k}</dt>
            <dd className="min-w-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function normalizeId(text: string): Hex | undefined {
  const t = text.trim()
  if (isHex(t) && t.length === 66) return t
  if (/^[\x20-\x7e]{1,32}$/.test(t) && t.length > 0) return stringToHex(t, { size: 32 })
  return undefined
}

export function Policies({ openId }: { openId?: Hex }) {
  const list = usePolicyList()
  const [input, setInput] = useState('')
  const [selected, setSelected] = useState<Hex | undefined>(openId)

  const typed = normalizeId(input)

  if (!POOL_ADDRESS || POOL_DEPLOY_BLOCK === undefined) {
    return (
      <Card>
        <h2 className="display text-2xl font-semibold">Policies</h2>
        <div className="mt-4">
          <Notice tone="warn">The pool is not deployed yet, so there are no policies to list.</Notice>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="display text-2xl font-semibold">Policies</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Every policy bought from this pool, newest first.</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed) setSelected(typed)
          }}
        >
          <input
            className="field mono text-sm"
            placeholder="Open a policy by id (0x...)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Policy id"
          />
          <button className="btn btn-primary" type="submit" disabled={!typed}>
            Open
          </button>
        </form>
      </Card>

      {selected && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="display text-xl font-semibold">Policy</h3>
            <button className="btn btn-ghost !min-h-[40px]" onClick={() => setSelected(undefined)}>
              Close
            </button>
          </div>
          <PolicyDetail id={selected} />
        </Card>
      )}

      <Card>
        <h3 className="display text-xl font-semibold">All policies</h3>
        {list.isLoading && <div className="mt-3 text-sm text-[var(--muted)]">Reading purchases from the chain...</div>}
        {list.isError && <div className="mt-3 text-sm text-[var(--danger)]">Could not read policies. Retry in a moment.</div>}
        {list.data && list.data.items.length === 0 && (
          <div className="mt-3 text-sm text-[var(--muted)]">No policies have been bought yet.</div>
        )}
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {list.data?.items.map((it) => (
            <li key={`${it.txHash}-${it.logIndex}`}>
              <button
                className="flex min-h-[48px] w-full items-center justify-between gap-3 py-2 text-left text-sm hover:opacity-80"
                onClick={() => setSelected(it.policyId)}
              >
                <span className="mono">{shortHash(it.policyId)}</span>
                <span className="text-xs text-[var(--muted)]">block {it.blockNumber.toString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
