import Link from "next/link";
import { HeroFilm } from "./components/hero-film";
import { FleetGrid, GrowthChart, PremiumBars } from "./components/market";

const STEPS = [
  { n: "01", t: "Upload", d: "Share your bill of lading. It is encrypted before storage; AI reads the vessel, voyage, port and dates and shows you where each value came from." },
  { n: "02", t: "Confirm & buy", d: "You check every detail. Prices and payouts are fixed. Pay a small premium in test USDC; the payout is reserved from the shared capital pool the moment you buy." },
  { n: "03", t: "We watch the port", d: "Arrival records for your port — official port-call records in Finland, vessel tracking in India — are checked against your agreed deadline. Changing ETAs never move your deadline." },
  { n: "04", t: "Automatic payout", d: "If the recorded arrival is more than 24 hours late, the fixed payout is sent to your wallet. Missing or conflicting data never closes your cover." },
];

const DEMO_PATH = [
  {
    href: "/cover",
    label: "Get cover",
    detail: "Connect with the demo wallet, switch to Step by step, upload a bill of lading, then buy with test USDC.",
  },
  {
    href: "/integrations",
    label: "How it’s built",
    detail: "Live Arc pool, Chainlink CRE, Arkiv writers, Swarm postage status, and the MCP/x402 surfaces.",
  },
  {
    href: "/capital",
    label: "Capital",
    detail: "Fund the shared pool, redeem free collateral, or trade vault shares on Uniswap V2.",
  },
  {
    href: "/agent",
    label: "Freight agent",
    detail: "Agent finds paid port data, pays per call (Arc or Hedera x402), and can buy cover inside limits.",
  },
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

const STACK = [
  { t: "Arc", d: "Shared USDC capital pool with tradeable vault shares, reserved payouts and settlements." },
  { t: "Chainlink CRE", d: "Workflow that fetches port-call records and submits arrival evidence." },
  { t: "Arkiv + Swarm", d: "Queryable, encrypted application records and encrypted document storage." },
];

export default function Home() {
  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-[#fffdf8]/80 px-5 py-10 sm:px-8 sm:py-14 reveal">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 70% at 88% 18%, rgba(29,107,116,0.14), transparent 55%), radial-gradient(ellipse 60% 50% at 12% 88%, rgba(217,72,15,0.08), transparent 50%)",
          }}
        />
        <div className="relative grid items-center gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-sea">Skjol</p>
            <h1 className="font-display text-4xl sm:text-6xl font-semibold leading-[1.05]">
              Late ship? <br />
              Get paid, <span className="text-signal">automatically.</span>
            </h1>
            <p className="text-lg text-ink-2 max-w-xl">
              Parametric arrival-delay cover for small importers: a fixed payout when the named vessel’s recorded arrival is more than 24 hours after the deadline in your contract. No claim forms.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/cover" className="btn btn-signal">
                Get cover
              </Link>
              <Link href="/integrations" className="btn btn-ghost">
                How it’s built
              </Link>
            </div>
            <p className="text-xs text-muted max-w-xl">
              Testnet demo — payments use test USDC. Start on Get cover with{" "}
              <strong className="text-ink-2 font-semibold">Use demo wallet (test funds)</strong>.
            </p>
          </div>
          <HeroFilm />
        </div>
      </section>

      <section className="space-y-5 reveal" style={{ animationDelay: "80ms" }}>
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-signal">Try it</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">Where to click in the app</h2>
          <p className="text-ink-2">
            Four surfaces cover the product end to end. Start with cover, then open the live stack status.
          </p>
        </div>
        <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
          {DEMO_PATH.map((item, i) => (
            <li key={item.href} className="flex gap-4 items-start border-t border-line pt-4">
              <span className="mono text-signal text-sm shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
              <div className="space-y-1 min-w-0">
                <Link href={item.href} className="font-display text-xl font-semibold hover:text-sea underline-offset-4 hover:underline">
                  {item.label}
                </Link>
                <p className="text-sm text-ink-2">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-5 reveal" style={{ animationDelay: "120ms" }}>
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-sea">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">Upload once. Cover settles itself.</h2>
          <p className="text-ink-2">
            The same path the importer takes in the app: document in, terms locked, port watched, payout when late.
          </p>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-4">
          {STEPS.map((s) => (
            <li key={s.n} className="space-y-2 border-t border-line pt-4">
              <div className="mono text-signal text-sm">{s.n}</div>
              <div className="font-display text-xl font-semibold">{s.t}</div>
              <p className="text-sm text-ink-2">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid lg:grid-cols-2 gap-8 items-start reveal" style={{ animationDelay: "160ms" }}>
        <div className="space-y-3">
          <p className="tag text-sea">What’s covered</p>
          <h2 className="font-display text-3xl font-semibold leading-tight">The ship’s arrival — not the container’s journey.</h2>
          <p className="text-ink-2 text-sm max-w-md">
            A ship can arrive on time while your container is delivered late. This cover is about the vessel at the named port.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 text-sm">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Covered</div>
            <ul className="space-y-2">
              <li className="flex gap-2"><span className="text-ok shrink-0">✓</span> Recorded arrival of the named vessel at the named port</li>
              <li className="flex gap-2"><span className="text-ok shrink-0">✓</span> More than 24 hours after your fixed, agreed deadline</li>
              <li className="flex gap-2"><span className="text-ok shrink-0">✓</span> Fixed payout, sent to your wallet</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted font-semibold">Not covered</div>
            <ul className="space-y-2 text-ink-2">
              <li className="flex gap-2"><span className="text-bad shrink-0">✕</span> Container unloading, customs or terminal delays</li>
              <li className="flex gap-2"><span className="text-bad shrink-0">✕</span> Inland transport or final delivery</li>
              <li className="flex gap-2"><span className="text-bad shrink-0">✕</span> Damage or loss of goods</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-5 reveal" style={{ animationDelay: "180ms" }}>
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-signal">The problem</p>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">When the ship is late, the importer pays.</h2>
          <p className="text-ink-2">
            Marine insurance was built for ships that sink and cargo that breaks, not for ships that simply arrive late. That gap lands on the businesses least able to absorb it.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {PROBLEMS.map((p) => (
            <div key={p.t} className="space-y-2 border-t border-line pt-4">
              <div className="font-display text-lg font-semibold">{p.t}</div>
              <p className="text-sm text-ink-2">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5 reveal" style={{ animationDelay: "200ms" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <p className="tag text-sea">Built on</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">Settlement, evidence, and sealed documents.</h2>
            <p className="text-ink-2">
              Capital providers mint shares on deposit and can trade them on Uniswap —{" "}
              <Link href="/capital" className="underline">
                open Capital
              </Link>
              .
            </p>
          </div>
          <Link href="/integrations" className="btn btn-ghost !text-xs">
            See exactly what is live →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {STACK.map((s) => (
            <div key={s.t} className="space-y-2 border-t border-line pt-4">
              <div className="font-display text-xl font-semibold">{s.t}</div>
              <p className="text-sm text-ink-2">{s.d}</p>
            </div>
          ))}
        </div>
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
    </div>
  );
}
