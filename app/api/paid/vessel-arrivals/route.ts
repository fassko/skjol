import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/lib/session";
import { parseVesselQuery, vesselArrivals } from "@/lib/vessel-data";
import { paidRoute } from "@/lib/x402/server";
import { serviceByPath } from "@/lib/x402/services";

export const maxDuration = 60;

const service = serviceByPath("/api/paid/vessel-arrivals")!;

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  try {
    const { imo, port } = parseVesselQuery(new URL(req.url));
    const a = await vesselArrivals(imo, port);
    if (a.error) return NextResponse.json({ error: `Port-call source unavailable: ${a.error}` }, { status: 502 });
    return NextResponse.json({
      vesselImo: imo,
      port,
      portName: a.portName,
      origin: a.origin,
      source: a.fetchedFrom.startsWith("replay:") ? a.fetchedFrom : a.source,
      records: a.records.map((r) => ({
        vesselName: r.vesselName,
        eventTimestamp: r.eventTimestamp,
        latestEta: r.latestEta,
        sourceStatus: r.sourceStatus,
        sourceUpdatedAt: r.sourceUpdatedAt,
        digest: r.digest,
      })),
    });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// Unpaid requests get a 402 with both payment rails; invalid input is rejected before settlement.
export const GET = paidRoute(service, handler);
