import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { ExternalLink } from 'lucide-react'
import type { Hex } from 'viem'
import { POOL_ADDRESS, SKJOL_APP_URL } from '@/contract'
import { AddressLink } from '@/components/ui'
import { PoolPanel } from '@/components/PoolPanel'
import { BuyCover } from '@/components/BuyCover'
import { Policies } from '@/components/Policies'
import { HowItWorks } from '@/components/HowItWorks'

type Tab = 'pool' | 'buy' | 'policies' | 'how'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pool', label: 'Pool' },
  { id: 'buy', label: 'Buy cover' },
  { id: 'policies', label: 'Policies' },
  { id: 'how', label: 'How it works' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('pool')
  const [openPolicy, setOpenPolicy] = useState<Hex | undefined>()

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-24 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="display text-2xl font-bold">Skjol Pool</div>
          <div className="text-xs text-[var(--muted)]">Arrival delay cover, settled in USDC on Arc Testnet</div>
        </div>
        <ConnectKitButton />
      </header>

      <nav className="mt-5 grid grid-cols-4 gap-1 rounded-full bg-[var(--surface-muted)] p-1" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`min-h-[44px] rounded-full px-2 text-xs font-semibold transition-colors sm:text-sm ${
              tab === t.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-2)] hover:bg-white/70'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mt-5">
        {tab === 'pool' && <PoolPanel />}
        {tab === 'buy' && (
          <BuyCover
            onOpenPolicy={(id) => {
              setOpenPolicy(id)
              setTab('policies')
            }}
          />
        )}
        {tab === 'policies' && <Policies key={openPolicy ?? 'all'} openId={openPolicy} />}
        {tab === 'how' && <HowItWorks />}
      </main>

      <footer className="mt-8 flex flex-col gap-2 text-sm text-[var(--muted)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Pool contract:</span>
          {POOL_ADDRESS ? <AddressLink address={POOL_ADDRESS} /> : <span>not deployed yet</span>}
        </div>
        <a className="link inline-flex items-center gap-1" href={SKJOL_APP_URL} target="_blank" rel="noopener noreferrer">
          Open the full Skjol app <ExternalLink size={12} aria-hidden />
        </a>
        <p className="text-xs text-pretty">
          Testnet only. Cover pays on the recorded vessel arrival at the named port. It does not cover container discharge,
          customs release or delivery.
        </p>
      </footer>
    </div>
  )
}
