import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { acceptedContent, inputRequired, inputResponse, type CallToolResult, type InputRequiredResult, type ServerContext } from "@modelcontextprotocol/server";
import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentWallet } from "./agent-wallet";
import { buyCover, callPaidService, coverApprovalPrompt, decideCoverApproval, discoverServices, getQuotes, getShipment, listShipments, SERVICE_CATEGORIES, spendingSnapshot } from "./freight-ops";
import { HttpError, sessionFromRequest, type Session } from "./session";

// MCP surface for the freight agent. The client's model calls the tools; Skjol still
// checks the payee allow-list, spending limits, and cover approval before signing.

const sessions = new AsyncLocalStorage<Session>();

const APPROVE = z.object({
  approve: z.boolean().describe("True only when the person approved this exact purchase"),
});

const INSTRUCTIONS = `You spend TEST stablecoins for a small importer, inside limits they set.
Find paid port data with discoverServices, pay per call with callPaidService, then quote and buy arrival-delay cover.
Premiums above the approval threshold need approveCover. That tool asks the person; it returns an approvalToken only after they accept. Pass that token to buyCover.
Never claim a purchase happened unless buyCover returned purchased: true.
If a payment is declined by a limit, explain which limit and stop.
Shipments must already be confirmed in the Skjol app before getQuotes works.
The cover pays a fixed amount only if the vessel's recorded arrival is later than the threshold. It does not cover unloading, customs, or delivery delays.`;

function currentSession() {
  const s = sessions.getStore();
  if (!s) throw new HttpError(401, "Please sign in first.");
  return s;
}

function text(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    if (e instanceof HttpError) return text({ error: e.message });
    throw e;
  }
}

async function approveCover(session: Session, quoteId: string, ctx: ServerContext): Promise<CallToolResult | InputRequiredResult> {
  let message: string;
  try {
    message = await coverApprovalPrompt(session, quoteId);
  } catch (e) {
    if (e instanceof HttpError) return text({ approved: false, error: e.message });
    throw e;
  }
  const answered = acceptedContent(ctx.mcpReq.inputResponses, "approve", APPROVE);
  if (answered) return text(await decideCoverApproval(session, quoteId, answered.approve));
  const view = inputResponse(ctx.mcpReq.inputResponses, "approve");
  if (view.kind === "elicit") return text(await decideCoverApproval(session, quoteId, false));
  // 2025 clients take a pushed form. 2026 clients reject that and use input_required instead.
  try {
    const result = await ctx.mcpReq.elicitInput({
      mode: "form",
      message,
      requestedSchema: {
        type: "object",
        properties: { approve: { type: "boolean", title: "Approve this purchase", description: "True to buy this cover" } },
        required: ["approve"],
      },
    });
    const approve = result.action === "accept" && result.content?.approve === true;
    return text(await decideCoverApproval(session, quoteId, approve));
  } catch {
    return inputRequired({
      inputRequests: {
        approve: inputRequired.elicit({ message, requestedSchema: APPROVE }),
      },
    });
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "getSpendingStatus",
      { title: "Spending status", description: "Current spending limits, what was spent in the last 24 hours, and what remains.", inputSchema: z.object({}) },
      async () => run(() => spendingSnapshot(currentSession())),
    );
    server.registerTool(
      "discoverServices",
      {
        title: "Discover paid services",
        description: "Find paid x402 data services: Skjol's port-call services plus Circle Agent Marketplace listings payable on Arc.",
        inputSchema: z.object({
          query: z.string().max(80).optional().describe("Free-text search, e.g. shipping or weather"),
          category: z.enum(SERVICE_CATEGORIES).optional(),
          maxUsdPrice: z.number().positive().max(1).optional(),
        }),
      },
      async (q) => run(() => discoverServices(currentSession(), q)),
    );
    server.registerTool(
      "callPaidService",
      {
        title: "Call a paid service",
        description: "Call a service from discoverServices and pay for it (x402), within the spending limits. Pass query parameters as key/value pairs.",
        inputSchema: z.object({
          resource: z.string().url(),
          params: z.record(z.string(), z.string()).optional(),
          rail: z.enum(["hedera", "arc-gateway"]).optional().describe("Payment network; defaults to the user's preference"),
        }),
      },
      async (input) => run(() => callPaidService(currentSession(), input)),
    );
    server.registerTool(
      "listShipments",
      { title: "List shipments", description: "List the customer's uploaded shipments with status.", inputSchema: z.object({}) },
      async () => run(() => listShipments(currentSession())),
    );
    server.registerTool(
      "getShipment",
      {
        title: "Read a shipment",
        description: "Read a shipment's extracted and confirmed details (vessel IMO, destination port, agreed deadline).",
        inputSchema: z.object({ shipmentId: z.string().regex(/^shp_[a-z0-9]+$/) }),
      },
      async ({ shipmentId }) => run(() => getShipment(currentSession(), shipmentId)),
    );
    server.registerTool(
      "getQuotes",
      {
        title: "Quote cover",
        description: "Get signed cover quotes for a shipment already confirmed in the Skjol app, priced by fixed rules, in USDC or EURC.",
        inputSchema: z.object({ shipmentId: z.string(), currency: z.enum(["USDC", "EURC"]).default("USDC") }),
      },
      async ({ shipmentId, currency }) => run(() => getQuotes(currentSession(), shipmentId, currency)),
    );
    server.registerTool(
      "buyCover",
      {
        title: "Buy cover",
        description: "Buy cover for a quote from the agent wallet. Premiums above the approval threshold need an approvalToken from approveCover.",
        inputSchema: z.object({ quoteId: z.string().regex(/^0x[0-9a-f]{64}$/i), approvalToken: z.string().optional() }),
      },
      async ({ quoteId, approvalToken }) => run(() => buyCover(currentSession(), quoteId, approvalToken)),
    );
    server.registerTool(
      "approveCover",
      {
        title: "Approve a cover purchase",
        description: "Ask the person to approve or decline one cover quote. Returns an approvalToken only after they accept. Pass that token to buyCover. Do not tell the person the purchase is done until buyCover returns purchased: true.",
        inputSchema: z.object({ quoteId: z.string().regex(/^0x[0-9a-f]{64}$/i) }),
      },
      async ({ quoteId }, ctx) => approveCover(currentSession(), quoteId, ctx),
    );
  },
  {
    serverInfo: { name: "skjol-freight-agent", version: "0.1.0" },
    instructions: INSTRUCTIONS,
  },
);

export async function handleFreightMcp(req: Request) {
  const session = await sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Please sign in first. Use Authorization: Bearer with the token from /api/mcp/token." }, { status: 401 });
  try {
    requireAgentWallet(session);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return sessions.run(session, () => handler(req));
}
