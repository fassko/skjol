import { beforeAll, describe, expect, it } from "vitest";
import { issueSessionToken, readSessionToken, type Session } from "../lib/session";

const session: Session = { address: "0x6518EAD9698ed3dD08845C9103f755D1D1a4cc47", demo: true, exp: Math.floor(Date.now() / 1000) + 3600 };

beforeAll(() => {
  process.env.SESSION_SECRET = `0x${"22".repeat(32)}`;
  process.env.SKJOL_MASTER_KEY = `0x${"11".repeat(32)}`;
  process.env.DEMO_CUSTOMER_ENABLED = "true";
  process.env.DEMO_CUSTOMER_PRIVATE_KEY = `0x${"11".repeat(32)}`;
});

describe("MCP session token", () => {
  it("round-trips a session and rejects a forged or expired token", () => {
    const token = issueSessionToken(session);
    expect(readSessionToken(token)?.address).toBe(session.address);
    expect(readSessionToken(`${token}x`)).toBeNull();
    const [payload] = token.split(".");
    expect(readSessionToken(`${payload}.forged`)).toBeNull();
    const expired = issueSessionToken({ ...session, exp: Math.floor(Date.now() / 1000) - 5 });
    expect(readSessionToken(expired)).toBeNull();
  });
});

describe("freight MCP endpoint", () => {
  it("rejects a bearer token that is not a session", async () => {
    const { handleFreightMcp } = await import("../lib/freight-mcp");
    const res = await handleFreightMcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
  });

  it("lists the freight tools for a valid bearer session", async () => {
    const { handleFreightMcp } = await import("../lib/freight-mcp");
    const headers = {
      authorization: `Bearer ${issueSessionToken(session)}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    const init = await handleFreightMcp(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "vitest", version: "0" } },
        }),
      }),
    );
    expect(init.status).toBe(200);
    const listed = await handleFreightMcp(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { ...headers, "mcp-session-id": init.headers.get("mcp-session-id") ?? "" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      }),
    );
    expect(listed.status).toBe(200);
    const body = await listed.text();
    for (const name of ["discoverServices", "callPaidService", "getQuotes", "buyCover", "approveCover"]) {
      expect(body).toContain(name);
    }
  });
});
