const FLEET_VESSELS = 116_000;
const VESSELS_PER_ICON = 1_000;
const FLEET_COLS = 20;

const SHIP_PATH = "M0 6.5h12l-2 3H2z M1.5 3.5h5.5v2.5H1.5z M8 1h2v5H8z";

export function FleetGrid() {
  const icons = FLEET_VESSELS / VESSELS_PER_ICON;
  const rows = Math.ceil(icons / FLEET_COLS);
  const cell = { w: 15, h: 13 };
  return (
    <svg
      viewBox={`0 0 ${FLEET_COLS * cell.w} ${rows * cell.h}`}
      className="w-full h-auto"
      role="img"
      aria-label={`${icons} ship icons, each representing ${VESSELS_PER_ICON.toLocaleString("en-US")} commercial vessels`}
    >
      <g className="fill-ink">
        {Array.from({ length: icons }, (_, i) => (
          <path key={i} d={SHIP_PATH} transform={`translate(${(i % FLEET_COLS) * cell.w} ${Math.floor(i / FLEET_COLS) * cell.h})`} />
        ))}
      </g>
    </svg>
  );
}

const PREMIUMS = [
  { label: "Global marine insurance", value: 40, note: "Cargo, hull, liability and offshore energy", cls: "bg-ink" },
  { label: "Commercial hull insurance", value: 9.7, cls: "bg-sea" },
  { label: "Recreational boat & yacht insurance", value: 8.4, cls: "bg-signal" },
];

export function PremiumBars() {
  const max = Math.max(...PREMIUMS.map((p) => p.value));
  return (
    <div className="space-y-5">
      {PREMIUMS.map((p, i) => (
        <div key={p.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold">{p.label}</span>
            <span className="font-display text-xl font-semibold whitespace-nowrap">~${p.value}B</span>
          </div>
          <div className="mt-1.5 h-3 rounded-full bg-paper-2 overflow-hidden">
            <div
              className={`h-full rounded-full grow-x ${p.cls}`}
              style={{ width: `${(p.value / max) * 100}%`, animationDelay: `${i * 120}ms` }}
            />
          </div>
          {p.note && <div className="text-xs text-muted mt-1">{p.note}</div>}
        </div>
      ))}
    </div>
  );
}

type Series = { label: string; rate: number; from: number; to: number; forecast: boolean; stroke: string; fill: string; swatch: string };

const GROWTH: Series[] = [
  { label: "Commercial fleet capacity", rate: 0.034, from: 2016, to: 2026, forecast: false, stroke: "stroke-sea", fill: "fill-sea", swatch: "bg-sea" },
  { label: "Recreational vessel insurance", rate: 0.049, from: 2025, to: 2035, forecast: true, stroke: "stroke-signal", fill: "fill-signal", swatch: "bg-signal" },
];

const cumulative = (s: Series, year: number) => Math.pow(1 + s.rate, year - s.from) - 1;
const pct = (v: number) => `+${Math.round(v * 100)}%`;

export function GrowthChart() {
  const W = 480;
  const H = 230;
  const pad = { l: 38, r: 14, t: 14, b: 26 };
  const years = { min: 2016, max: 2035 };
  const yMax = 0.7;
  const x = (year: number) => pad.l + ((year - years.min) / (years.max - years.min)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const yTicks = [0, 0.2, 0.4, 0.6];
  const xTicks = [2016, 2020, 2025, 2030, 2035];
  const today = 2026;

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative growth of fleet capacity and recreational vessel insurance">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] mono">
              {t === 0 ? "0%" : pct(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-muted text-[11px] mono">
            {t}
          </text>
        ))}
        <line x1={x(today)} x2={x(today)} y1={pad.t} y2={H - pad.b} className="stroke-ink" strokeWidth={1} strokeDasharray="2 3" />
        <text x={x(today) + 4} y={pad.t + 10} className="fill-ink text-[11px] font-semibold">
          Today
        </text>
        {GROWTH.map((s) => {
          const pts = Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i).map((yr) => [x(yr), y(cumulative(s, yr))]);
          const [ex, ey] = pts[pts.length - 1];
          return (
            <g key={s.label}>
              <polyline
                points={pts.map((p) => p.join(",")).join(" ")}
                fill="none"
                className={s.stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.forecast ? "6 4" : undefined}
              />
              <circle cx={ex} cy={ey} r={3.5} className={s.fill} />
              <text x={ex - 6} y={ey - 8} textAnchor="end" className={`${s.fill} text-[12px] font-semibold`}>
                {pct(cumulative(s, s.to))}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="grid sm:grid-cols-2 gap-3 text-sm">
        {GROWTH.map((s) => (
          <li key={s.label} className="flex gap-2">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.swatch}`} />
            <span>
              <span className="font-semibold">{s.label}</span>
              <span className="block text-ink-2">
                {(s.rate * 100).toFixed(1).replace(/\.0$/, "")}% a year, {s.from}–{s.to}
                {s.forecast ? " (forecast)" : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
