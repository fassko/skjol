import type { ReactNode } from 'react'
import { ExternalLink, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { addressUrl, txUrl } from '@/contract'
import { shortAddr, shortHash } from '@/lib/format'
import type { TxState } from '@/hooks/useTx'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card p-5 sm:p-6 ${className}`}>{children}</section>
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
      <div className="label">{label}</div>
      <div className="display mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
  )
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a className="link mono text-sm inline-flex items-center gap-1" href={addressUrl(address)} target="_blank" rel="noopener noreferrer">
      {label ?? shortAddr(address)}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="link mono text-sm inline-flex items-center gap-1" href={txUrl(hash)} target="_blank" rel="noopener noreferrer">
      {label ?? shortHash(hash)}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

export function TxStatus({ state, successText }: { state: TxState; successText: string }) {
  if (state.phase === 'idle') return null
  return (
    <div
      role="status"
      className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm"
    >
      {state.phase === 'wallet' && (
        <>
          <Loader2 size={18} className="mt-0.5 animate-spin" aria-hidden />
          <span>Confirm in your wallet...</span>
        </>
      )}
      {state.phase === 'confirming' && (
        <>
          <Loader2 size={18} className="mt-0.5 animate-spin" aria-hidden />
          <span>
            Waiting for confirmation. {state.hash ? <TxLink hash={state.hash} /> : null}
          </span>
        </>
      )}
      {state.phase === 'success' && (
        <>
          <CheckCircle2 size={18} className="mt-0.5 text-[var(--success)]" aria-hidden />
          <span>
            {successText} {state.hash ? <TxLink hash={state.hash} /> : null}
          </span>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <AlertCircle size={18} className="mt-0.5 text-[var(--danger)]" aria-hidden />
          <span className="text-[var(--danger)]">{state.error}</span>
        </>
      )}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)'
  return (
    <div
      className="rounded-2xl border px-4 py-3 text-sm text-pretty"
      style={{ borderColor: color, color, background: 'rgba(255,255,255,0.6)' }}
    >
      {children}
    </div>
  )
}
