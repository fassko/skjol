import Link from "next/link";
import { FleetGrid, GrowthChart, PremiumBars } from "./components/market";

const STEPS = [
  { n: "01", t: "Upload", d: "Share your bill of lading. It is encrypted before storage; AI reads the vessel, voyage, port and dates and shows you where each value came from." },
  { n: "02", t: "Confirm & buy", d: "You check every detail. Prices and payouts are fixed. Pay a small premium in test USDC; the payout is reserved from the shared capital pool the moment you buy." },
  { n: "03", t: "We watch the port", d: "Arrival records for your port — official port-call records in Finland, vessel tracking in India — are checked against your agreed deadline. Changing ETAs never move your deadline." },
  { n: "04", t: "Automatic payout", d: "If the recorded arrival is more than 24 hours late, the fixed payout is sent to your wallet. Missing or conflicting data never closes your cover." },
];

const PROBLEMS = [
  { t: "Delay is the risk nobody covers", d: "Standard cargo and hull policies insure physical loss and damage. Loss caused by delay is a standard exclusion, so a late vessel usually leaves the importer with no claim at all." },
  { t: "Small importers feel it most", d: "A ship days behind schedule means empty shelves, idle staff and missed sales windows. Large shippers can absorb this; a small business carries it alone." },
  { t: "Claims are slow and manual", d: "Even where cover exists, proving a loss means paperwork, adjusters and weeks or months of waiting, often for an amount below the cost of pursuing it." },
];

const OPPORTUNITIES = [
  { t: "Commercial shipping", d: "High-value assets, established insurance demand and complex underwriting." },
  { t: "Recreational vessels", d: "A large customer base with room for digital-first insurance." },
  { t: "Parametric insurance", d: "Automated payouts triggered by objective data such as weather, storms and port disruptions. This is where Skjol starts.", highlight: true },
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
            Skjol pays a fixed amount when your vessel’s recorded arrival at a port is more than 24 hours after the deadline in your contract. No claim forms.
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

      <section className="space-y-5">
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-signal">The problem</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">When the ship is late, the importer pays.</h2>
          <p className="text-ink-2">
            Marine insurance was built for ships that sink and cargo that breaks, not for ships that simply arrive late. That gap lands on the businesses least able to absorb it.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PROBLEMS.map((p) => (
            <div key={p.t} className="card p-5">
              <div className="font-display text-lg font-semibold">{p.t}</div>
              <p className="text-sm text-ink-2 mt-2">{p.d}</p>
            </div>
          ))}
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

      <section className="space-y-5">
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-sea">Market size</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">Global shipping &amp; marine insurance</h2>
          <p className="text-ink-2">
            Marine insurance is a ~$40B annual global market, backed by a commercial fleet worth over $1.5T. Fleet capacity has grown ~3.4% a year, and recreational vessel insurance is projected to grow 4.9% a year.
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">The global commercial fleet</div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <div className="font-display text-4xl font-semibold">~116,000</div>
                <div className="text-sm text-ink-2">vessels</div>
              </div>
              <div>
                <div className="font-display text-4xl font-semibold text-sea">~$1.54T</div>
                <div className="text-sm text-ink-2">total fleet value</div>
              </div>
            </div>
            <FleetGrid />
            <p className="text-xs text-muted">Each ship = 1,000 vessels.</p>
          </div>
          <div className="card p-6 space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Annual insurance premiums</div>
            <PremiumBars />
            <p className="text-xs text-muted">Bars drawn to the same scale.</p>
          </div>
        </div>
        <div className="card p-6 space-y-4">
          <div className="text-xs uppercase tracking-wide text-muted font-semibold">Cumulative growth from the start of each period</div>
          <GrowthChart />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {OPPORTUNITIES.map((o) => (
            <div key={o.t} className={`card p-5 ${o.highlight ? "!border-signal" : ""}`}>
              <div className={`text-xs uppercase tracking-wide font-semibold ${o.highlight ? "text-signal" : "text-muted"}`}>Opportunity</div>
              <div className="font-display text-lg font-semibold mt-1">{o.t}</div>
              <p className="text-sm text-ink-2 mt-2">{o.d}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Marine insurance includes cargo, hull, liability and offshore energy. Recreational insurance estimates may overlap with the broader market.
        </p>
      </section>

      <section className="card p-6 grid md:grid-cols-4 gap-6 text-sm">
        <div className="md:col-span-1">
          <div className="font-display text-xl font-semibold">Built on</div>
          <Link href="/integrations" className="text-xs underline text-muted">See exactly what is live →</Link>
        </div>
        <div><strong>Arc</strong><p className="text-ink-2">Shared USDC capital pool with tradeable vault shares, reserved payouts and settlements.</p></div>
        <div><strong>Chainlink CRE</strong><p className="text-ink-2">Workflow that fetches port-call records and submits arrival evidence.</p></div>
        <div><strong>Arkiv + Swarm</strong><p className="text-ink-2">Queryable, encrypted application records and encrypted document storage.</p></div>
        <div className="md:col-span-4 text-xs text-muted">
          Capital providers mint shares on deposit and can trade them on Uniswap — <Link href="/capital" className="underline">open Capital</Link>.
        </div>
      </section>
    </div>
  );
}
