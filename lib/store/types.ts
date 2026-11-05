// Application records. Arkiv is the primary database; these are the decoded shapes.
// Fields named `sealed*` are AES-GCM envelopes (decrypted server-side only).

export type ShipmentStatus = "extracted" | "confirmed" | "quoted" | "insured";
export type DataLabel = "customer" | "synthetic";

export interface ShipmentRecord {
  key?: string;
  shipmentId: string;
  ownerTag: string; // blind tag of the owner wallet
  status: ShipmentStatus;
  dataLabel: DataLabel;
  createdAtSec: number;
  sealed: Uint8Array; // ShipmentPrivate
}

export interface QuoteRecord {
  key?: string;
  quoteId: string;
  shipmentTag: string;
  policyId: string;
  productId: string;
  premiumUnits: bigint;
  payoutUnits: bigint;
  deadlineSec: number;
  thresholdSec: number;
  quoteExpirySec: number;
  termsHash: string;
  chainId: number;
  pool: string;
  sealed: Uint8Array; // QuotePrivate
}

export type PolicyStatus = "active" | "paid_out" | "closed_no_payout" | "resolved_by_review";

export interface PolicyRecord {
  key?: string;
  policyId: string;
  status: PolicyStatus;
  ownerTag: string;
  shipmentTag: string;
  productId: string;
  vesselImo: number;
  portLocode: string;
  deadlineSec: number;
  thresholdSec: number;
  premiumUnits: bigint;
  payoutUnits: bigint;
  chainId: number;
  pool: string;
  purchaseTx: string;
  settlementTx: string; // "" until settled
  recordedArrivalSec: number; // 0 until known
  lastEvaluation: string; // assessment status or ""
  expiresAtBlock?: bigint;
  sealed: Uint8Array; // PolicyPrivate
}

export interface ObservationRecord {
  key?: string;
  observationId: string;
  policyId: string;
  digest: string;
  source: string;
  origin: "live" | "recorded" | "synthetic";
  vesselImo: number;
  portLocode: string;
  eventTimeSec: number; // 0 when no arrival recorded
  retrievedAtSec: number;
  sourceStatus: string;
  record: string; // canonical ArrivalEvidence JSON (public port-call data, no customer data)
}

export interface EvaluationRecord {
  key?: string;
  evaluationId: string;
  policyId: string;
  status: string; // AssessmentStatus
  runner: "local-relay" | "cre-simulation" | "cre-deployed" | "app-preview";
  clockSec: number;
  clockIsDemo: boolean;
  observationId: string;
  reportTx: string;
  sealed: Uint8Array; // EvaluationPrivate (reasons + explanation)
}

export type ChainEventKind =
  | "PolicyPurchased"
  | "EvidenceAccepted"
  | "PolicyPaidOut"
  | "PolicyClosedNoPayout"
  | "PolicyResolvedByReview"
  | "DuplicateReportIgnored"
  | "ReserveReleased"
  | "PoolFunded";

export interface ChainEventRecord {
  key?: string;
  eventId: string; // `${chainId}:${txHash}:${logIndex}`
  kind: ChainEventKind;
  policyId: string; // "" for pool-level events
  chainId: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
  amountUnits: bigint;
  data: string; // small JSON of decoded args (public chain data)
}

export interface ShipmentPrivate {
  owner: string;
  fileName: string;
  document: { mode: string; reference: string; sha256: string; size: number };
  extraction: unknown;
  confirmed: unknown | null;
}

export interface QuotePrivate {
  beneficiary: string;
  message: Record<string, string | number>;
  signature: string;
  terms: string;
}

export interface PolicyPrivate {
  shipmentId: string;
  beneficiary: string;
  vesselName: string;
  voyageRef: string;
  terms: string;
}

export interface EvaluationPrivate {
  reasons: string[];
  explanation: string;
  explanationSource: "ai" | "rules";
  latestEta: string | null;
  preview: { arrivalTime: number; delaySec: number; payoutEligible: boolean } | null;
}

export interface AppStore {
  readonly backend: "arkiv" | "memory";
  putShipment(r: ShipmentRecord): Promise<ShipmentRecord>;
  getShipment(shipmentId: string): Promise<ShipmentRecord | null>;
  updateShipment(r: ShipmentRecord, set: Partial<Pick<ShipmentRecord, "status" | "sealed">>): Promise<void>;
  listShipmentsByOwner(ownerTag: string): Promise<ShipmentRecord[]>;

  putQuote(r: QuoteRecord): Promise<QuoteRecord>;
  getQuote(quoteId: string): Promise<QuoteRecord | null>;
  getQuoteByPolicy(policyId: string): Promise<QuoteRecord | null>;

  getPolicy(policyId: string): Promise<PolicyRecord | null>;
  upsertPolicy(r: PolicyRecord): Promise<PolicyRecord>;
  listPolicies(filter: { ownerTag?: string; limit?: number }): Promise<PolicyRecord[]>;

  putObservation(r: ObservationRecord): Promise<{ record: ObservationRecord; created: boolean }>;
  listObservations(policyId: string): Promise<ObservationRecord[]>;
  listSyntheticObservations(vesselImo: number, portLocode: string): Promise<ObservationRecord[]>;

  putEvaluation(r: EvaluationRecord): Promise<EvaluationRecord>;
  listEvaluations(policyId: string): Promise<EvaluationRecord[]>;

  putChainEvent(r: ChainEventRecord): Promise<{ record: ChainEventRecord; created: boolean }>;
  hasChainEvent(eventId: string): Promise<boolean>;
  listChainEvents(filter: { policyId?: string; limit?: number }): Promise<ChainEventRecord[]>;
  latestChainEventBlock(chainId: number): Promise<bigint | null>;

  getSyncCursor(chainId: number, pool: string): Promise<bigint | null>;
  setSyncCursor(chainId: number, pool: string, block: bigint): Promise<void>;

  extendExpiring(withinBlocks: bigint): Promise<number>;
}
