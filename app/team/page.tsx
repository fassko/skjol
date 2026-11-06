import type { Metadata } from "next";
import Image from "next/image";
import portrait from "../../public/team/kristaps-grinbergs.jpg";

export const metadata: Metadata = {
  title: "Team — Skjol",
  description:
    "Meet Kristaps Grinbergs, the developer behind Skjol. Full-stack, mobile, and Web3 engineer, startup founder, and conference speaker.",
};

const profiles = [
  { label: "GitHub", href: "https://github.com/fassko" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/kristapsgrinbergs/" },
  { label: "X / Twitter", href: "https://twitter.com/fassko" },
];

// Biography and portrait sourced from https://kristaps.me/about.
const experience = [
  {
    company: "Flare Network",
    role: "Developer Relations Engineer Lead",
    period: "2023–present",
    description:
      "Building developer tools, documentation, workshops, and demos across Flare’s products, with a focus on AI agents, x402 payments, and developer education.",
  },
  {
    company: "Salto X",
    role: "Smart contracts & product",
    period: "2022–2023",
    description:
      "Worked on tokenised employee ownership with Solidity on Polygon and a Next.js client.",
  },
  {
    company: "Qminder",
    role: "Technical co-founder",
    period: "A decade of building",
    description:
      "Built queue management software used by Bolt, Uber, Lyft, and the Olympic Games.",
  },
];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sea";

export default function TeamPage() {
  return (
    <div className="space-y-10 sm:space-y-14 py-4">
      <header className="max-w-2xl space-y-4">
        <h1 className="font-display text-4xl sm:text-5xl font-semibold leading-tight">
          The person behind Skjol.
        </h1>
        <p className="text-lg text-ink-2 leading-relaxed">
          Meet the developer building arrival delay protection for small importers.
        </p>
      </header>

      <article aria-labelledby="kristaps-name" className="card overflow-hidden grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
        <div className="bg-paper-2">
          <Image
            src={portrait}
            alt="Kristaps Grinbergs"
            sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1152px) 40vw, 425px"
            preload
            placeholder="blur"
            className="w-full h-full aspect-square object-cover"
          />
        </div>
        <div className="p-6 sm:p-9 lg:p-10 flex flex-col justify-center">
          <p className="text-sm text-sea font-medium mb-3">Engineer, startup founder & speaker</p>
          <h2 id="kristaps-name" className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
            Kristaps Grinbergs
          </h2>
          <p className="text-sm text-ink-2 mt-2">Riga, Latvia</p>
          <div className="space-y-4 text-ink-2 leading-relaxed mt-6">
            <p>
              Kristaps is a full-stack, mobile, and Web3 developer. He leads
              Developer Relations Engineering at Flare Network, helping developers
              turn blockchain technology into working products.
            </p>
            <p>
              Before Flare, he spent a decade as technical co-founder at Qminder.
              His work now spans AI agents, stablecoin payments, smart contracts,
              and the tools that connect them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-7">
            <a href="https://kristaps.me" className={`btn btn-primary ${focusRing}`}>
              Visit kristaps.me
            </a>
            <a href="mailto:fassko@gmail.com" className={`btn btn-ghost ${focusRing}`}>
              Get in touch
            </a>
          </div>
          <ul aria-label="Kristaps’s social profiles" className="flex flex-wrap gap-x-5 gap-y-3 mt-6 text-sm">
            {profiles.map((profile) => (
              <li key={profile.href}>
                <a href={profile.href} className={`text-sea underline underline-offset-4 hover:text-ink ${focusRing}`}>
                  {profile.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <section aria-labelledby="experience-heading" className="grid md:grid-cols-[1fr_2fr] gap-6 md:gap-12">
        <div>
          <h2 id="experience-heading" className="font-display text-2xl sm:text-3xl font-semibold">From products to protocols.</h2>
          <p className="mt-3 text-ink-2 leading-relaxed">A background in building software, growing a startup, and helping other developers ship.</p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {experience.map((item) => (
            <li key={item.company} className="py-6 first:pt-5">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <h3 className="font-semibold text-lg">{item.company}</h3>
                <p className="text-sm text-ink-2">{item.period}</p>
              </div>
              <p className="text-sea text-sm mt-1">{item.role}</p>
              <p className="text-ink-2 leading-relaxed mt-3">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="beyond-heading" className="max-w-2xl space-y-3">
        <h2 id="beyond-heading" className="font-display text-2xl font-semibold">Beyond the code</h2>
        <p className="text-ink-2 leading-relaxed">
          Kristaps speaks at industry events, runs workshops and hackathon tracks,
          and mentors through Startup House. Away from the keyboard, he volunteers
          with Animal Freedom and enjoys orienteering, cycling, and gardening.
        </p>
        <p className="text-sm text-ink-2 pt-2">
          Biography and portrait from{" "}
          <a href="https://kristaps.me/about" className={`underline underline-offset-4 hover:text-sea ${focusRing}`}>
            kristaps.me
          </a>.
        </p>
      </section>
    </div>
  );
}
