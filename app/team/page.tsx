import type { Metadata } from "next";
import Image from "next/image";
import portrait from "../../public/team/kristaps-grinbergs.jpg";

export const metadata: Metadata = {
  title: "Team — Skjol",
  description:
    "Kristaps Grinbergs builds Skjol. He leads developer relations at Flare and was technical co-founder of Qminder.",
};

const linkClass = "text-sea underline underline-offset-4 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sea";

export default function TeamPage() {
  return (
    <section aria-labelledby="team-heading" className="max-w-2xl py-4 space-y-8">
      <h1 id="team-heading" className="font-display text-3xl sm:text-4xl font-semibold">
        Behind Skjol
      </h1>
      <div className="flex flex-col sm:flex-row items-start gap-6">
        <Image
          src={portrait}
          alt="Kristaps Grinbergs"
          width={112}
          height={112}
          sizes="112px"
          placeholder="blur"
          className="rounded-xl shrink-0"
        />
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">Kristaps Grinbergs</h2>
          <p className="text-ink-2 leading-relaxed">
            I’m building Skjol to help small importers handle the cost of late
            shipments: clear cover terms, verified arrival data, and automatic
            payouts when a vessel is delayed. I lead developer relations at{" "}
            <a href="https://flare.network" target="_blank" rel="noopener noreferrer" className={linkClass}>
              Flare
            </a>
            , and before that I was technical co-founder of{" "}
            <a href="https://www.qminder.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
              Qminder
            </a>
            .
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <a href="mailto:fassko@gmail.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
              Get in touch
            </a>
            <a href="https://kristaps.me" target="_blank" rel="noopener noreferrer" className={linkClass}>
              kristaps.me
            </a>
            <a href="https://x.com/fassko" target="_blank" rel="noopener noreferrer" className={linkClass}>
              X
            </a>
            <a href="https://www.linkedin.com/in/kristapsgrinbergs" target="_blank" rel="noopener noreferrer" className={linkClass}>
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
