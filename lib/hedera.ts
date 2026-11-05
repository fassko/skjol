import "server-only";
import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { createClientHederaSigner } from "@x402/hedera";
import { hederaConfig } from "./config";

// Hedera testnet: the agent's x402 payer account and its HCS audit topic.

/** Parse a key from the Hedera portal: 0x-hex ECDSA (preferred), or DER-encoded ECDSA/ED25519. */
export function parseHederaKey(raw: string): PrivateKey {
  const k = raw.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(k)) return PrivateKey.fromStringECDSA(k);
  return PrivateKey.fromStringDer(k);
}

export function hederaAgentSigner() {
  const id = hederaConfig.agentAccountId();
  const key = hederaConfig.agentPrivateKey();
  if (!id || !key) return null;
  return createClientHederaSigner(id, parseHederaKey(key), { network: "hedera:testnet" });
}

let _client: Client | null = null;
function operatorClient() {
  const id = hederaConfig.agentAccountId();
  const key = hederaConfig.agentPrivateKey();
  if (!id || !key) return null;
  _client ??= Client.forTestnet().setOperator(AccountId.fromString(id), parseHederaKey(key));
  return _client;
}

export function hashscanTx(transactionId: string) {
  // HashScan expects 0.0.x-seconds-nanos rather than the SDK's 0.0.x@seconds.nanos form.
  const id = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `${hederaConfig.hashscan}/transaction/${id}`;
}

export function hashscanTopicMessage(topicId: string, sequence: string) {
  return `${hederaConfig.hashscan}/topic/${topicId}/message/${sequence}`;
}

export interface AuditEvent {
  type: "discovered" | "paid" | "declined" | "quoted" | "cover_bought" | "cover_needs_approval" | "cover_declined" | "error";
  agent: string; // blind owner tag, never the wallet address
  detail: Record<string, string | number | boolean | null>;
}

/**
 * Append one agent decision to the HCS audit topic. Never throws: auditing must not block the
 * agent, so failures come back as `{ logged: false }` and are recorded in the Arkiv ledger instead.
 */
export async function hcsLog(e: AuditEvent): Promise<{ logged: boolean; ref: string; url: string | null; error?: string }> {
  const topicId = hederaConfig.auditTopicId();
  const client = operatorClient();
  if (!topicId || !client) return { logged: false, ref: "", url: null, error: "HCS audit topic not configured" };
  try {
    const message = JSON.stringify({ v: 1, app: "skjol-freight-agent", at: new Date().toISOString(), ...e }).slice(0, 1024);
    const resp = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
    const receipt = await resp.getReceipt(client);
    const seq = receipt.topicSequenceNumber?.toString() ?? "";
    return { logged: true, ref: `${topicId}#${seq}`, url: seq ? hashscanTopicMessage(topicId, seq) : null };
  } catch (err) {
    return { logged: false, ref: "", url: null, error: (err as Error).message.slice(0, 200) };
  }
}
