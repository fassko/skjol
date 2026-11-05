import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/lib/session";
import { delayRisk, parseVesselQuery } from "@/lib/vessel-data";
import { paidRoute } from "@/lib/x402/server";
import { serviceByPath } from "@/lib/x402/services";

export const maxDuration = 60;

const service = serviceByPath("/api/paid/delay-risk")!;

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  try {
    const { imo, port, deadline } = parseVesselQuery(new URL(req.url));
    return NextResponse.json(await delayRisk(imo, port, deadline));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const GET = paidRoute(service, handler);
