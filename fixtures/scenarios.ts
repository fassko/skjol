// Deterministic demo scenarios. EVERYTHING HERE IS SYNTHETIC unless marked "recorded".
// Vessel names and IMO numbers are fictitious (valid IMO check digit, not real ships).
// Observations use the record shape of the port's live source (Digitraffic v2 visits for Finland,
// VesselFinder port calls for India) so the same normalisers and assessment code run on replay and
// live data. Timestamps are fixed and never rewritten; the demo clock moves, the evidence does not.
import {
  normaliseDigitrafficVisit,
  normaliseVesselFinderRows,
  type ArrivalEvidence,
  type DigitrafficVisit,
  type EvidenceOrigin,
  type VesselFinderRow,
} from "../shared/evidence";
import type { ConfirmedShipment, ProductId } from "../shared/products";

export interface ReplayObservation {
  /** Original retrieval time of this observation (kept as-is when the demo clock advances). */
  retrievedAt: string;
  /** Digitraffic-shaped records (Finnish ports). */
  visits?: DigitrafficVisit[];
  /** VesselFinder-shaped records (Indian ports). */
  portCalls?: VesselFinderRow[];
}

export interface DemoScenario {
  id: "on-time" | "late" | "missing-stale" | "duplicate" | "conflicting" | "mumbai-late";
  title: string;
  expected: string;
  document: string; // file in fixtures/documents
  shipment: ConfirmedShipment;
  productId: ProductId;
  /** Demo clock values (ISO) at which the evaluator runs, in order. */
  evaluateAt: string[];
  observations: ReplayObservation[];
  label: "synthetic";
}

/** Local demo chain starts here (anvil is warped to this time). */
export const DEMO_EPOCH = "2026-12-01T00:00:00Z";
const DEADLINE = "2026-12-10T12:00:00Z";
const DEPARTURE = "2026-12-02T08:00:00Z";

