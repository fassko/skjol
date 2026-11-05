import "server-only";
import { checkSpend, issueApproval, payForResource, recordSpend, requireAgentWallet, spendingStatus, verifyApproval } from "./agent-wallet";
import { issueQuotes, loadOwnedShipment } from "./insurance";
import { loadOwnedQuote, purchaseWithAgentFunds } from "./purchase";
import { HttpError, type Session } from "./session";
import { runSync } from "./sync";
import { listMyShipments } from "./views";
import { PAID_SERVICES, catalog, serviceUrl } from "./x402/services";
import { formatUsdc } from "../shared/products";

// Shared freight-agent actions. The phone chat and the MCP server both call these.
// Spending limits stay in agent-wallet.ts, which runs before anything is signed.

export const ARC_NETWORK = "eip155:5042002";
export const SERVICE_CATEGORIES = ["SOCIAL_INTELLIGENCE", "FINANCIAL_ANALYSIS", "WEB_SEARCH_RESEARCH", "PREDICTION_MARKETS", "CREATIVE", "INFRASTRUCTURE"] as const;

const DISCOVERY_URL = "https://api.circle.com/v2/x402/discovery/resources";

// Resources returned by discovery in the last 30 minutes, per wallet. A payment can only go to
// Skjol's own services or to something the agent actually discovered.
const discovered = new Map<string, Map<string, number>>();
const DISCOVERY_TTL_MS = 30 * 60_000;

function remember(owner: string, urls: string[]) {
  const m = discovered.get(owner) ?? new Map<string, number>();
  const now = Date.now();
  for (const u of urls) m.set(u, now);
  discovered.set(owner, m);
}

async function isKnownResource(owner: string, url: string) {
  if (PAID_SERVICES.some((s) => serviceUrl(s) === url)) return true;
  const seen = discovered.get(owner)?.get(url);
  if (seen && Date.now() - seen < DISCOVERY_TTL_MS) return true;
  // Another server instance may have run the discovery: confirm the listing exists.
  const r = await fetch(`${DISCOVERY_URL}?query=${encodeURIComponent(url)}&limit=5&fields=resource`).catch(() => null);
  const items = r?.ok ? (((await r.json()) as { items?: { resource: string }[] }).items ?? []) : [];
  return items.some((i) => i.resource === url);
}

interface Listing {
  resource: string;
  metadata?: { provider?: { name?: string; category?: string }; description?: string; method?: string; input?: unknown };
  accepts?: { network: string; amount: string; extra?: { name?: string } }[];
}

async function marketplace(q: { query?: string; category?: string; maxUsdPrice?: number }) {
  const u = new URL(DISCOVERY_URL);
  u.searchParams.set("network", ARC_NETWORK);
  u.searchParams.set("supportsCircleGateway", "true");
  u.searchParams.set("siwx", "false");
  u.searchParams.set("type", "http");
  u.searchParams.set("limit", "8");
  if (q.query) u.searchParams.set("query", q.query);
  if (q.category) u.searchParams.set("category", q.category);
  if (q.maxUsdPrice) u.searchParams.set("maxUsdPrice", String(q.maxUsdPrice));
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) return { items: [] as Listing[], error: `Discovery API HTTP ${r.status}` };
  return { items: ((await r.json()) as { items?: Listing[] }).items ?? [] };
}

const summarise = (l: Listing, source: "skjol" | "circle-marketplace") => {
  const arc = l.accepts?.find((a) => a.network === ARC_NETWORK);
  return {
    source,
    resource: l.resource,
    provider: l.metadata?.provider?.name ?? new URL(l.resource).hostname,
    category: l.metadata?.provider?.category ?? null,
    description: (l.metadata?.description ?? "").slice(0, 200),
    method: l.metadata?.method ?? "GET",
    priceUsdc: arc ? formatUsdc(BigInt(arc.amount)) : null,
    rails: [...new Set((l.accepts ?? []).map((a) => (a.network.startsWith("hedera:") ? "hedera" : a.network === ARC_NETWORK ? "arc" : a.network)))],
    input: l.metadata?.input ?? null,
  };
};

function truncate(v: unknown) {
  const s = JSON.stringify(v ?? null);
  return s.length <= 3000 ? v : { truncated: true, preview: s.slice(0, 3000) };
}

export async function spendingSnapshot(session: Session) {
  const s = await spendingStatus(session);
  return {
    perCallMax: formatUsdc(s.limits.perCallMax),
    dailyCap: formatUsdc(s.limits.dailyCap),
    approvalThresholdForCover: formatUsdc(s.limits.approvalThreshold),
    paused: s.limits.paused || s.limits.globalPause,
    preferredRail: s.limits.preferredRail,
    spentLast24h: formatUsdc(s.spentToday),
    remaining: formatUsdc(s.remainingToday),
    unit: "USD stablecoin (USDC; EURC counted 1:1 for limits)",
  };
}

