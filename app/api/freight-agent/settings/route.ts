import { agentBalances, explorerFor, ledger, requireAgentWallet, saveAgentLimits, spendingStatus } from "@/lib/agent-wallet";
import { hederaConfig } from "@/lib/config";
import { hashscanTopicMessage } from "@/lib/hedera";
import { handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { formatUsdc } from "@/shared/products";

async function view() {
  const session = await requireSession();
  requireAgentWallet(session);
  const [status, items, balances] = await Promise.all([
    spendingStatus(session),
    ledger(session),
    agentBalances(session).catch((e) => ({ error: (e as Error).message })),
  ]);
  const topic = hederaConfig.auditTopicId();
  return {
    limits: {
      perCallMax: formatUsdc(status.limits.perCallMax),
      dailyCap: formatUsdc(status.limits.dailyCap),
      approvalThreshold: formatUsdc(status.limits.approvalThreshold),
      paused: status.limits.paused,
      globalPause: status.limits.globalPause,
      preferredRail: status.limits.preferredRail,
    },
    spentToday: formatUsdc(status.spentToday),
    remainingToday: formatUsdc(status.remainingToday),
    balances,
    auditTopic: topic ? { id: topic, url: `${hederaConfig.hashscan}/topic/${topic}` } : null,
    history: items.map((s) => {
      const [topicId, seq] = s.hcs.split("#");
      return {
        spendId: s.spendId,
        at: new Date(s.createdAtSec * 1000).toISOString(),
        kind: s.kind,
        rail: s.rail,
        resource: s.resource,
        amount: formatUsdc(s.amountUnits),
        asset: s.asset,
        status: s.status,
        reason: s.reason,
        reference: s.reference,
        explorerUrl: explorerFor(s.rail, s.reference),
        auditUrl: topicId && seq ? hashscanTopicMessage(topicId, seq) : null,
        arkivKey: s.key ?? null,
      };
    }),
  };
}

export const GET = handle(view);

export const PUT = handle(async (req: Request) => {
  const session = await requireSession();
  requireAgentWallet(session);
  await saveAgentLimits(session, (await req.json()) as Record<string, unknown>);
  return view();
});
