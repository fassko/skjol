import Link from "next/link";

const STEPS = [
  { n: "01", t: "Upload", d: "Share your bill of lading. It is encrypted before storage; AI reads the vessel, voyage, port and dates and shows you where each value came from." },
  { n: "02", t: "Confirm & buy", d: "You check every detail. Prices and payouts are fixed. Pay a small premium in test USDC; the payout is reserved in the pool the moment you buy." },
  { n: "03", t: "We watch the port", d: "Official Finnish port-call records are checked against your agreed deadline. Changing ETAs never move your deadline." },
  { n: "04", t: "Automatic payout", d: "If the recorded arrival is more than 24 hours late, the fixed payout is sent to your wallet. Missing or conflicting data never closes your cover." },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center pt-4">
        <div className="space-y-6">
          <p className="tag text-sea">Arrival delay cover for small importers</p>
          <h1 className="font-display text-4xl sm:text-6xl font-semibold leading-[1.05]">
            Late ship? <br />
            Get paid, <span className="text-signal">automatically.</span>
          </h1>
          <p className="text-lg text-ink-2 max-w-xl">
            Skjol pays a fixed amount when your vessel’s recorded arrival at a Finnish port is more than 24 hours after the deadline in your contract. No claim forms.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/cover" className="btn btn-signal">
              Get cover
            </Link>
            <Link href="/demo" className="btn btn-ghost">
              Watch the demo scenarios
            </Link>
          </div>
        </div>
        <div className="card p-6 space-y-4">
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">What’s covered</div>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><span className="text-ok">✓</span> Recorded arrival of the named vessel at the named port</li>
            <li className="flex gap-2"><span className="text-ok">✓</span> More than 24 hours after your fixed, agreed deadline</li>
            <li className="flex gap-2"><span className="text-ok">✓</span> Fixed payout, sent to your wallet</li>
          </ul>
          <div className="text-xs uppercase tracking-wide text-muted font-semibold pt-2">Not covered</div>
          <ul className="space-y-2 text-sm text-ink-2">
            <li className="flex gap-2"><span className="text-bad">✕</span> Container unloading, customs or terminal delays</li>
            <li className="flex gap-2"><span className="text-bad">✕</span> Inland transport or final delivery</li>
            <li className="flex gap-2"><span className="text-bad">✕</span> Damage or loss of goods</li>
          </ul>
          <p className="text-xs text-muted border-t border-line pt-3">A ship can arrive on time while your container is delivered late. This cover is about the ship.</p>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STEPS.map((s) => (
          <div key={s.n} className="card p-5">
            <div className="mono text-signal text-sm">{s.n}</div>
            <div className="font-display text-xl font-semibold mt-1">{s.t}</div>
            <p className="text-sm text-ink-2 mt-2">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="card p-6 grid md:grid-cols-4 gap-6 text-sm">
        <div className="md:col-span-1">
          <div className="font-display text-xl font-semibold">Built on</div>
          <Link href="/integrations" className="text-xs underline text-muted">See exactly what is live →</Link>
        </div>
        <div><strong>Arc</strong><p className="text-ink-2">USDC premiums, reserved collateral and payouts in a smart contract.</p></div>
        <div><strong>Chainlink CRE</strong><p className="text-ink-2">Workflow that fetches port-call records and submits arrival evidence.</p></div>
        <div><strong>Arkiv + Swarm</strong><p className="text-ink-2">Queryable, encrypted application records and encrypted document storage.</p></div>
      </section>
    </div>
  );
}