export const SCENARIOS: DemoScenario[] = [
  {
    id: "on-time",
    title: "Vessel arrives before the deadline",
    expected: "Policy closes with no payout; reserved collateral is released.",
    document: "bl-baltic-wren.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "BALTIC WREN",
      vesselImo: "9700017",
      vesselMmsi: "230990001",
      voyageRef: "BW-2648E",
      originPort: "Rotterdam (NLRTM)",
      destinationLocode: "FIHEL",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    evaluateAt: ["2026-12-10T07:30:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-10T07:00:00Z",
        visits: [
          {
            visitId: "SYN-FIHEL-0001",
            vesselId: "9700017",
            vesselName: "BALTIC WREN",
            mmsi: "230990001",
            portOfCall: "FIHEL",
            portName: "Helsinki (Helsingfors)",
            eta: "2026-12-10T06:00:00.000Z",
            ata: "2026-12-10T06:15:00.000Z",
            status: "Arrived",
            updateTime: "2026-12-10T06:20:00.000Z",
          },
        ],
      },
    ],
  },
  {
    id: "late",
    title: "Vessel arrives more than 24 hours late",
    expected: "Fixed payout is sent to the policyholder.",
    document: "bl-nordic-tern.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "NORDIC TERN",
      vesselImo: "9700029",
      vesselMmsi: "230990002",
      voyageRef: "NT-0912N",
      originPort: "Hamburg (DEHAM)",
      destinationLocode: "FIKTK",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    evaluateAt: ["2026-12-11T19:30:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-11T19:00:00Z",
        visits: [
          {
            visitId: "SYN-FIKTK-0002",
            vesselId: "9700029",
            vesselName: "NORDIC TERN",
            mmsi: "230990002",
            portOfCall: "FIKTK",
            portName: "Kotka",
            eta: "2026-12-11T17:00:00.000Z",
            ata: "2026-12-11T18:40:00.000Z",
            status: "Arrived",
            updateTime: "2026-12-11T18:45:00.000Z",
          },
        ],
      },
    ],
  },
  {
    id: "missing-stale",
    title: "No arrival recorded, then the data goes stale",
    expected: "Policy stays pending at both checks; nothing is closed or paid.",
    document: "bl-aurora-skerry.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "AURORA SKERRY",
      vesselImo: "9700031",
      vesselMmsi: "230990003",
      voyageRef: "AS-7731W",
      originPort: "Gdansk (PLGDN)",
      destinationLocode: "FITKU",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    // First check: data is fresh but no arrival yet. Second: clock advanced, no newer data.
    evaluateAt: ["2026-12-11T15:00:00Z", "2026-12-12T23:00:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-11T14:00:00Z",
        visits: [
          {
            visitId: "SYN-FITKU-0003",
            vesselId: "9700031",
            vesselName: "AURORA SKERRY",
            mmsi: "230990003",
            portOfCall: "FITKU",
            portName: "Turku (Åbo)",
            eta: "2026-12-12T09:00:00.000Z",
            status: "Expected to Arrive",
            updateTime: "2026-12-11T13:10:00.000Z",
          },
        ],
      },
    ],
  },
  {
    id: "duplicate",
    title: "Late arrival evaluated twice",
    expected: "First report pays; the second is recorded and ignored — no second payout.",
    document: "bl-kestrel-bay.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "KESTREL BAY",
      vesselImo: "9700043",
      vesselMmsi: "230990004",
      voyageRef: "KB-5520S",
      originPort: "Antwerp (BEANR)",
      destinationLocode: "FIRAU",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    evaluateAt: ["2026-12-12T03:30:00Z", "2026-12-12T03:40:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-12T03:20:00Z",
        visits: [
          {
            visitId: "SYN-FIRAU-0004",
            vesselId: "9700043",
            vesselName: "KESTREL BAY",
            mmsi: "230990004",
            portOfCall: "FIRAU",
            portName: "Rauma (Raumo)",
            eta: "2026-12-11T22:00:00.000Z",
            ata: "2026-12-12T03:00:00.000Z",
            status: "Arrived",
            updateTime: "2026-12-12T03:05:00.000Z",
          },
        ],
      },
    ],
  },
  {
    id: "conflicting",
    title: "Source reports an arrival time but says the vessel is still expected",
    expected: "Policy stays pending with a conflict flag; no report is submitted.",
    document: "bl-baltic-wren.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "BALTIC WREN",
      vesselImo: "9700017",
      vesselMmsi: "230990001",
      voyageRef: "BW-2648E-B",
      originPort: "Rotterdam (NLRTM)",
      destinationLocode: "FIHEL",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    evaluateAt: ["2026-12-11T20:00:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-11T19:30:00Z",
        visits: [
          {
            visitId: "SYN-FIHEL-0005",
            vesselId: "9700017",
            vesselName: "BALTIC WREN",
            portOfCall: "FIHEL",
            eta: "2026-12-11T12:00:00.000Z",
            ata: "2026-12-11T14:00:00.000Z",
            status: "Expected to Arrive",
            updateTime: "2026-12-11T19:00:00.000Z",
          },
        ],
      },
    ],
  },
  {
    id: "mumbai-late",
    title: "Vessel reaches Nhava Sheva (Mumbai) more than 24 hours late",
    expected: "Pending while no arrival is recorded, then a fixed payout once the late arrival is recorded.",
    document: "bl-indus-heron.txt",
    productId: "delay-standard-24h",
    label: "synthetic",
    shipment: {
      vesselName: "INDUS HERON",
      vesselImo: "9700055",
      vesselMmsi: "419990005",
      voyageRef: "IH-118W",
      originPort: "Jebel Ali (AEJEA)",
      destinationLocode: "INNSA",
      departureDate: DEPARTURE,
      agreedArrivalDeadline: DEADLINE,
    },
    // VesselFinder is queried by IMO, so events at other ports come back too and must be ignored.
    evaluateAt: ["2026-12-11T09:30:00Z", "2026-12-12T08:30:00Z"],
    observations: [
      {
        retrievedAt: "2026-12-11T09:00:00Z",
        portCalls: [
          { PORTCALL: { MMSI: 419990005, IMO: 9700055, LOCODE: "AEJEA", EVENT: "DEPARTURE", TIMESTAMP: "2026-12-02 08:40:00 UTC", PORT: "Jebel Ali", COUNTRY: "United Arab Emirates" } },
        ],
      },
      {
        retrievedAt: "2026-12-12T08:00:00Z",
        portCalls: [
          { PORTCALL: { MMSI: 419990005, IMO: 9700055, LOCODE: "AEJEA", EVENT: "DEPARTURE", TIMESTAMP: "2026-12-02 08:40:00 UTC", PORT: "Jebel Ali", COUNTRY: "United Arab Emirates" } },
          { PORTCALL: { MMSI: 419990005, IMO: 9700055, LOCODE: "INNSA", EVENT: "ARRIVAL", TIMESTAMP: "2026-12-12 06:10:00 UTC", PORT: "Nhava Sheva", COUNTRY: "India" } },
        ],
      },
    ],
  },
];

/** Latest observation retrieved at or before the given demo clock (replay never peeks ahead). */
export function observationAt(s: DemoScenario, clockIso: string): ReplayObservation | null {
  const t = Date.parse(clockIso);
  const visible = s.observations.filter((o) => Date.parse(o.retrievedAt) <= t);
  return visible.length ? visible[visible.length - 1] : null;
}

/** Normalised evidence of one replay observation, keeping its original retrieval time. */
export function observationEvidence(o: ReplayObservation, origin: EvidenceOrigin): ArrivalEvidence[] {
  return [
    ...(o.visits ?? []).map((v) => normaliseDigitrafficVisit(v, o.retrievedAt, origin)),
    ...normaliseVesselFinderRows(o.portCalls ?? [], o.retrievedAt, origin),
  ];
}
