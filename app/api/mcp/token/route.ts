import { requireAgentWallet } from "@/lib/agent-wallet";
import { handle } from "@/lib/http";
import { issueSessionToken, requireSession } from "@/lib/session";

// The browser session cookie is httpOnly. This hands the same HMAC token to a signed-in
// person so they can put it on an MCP client. It expires with the sign-in (12 hours).
export const GET = handle(async () => {
  const session = await requireSession();
  requireAgentWallet(session);
  return { token: issueSessionToken(session), expiresAt: new Date(session.exp * 1000).toISOString(), url: "/api/mcp" };
});
