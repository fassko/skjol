// In-memory store for unit tests ONLY (never used by the running app on Vercel).
import type {
  AgentSettingsRecord,
  AgentSpendRecord,
  AppStore,
  ChainEventRecord,
  EvaluationRecord,
  ObservationRecord,
  PolicyRecord,
  QuoteRecord,
  ShipmentRecord,
} from "./types";

export class MemoryStore implements AppStore {
  readonly backend = "memory" as const;
  shipments = new Map<string, ShipmentRecord>();
  quotes = new Map<string, QuoteRecord>();
  policies = new Map<string, PolicyRecord>();
  observations = new Map<string, ObservationRecord>();
  evaluations: EvaluationRecord[] = [];
  events = new Map<string, ChainEventRecord>();
  /** Inject failures to exercise retry paths. */
  failNextChainEventWrites = 0;
  private seq = 0;
  private k = () => `mem-${++this.seq}`;

  async putShipment(r: ShipmentRecord) {
    const rec = { ...r, key: this.k() };
    this.shipments.set(r.shipmentId, rec);
    return rec;
  }
  async getShipment(id: string) {
    return this.shipments.get(id) ?? null;
  }
  async updateShipment(r: ShipmentRecord, set: Partial<Pick<ShipmentRecord, "status" | "sealed">>) {
    const cur = this.shipments.get(r.shipmentId);
    if (cur) this.shipments.set(r.shipmentId, { ...cur, ...set });
  }
  async listShipmentsByOwner(tag: string) {
    return [...this.shipments.values()].filter((s) => s.ownerTag === tag);
  }
  async putQuote(r: QuoteRecord) {
    const rec = { ...r, key: this.k() };
    this.quotes.set(r.quoteId, rec);
    return rec;
  }
  async getQuote(id: string) {
    return this.quotes.get(id) ?? null;
  }
  async getQuoteByPolicy(policyId: string) {
    return [...this.quotes.values()].filter((q) => q.policyId === policyId).sort((a, b) => b.quoteExpirySec - a.quoteExpirySec)[0] ?? null;
  }
  async getPolicy(id: string) {
    return this.policies.get(id) ?? null;
  }
  async upsertPolicy(r: PolicyRecord) {
    const rec = { ...r, key: this.policies.get(r.policyId)?.key ?? this.k() };
    this.policies.set(r.policyId, rec);
    return rec;
  }
  async listPolicies(f: { ownerTag?: string; limit?: number }) {
    return [...this.policies.values()].filter((p) => !f.ownerTag || p.ownerTag === f.ownerTag).slice(0, f.limit ?? 50);
  }
  async putObservation(r: ObservationRecord) {
    const cur = this.observations.get(r.observationId);
    if (cur) return { record: cur, created: false };
    const rec = { ...r, key: this.k() };
    this.observations.set(r.observationId, rec);
    return { record: rec, created: true };
  }
  async listObservations(policyId: string) {
    return [...this.observations.values()].filter((o) => o.policyId === policyId);
  }
  async listSyntheticObservations(imo: number, port: string) {
    return [...this.observations.values()].filter((o) => o.origin === "synthetic" && o.vesselImo === imo && o.portLocode === port);
  }
  async putEvaluation(r: EvaluationRecord) {
    const rec = { ...r, key: this.k() };
    this.evaluations.push(rec);
    return rec;
  }
  async listEvaluations(policyId: string) {
    return this.evaluations.filter((e) => e.policyId === policyId);
  }
  async hasChainEvent(id: string) {
    return this.events.has(id);
  }
  async putChainEvent(r: ChainEventRecord) {
    if (this.failNextChainEventWrites > 0) {
      this.failNextChainEventWrites--;
      throw new Error("injected Arkiv write failure");
    }
    const cur = this.events.get(r.eventId);
    if (cur) return { record: cur, created: false };
    const rec = { ...r, key: this.k() };
    this.events.set(r.eventId, rec);
    return { record: rec, created: true };
  }
  async listChainEvents(f: { policyId?: string; limit?: number }) {
    return [...this.events.values()]
      .filter((e) => !f.policyId || e.policyId === f.policyId)
      .sort((a, b) => Number(b.blockNumber - a.blockNumber))
      .slice(0, f.limit ?? 100);
  }
  async latestChainEventBlock(chainId: number) {
    const blocks = [...this.events.values()].filter((e) => e.chainId === chainId).map((e) => e.blockNumber);
    return blocks.length ? blocks.reduce((a, b) => (a > b ? a : b)) : null;
  }
  cursors = new Map<string, bigint>();
  async getSyncCursor(chainId: number, pool: string) {
    return this.cursors.get(`${chainId}:${pool.toLowerCase()}`) ?? null;
  }
  async setSyncCursor(chainId: number, pool: string, block: bigint) {
    this.cursors.set(`${chainId}:${pool.toLowerCase()}`, block);
  }
  async listActivePoliciesExpiring() {
    return [];
  }
  async retainPolicyTrail() {
    return 0;
  }
  spends: AgentSpendRecord[] = [];
  settings = new Map<string, AgentSettingsRecord>();
  async putAgentSpend(r: AgentSpendRecord) {
    const rec = { ...r, key: this.k() };
    this.spends.push(rec);
    return rec;
  }
  async listAgentSpends(f: { ownerTag: string; sinceSec?: number; limit?: number }) {
    return this.spends
      .filter((s) => s.ownerTag === f.ownerTag && s.createdAtSec >= (f.sinceSec ?? 0))
      .sort((a, b) => b.createdAtSec - a.createdAtSec)
      .slice(0, f.limit ?? 100);
  }
  async getAgentSettings(ownerTag: string) {
    return this.settings.get(ownerTag) ?? null;
  }
  async putAgentSettings(r: AgentSettingsRecord) {
    const rec = { ...r, key: this.settings.get(r.ownerTag)?.key ?? this.k() };
    this.settings.set(r.ownerTag, rec);
    return rec;
  }
}
