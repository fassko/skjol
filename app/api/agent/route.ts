import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { buildAgent } from "@/lib/agent";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!config.aiEnabled()) {
    return NextResponse.json({ error: "AI assistant unavailable (no AI Gateway credentials). Use guided mode." }, { status: 503 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Please connect your wallet first." }, { status: 401 });
  const { messages } = (await req.json()) as { messages: UIMessage[] };
  return createAgentUIStreamResponse({ agent: buildAgent(session), uiMessages: messages });
}
