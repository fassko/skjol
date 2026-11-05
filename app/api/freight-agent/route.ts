import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildFreightAgent } from "@/lib/freight-agent";
import { config } from "@/lib/config";
import { HttpError, getSession } from "@/lib/session";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!config.aiEnabled()) return NextResponse.json({ error: "AI agent unavailable (no AI Gateway credentials)." }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please sign in with the demo wallet first." }, { status: 401 });
  try {
    const { messages } = (await req.json()) as { messages: UIMessage[] };
    return createAgentUIStreamResponse({ agent: buildFreightAgent(session), uiMessages: messages });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