export async function discoverServices(session: Session, q: { query?: string; category?: (typeof SERVICE_CATEGORIES)[number]; maxUsdPrice?: number }) {
  const own = catalog().map((l) => summarise(l as Listing, "skjol"));
  let m = await marketplace(q).catch((e) => ({ items: [] as Listing[], error: (e as Error).message }));
  // The Arc Testnet catalog is small; with no match, show what else is payable on Arc.
  const broadened = !m.items.length && !!(q.query || q.category);
  if (broadened) m = await marketplace({ maxUsdPrice: q.maxUsdPrice }).catch((e) => ({ items: [] as Listing[], error: (e as Error).message }));
  const external = m.items.map((l) => summarise(l, "circle-marketplace"));
  remember(session.address.toLowerCase(), external.map((e) => e.resource));
  return {
    services: [...own, ...external],
    note: broadened ? "No marketplace listing matched the search; showing other services payable on Arc Testnet." : undefined,
    marketplaceError: "error" in m ? m.error : undefined,
  };
}

export async function callPaidService(session: Session, input: { resource: string; params?: Record<string, string>; rail?: "hedera" | "arc-gateway" }) {
  const owner = session.address.toLowerCase();
  if (!(await isKnownResource(owner, input.resource))) return { status: "declined" as const, reason: "Unknown service. Run discoverServices first; the agent only pays listed services." };
  const url = new URL(input.resource);
  for (const [k, v] of Object.entries(input.params ?? {})) url.searchParams.set(k, v);
  const r = await payForResource(session, { url: url.toString(), rail: input.rail });
  return { ...r, data: truncate(r.data) };
}

export async function listShipments(session: Session) {
  return { shipments: (await listMyShipments(session)).slice(0, 10) };
}

export async function getShipment(session: Session, shipmentId: string) {
  const { rec, priv } = await loadOwnedShipment(shipmentId, session);
  const x = priv.extraction as { fields: Record<string, { value: string | null; status: string }>; issues: unknown[] };
  return { shipmentId, status: rec.status, confirmed: priv.confirmed, fields: Object.fromEntries(Object.entries(x.fields).map(([k, v]) => [k, v.value])), issues: x.issues };
}

export async function getQuotes(session: Session, shipmentId: string, currency: "USDC" | "EURC" = "USDC") {
  const r = await issueQuotes(shipmentId, session, { currency });
  return {
    currency: r.currency,
    currencies: r.currencies,
    declined: r.declined,
    offers: r.offers.map((o) => ({ quoteId: o.quoteId, product: o.productName, premium: o.premium, payout: o.payout, currency: o.currency, thresholdHours: o.thresholdHours, buyBefore: o.quoteExpiry, demoOnly: o.demoOnly })),
  };
}

export async function buyCover(session: Session, quoteId: string, approvalToken?: string) {
  const { args, pool } = await loadOwnedQuote(quoteId, session);
  const premium = args.premium;
  const base = { kind: "cover" as const, rail: "arc-onchain" as const, network: ARC_NETWORK, resource: `pool:${pool.pool}`, amountUnits: premium, asset: pool.currency };
  const gate = await checkSpend(session, premium, "cover");
  if (!gate.ok) {
    const rec = await recordSpend(session, { ...base, status: "declined", reason: gate.reason, reference: "" }, "cover_declined");
    return { purchased: false, declined: true, reason: gate.reason, auditUrl: rec.hcsUrl };
  }
  const { limits } = await spendingStatus(session);
  if (premium > limits.approvalThreshold && !verifyApproval(session, quoteId, approvalToken)) {
    return {
      purchased: false,
      needsApproval: true,
      quoteId,
      premium: formatUsdc(premium),
      currency: pool.currency,
      reason: `Premium ${formatUsdc(premium)} ${pool.currency} is above the ${formatUsdc(limits.approvalThreshold)} approval threshold. Ask the customer to approve, then call buyCover again with the approvalToken.`,
    };
  }
  try {
    const r = await purchaseWithAgentFunds(quoteId, session);
    const rec = await recordSpend(session, { ...base, status: "settled", reason: "", reference: r.purchaseTx }, "cover_bought");
    await runSync().catch(() => null);
    return { purchased: true, policyId: r.policyId, premium: formatUsdc(premium), currency: pool.currency, txUrl: r.purchaseTxUrl, auditUrl: rec.hcsUrl, policyUrl: `/policies/${r.policyId}` };
  } catch (e) {
    const reason = (e as Error).message.slice(0, 200);
    const rec = await recordSpend(session, { ...base, status: "failed", reason, reference: "" }, "error");
    return { purchased: false, reason, auditUrl: rec.hcsUrl };
  }
}

/** Human approval for one quote. The chat route and the MCP approval prompt both call this. */
export async function decideCoverApproval(session: Session, quoteId: string, approve: boolean) {
  requireAgentWallet(session);
  if (!/^0x[0-9a-f]{64}$/i.test(quoteId)) throw new HttpError(422, "quoteId is required");
  const { pool, args } = await loadOwnedQuote(quoteId, session);
  if (!approve) {
    await recordSpend(
      session,
      { kind: "cover", rail: "arc-onchain", network: ARC_NETWORK, resource: `pool:${pool.pool}`, amountUnits: args.premium, asset: pool.currency, status: "declined", reason: "Declined by the customer", reference: "" },
      "cover_declined",
    );
    return { approved: false as const };
  }
  return { approved: true as const, approvalToken: issueApproval(session, quoteId), premium: formatUsdc(args.premium), currency: pool.currency };
}

export async function coverApprovalPrompt(session: Session, quoteId: string) {
  const { pool, args } = await loadOwnedQuote(quoteId, session);
  return `Approve buying arrival-delay cover for ${formatUsdc(args.premium)} ${pool.currency}? This spends test stablecoins from the agent wallet. Quote ${quoteId}.`;
}
