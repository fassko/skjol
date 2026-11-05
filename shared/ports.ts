// Supported destination ports and the arrival-evidence source covering each one.
// Pure TypeScript (no deps) so the Next.js backend, the UI, tests and the CRE workflow share one
// catalogue. The contract does not whitelist sources; it records keccak256(source.id) per report.

export type EvidenceSourceKey = "digitraffic" | "vesselfinder";

export interface EvidenceSourceInfo {
  key: EvidenceSourceKey;
  /** Stable identifier, hashed into the onchain report as `sourceId`. */
  id: string;
  /** Customer-facing provider name. */
  name: string;
  /** "port-authority": official port-call records. "ais": arrivals detected from AIS positions. */
  kind: "port-authority" | "ais";
  /** Plain-language description for customer screens. */
  description: string;
  requiresApiKey: boolean;
}

export const EVIDENCE_SOURCES: Record<EvidenceSourceKey, EvidenceSourceInfo> = {
  digitraffic: {
    key: "digitraffic",
    id: "digitraffic.port-call.v2",
    name: "Fintraffic Digitraffic",
    kind: "port-authority",
    description: "Official Finnish port-call records",
    requiresApiKey: false,
  },
  vesselfinder: {
    key: "vesselfinder",
    id: "vesselfinder.portcalls.v1",
    name: "VesselFinder",
    kind: "ais",
    description: "Port arrivals detected from the vessel's AIS position reports",
    requiresApiKey: true,
  },
};

export type PortCountry = "FI" | "IN";

export const PORT_COUNTRIES: Record<PortCountry, string> = { FI: "Finland", IN: "India" };

export interface PortInfo {
  locode: string;
  name: string;
  country: PortCountry;
  source: EvidenceSourceKey;
}

const fi = (locode: string, name: string): PortInfo => ({ locode, name, country: "FI", source: "digitraffic" });
const india = (locode: string, name: string): PortInfo => ({ locode, name, country: "IN", source: "vesselfinder" });

export const PORTS: PortInfo[] = [
  fi("FIHEL", "Helsinki"),
  fi("FIHKO", "Hanko"),
  fi("FIKOK", "Kokkola"),
  fi("FIKTK", "Kotka"),
  fi("FIHMN", "Hamina"),
  fi("FIOUL", "Oulu"),
  fi("FIPOR", "Pori"),
  fi("FIRAU", "Rauma"),
  fi("FITKU", "Turku"),
  fi("FIVAA", "Vaasa"),
  fi("FINLI", "Naantali"),
  fi("FIKAS", "Kaskinen"),
  fi("FILOV", "Loviisa"),
  fi("FIUKI", "Uusikaupunki"),
  fi("FIINK", "Inkoo"),
  india("INNSA", "Nhava Sheva (JNPA, Navi Mumbai)"),
  india("INBOM", "Mumbai"),
  india("INMUN", "Mundra"),
  india("INPAV", "Pipavav"),
  india("INHZA", "Hazira"),
  india("INIXY", "Kandla (Deendayal)"),
  india("INMAA", "Chennai"),
  india("INKAT", "Kattupalli"),
  india("INCOK", "Kochi"),
  india("INTUT", "Thoothukudi (Tuticorin)"),
  india("INVTZ", "Visakhapatnam"),
  india("INCCU", "Kolkata"),
];

/** UN/LOCODE -> port name, for every supported port. */
export const SUPPORTED_PORTS: Record<string, string> = Object.fromEntries(PORTS.map((p) => [p.locode, p.name]));

export function normaliseLocode(v: string): string {
  return v.replace(/\s+/g, "").toUpperCase();
}

export function portInfo(locode: string): PortInfo | null {
  const l = normaliseLocode(locode);
  return PORTS.find((p) => p.locode === l) ?? null;
}

export function portSource(locode: string): EvidenceSourceInfo | null {
  const p = portInfo(locode);
  return p ? EVIDENCE_SOURCES[p.source] : null;
}
