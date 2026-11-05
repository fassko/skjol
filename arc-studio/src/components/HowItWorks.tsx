import { ArrowDown, Banknote, FileSignature, Landmark, RadioTower, ShieldCheck, Undo2, Ship } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from './ui'

type Step = { icon: LucideIcon; who: string; title: string; text: string }

const steps: Step[] = [
  {
    icon: Landmark,
    who: 'Funders',
    title: 'Deposit USDC into the pool',
    text: 'Funders receive shares. Premiums raise the share price and payouts lower it.',
  },
  {
    icon: FileSignature,
    who: 'Skjol backend',
    title: 'Signs a quote',
    text: 'Skjol prices the shipment (vessel, port, deadline) and signs the premium and payout.',
  },
  {
    icon: Ship,
    who: 'Importer',
    title: 'Buys cover, payout is reserved',
    text: 'The importer pays the premium. The payout is set aside in the pool and cannot be withdrawn by funders.',
  },
  {
    icon: RadioTower,
    who: 'Chainlink CRE workflow',
    title: 'Reads the port-call record',
    text: 'The workflow reads the recorded vessel arrival and sends the evidence to the pool.',
  },
]

function StepCard({ s, n }: { s: Step; n: number }) {
  const Icon = s.icon
  return (
    <div className="flex gap-4 rounded-2xl bg-[var(--surface-muted)] p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white">
        <Icon size={20} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="label">
          {n}. {s.who}
        </div>
        <div className="display mt-0.5 text-lg font-semibold">{s.title}</div>
        <p className="mt-1 text-sm text-[var(--muted)] text-pretty">{s.text}</p>
      </div>
    </div>
  )
}

function Down() {
  return (
    <div className="flex justify-center py-1 text-[var(--subtle)]" aria-hidden>
      <ArrowDown size={20} />
    </div>
  )
}

export function HowItWorks() {
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="display text-2xl font-semibold">How it works</h2>
        <p className="mt-2 text-sm text-[var(--muted)] text-pretty">
          Arrival delay cover pays a fixed amount of USDC when a vessel&apos;s recorded arrival at the destination port is
          more than 24 hours after the agreed deadline. There is no claim form.
        </p>
        <div className="mt-5">
          {steps.map((s, i) => (
            <div key={s.title}>
              <StepCard s={s} n={i + 1} />
              <Down />
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--success)] p-4">
              <div className="flex items-center gap-2 text-[var(--success)]">
                <Banknote size={20} aria-hidden />
                <span className="label !text-[var(--success)]">5a. More than 24 hours late</span>
              </div>
              <div className="display mt-1 text-lg font-semibold">The pool pays the importer</div>
              <p className="mt-1 text-sm text-[var(--muted)]">The fixed payout is sent to the importer&apos;s wallet.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-strong)] p-4">
              <div className="flex items-center gap-2 text-[var(--ink-2)]">
                <Undo2 size={20} aria-hidden />
                <span className="label">5b. On time or within 24 hours</span>
              </div>
              <div className="display mt-1 text-lg font-semibold">The reserve goes back to funders</div>
              <p className="mt-1 text-sm text-[var(--muted)]">The policy closes with no payout and the reserved capital is free again.</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <ShieldCheck size={20} aria-hidden />
          <h3 className="display text-xl font-semibold">What is covered</h3>
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-[var(--ink-2)]">
          <li>One event only: the recorded arrival of the named vessel at the named port.</li>
          <li>The pool decides the outcome itself from the terms locked at purchase. The evidence only supplies times.</li>
          <li>Exactly 24 hours late does not pay. One second more does.</li>
          <li>Container discharge, customs release and delivery are not covered.</li>
          <li>If no evidence ever arrives, the policy stays active until the pool owner resolves it after the review period.</li>
        </ul>
      </Card>
    </div>
  )
}
