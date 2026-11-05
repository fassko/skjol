"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmTool } from "../components/assistant";
import { api, fmtDate, short } from "../components/api";
import { ConnectStep, SampleChoices, type UploadResult } from "../components/cover-steps";
import { Markdown } from "../components/markdown";
import { useSession } from "../components/session";
import { ErrorNote, ExtLink, Spinner } from "../components/ui";

// Mobile-first page for the Skjol Freight Agent: chat on one tab, wallet, limits and purchase
// history on the other. Every payment the agent makes shows up as a receipt in the chat.

interface WalletView {
  limits: { perCallMax: string; dailyCap: string; approvalThreshold: string; paused: boolean; globalPause: boolean; preferredRail: "hedera" | "arc-gateway" };
  spentToday: string;
  remainingToday: string;
  balances: { walletUsdc: string | null; gatewayAvailable: string | null; hederaEnabled: boolean; hederaAccount: string | null } | { error: string };
  auditTopic: { id: string; url: string } | null;
  history: {
    spendId: string; at: string; kind: string; rail: string; resource: string; amount: string; asset: string; status: string; reason: string;
    reference: string; explorerUrl: string | null; auditUrl: string | null; arkivKey: string | null;
  }[];
}

const PROMPTS = [
  "What paid shipping data can you find?",
  "Check the delay risk for my shipments and cover anything risky.",
  "Get EURC quotes for my latest confirmed shipment.",
  "How much have you spent today?",
];

export function FreightAgent({ aiEnabled }: { aiEnabled: boolean }) {
  const { session, loading } = useSession();
  const [tab, setTab] = useState<"chat" | "wallet">("chat");
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    api<WalletView>("/api/freight-agent/settings").then(setWallet).catch((e) => setWalletError(e.message));
  }, []);
  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  if (loading) return <Spinner label="Loading…" />;
  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">Freight agent</h1>
        <p className="text-sm text-ink-2 mt-1">An AI agent that pays for port data per call and buys delay cover for you, inside limits you set. Test funds only.</p>
      </div>
      {!session ? (
        <div className="card p-4">
          <ConnectStep />
        </div>
      ) : !aiEnabled ? (
        <ErrorNote error="The AI agent is not configured on this deployment (no AI Gateway credentials)." />
      ) : (
        <>
          <WalletStrip wallet={wallet} onOpen={() => setTab("wallet")} />
          <div className="inline-flex rounded-full border border-line bg-[#fffdf8] p-1 text-sm">
            <button className={`px-4 py-1 rounded-full ${tab === "chat" ? "bg-ink text-paper" : ""}`} onClick={() => setTab("chat")}>
              Agent
            </button>
            <button className={`px-4 py-1 rounded-full ${tab === "wallet" ? "bg-ink text-paper" : ""}`} onClick={() => { setTab("wallet"); refresh(); }}>
              Wallet & limits
            </button>
          </div>
          <div className={tab === "chat" ? "" : "hidden"}>
            <AgentChat onSpend={refresh} />
          </div>
          {tab === "wallet" && <WalletPanel wallet={wallet} error={walletError} onChange={setWallet} refresh={refresh} />}
        </>
      )}
    </div>
  );
}

function WalletStrip({ wallet, onOpen }: { wallet: WalletView | null; onOpen: () => void }) {
  if (!wallet) return <div className="card px-4 py-3 text-xs text-muted">Loading wallet…</div>;
  const paused = wallet.limits.paused || wallet.limits.globalPause;
  return (
    <button onClick={onOpen} className="card w-full px-4 py-3 text-left flex items-center justify-between gap-3">
      <div className="text-xs">
        <div className="text-muted">Spent today</div>
        <div className="font-semibold text-base">
          {wallet.spentToday} <span className="text-xs text-muted">of {wallet.limits.dailyCap}</span>
        </div>
      </div>
      <div className="text-xs text-right">
        <div className="text-muted">Pays with</div>
        <div className="font-semibold">{wallet.limits.preferredRail === "hedera" ? "Hedera USDC" : "Arc nanopayments"}</div>
      </div>
      <span className={`tag ${paused ? "text-bad" : "text-ok"}`}>{paused ? "Paused" : "Active"}</span>
    </button>
  );
}

function AgentChat({ onSpend }: { onSpend: () => void }) {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { messages, setMessages, sendMessage, addToolOutput, status, error, clearError, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/freight-agent" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: onSpend,
  });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  const busy = status === "submitted" || status === "streaming";

  function clearMessages() {
    if (busy) stop();
    setMessages([]);
    clearError();
    setUploadError(null);
    setInput("");
  }

  async function sample(name: string) {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`/samples/${name}`);
      const fd = new FormData();
      fd.set("file", new File([await res.blob()], name, { type: "text/plain" }));
      fd.set("synthetic", "true");
      const r = await api<UploadResult>("/api/shipments", { method: "POST", body: fd });
      sendMessage({ text: `I added a shipment from "${name}" (synthetic sample). Shipment id: ${r.shipmentId}` });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card flex flex-col h-[68vh] min-h-[460px]">
      {messages.length > 0 && (
        <div className="flex items-center justify-end border-b border-line px-3 py-2">
          <button type="button" className="btn btn-ghost !py-1 !px-3 !text-xs" onClick={clearMessages}>
            Clear messages
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-ink-2 space-y-3">
            <p>Ask me to find shipping data, check a vessel&rsquo;s delay risk or cover a shipment. Small data calls are paid automatically; bigger cover purchases wait for your tap.</p>
            <div className="flex flex-col gap-2">
              {PROMPTS.map((p) => (
                <button key={p} className="btn btn-ghost !justify-start !text-left !py-2 !text-xs" disabled={busy} onClick={() => sendMessage({ text: p })}>
                  {p}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted pt-2">No shipment yet? Add a synthetic sample:</p>
            <SampleChoices disabled={uploading || busy} onPick={sample} />
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "bg-ink text-paper rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] text-sm" : "space-y-2 text-sm max-w-full"}>
              {m.parts.map((p: any, i: number) => {
                if (p.type === "text")
                  return m.role === "user" ? (
                    <p key={i} className="whitespace-pre-wrap leading-relaxed">{p.text}</p>
                  ) : (
                    <Markdown key={i} text={p.text} />
                  );
                if (p.type === "tool-requestConfirmation") return <ConfirmTool key={i} part={p} addToolOutput={addToolOutput} />;
                if (p.type === "tool-requestApproval") return <ApprovalTool key={i} part={p} addToolOutput={addToolOutput} />;
                if (p.type === "tool-callPaidService") return <PaidCallChip key={i} part={p} />;
                if (p.type === "tool-buyCover") return <CoverChip key={i} part={p} />;
                if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                  const name = p.type.slice(5);
                  return (
                    <div key={i} className="text-xs text-muted mono">
                      {p.state === "output-available" ? "✓" : p.state === "output-error" ? "✗" : "…"} {TOOL_LABELS[name] ?? name}
                      {p.state === "output-error" && <span className="text-bad"> — {p.errorText}</span>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {busy && <Spinner label="Working…" />}
        <ErrorNote error={error?.message} />
        <ErrorNote error={uploadError} />
        <div ref={end} />
      </div>
      <form
        className="border-t border-line p-3 flex gap-2 items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
      >
        <input className="input" placeholder="Tell the agent what to do…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  getSpendingStatus: "Checked spending limits",
  discoverServices: "Searched the Circle Agent Marketplace",
  listShipments: "Listed your shipments",
  getShipment: "Read shipment details",
  getQuotes: "Prepared quotes",
};

const RAIL_LABEL: Record<string, string> = { hedera: "Hedera USDC", "arc-gateway": "Arc nanopayment", "arc-onchain": "Arc" };

function PaidCallChip({ part }: { part: any }) {
  if (part.state !== "output-available") return <Spinner label="Paying for a data call…" />;
  const o = part.output ?? {};
  const pay = o.payment ?? {};
  const host = (() => {
    try {
      return new URL(part.input?.resource).pathname;
    } catch {
      return part.input?.resource;
    }
  })();
  const tone = o.status === "settled" ? "border-ok/40 bg-[#e3f1e5]" : o.status === "declined" ? "border-warn/40 bg-[#fbf0dc]" : "border-bad/30 bg-[#fde8e6]";
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-0.5 ${tone}`}>
      <div className="font-semibold">
        {o.status === "settled" ? `Paid ${pay.amount} ${pay.asset} · ${RAIL_LABEL[pay.rail] ?? pay.rail}` : o.status === "declined" ? "Payment declined by your limits" : "Paid call failed"}
      </div>
      <div className="mono text-ink-2 truncate">{host}</div>
      {o.reason && <div className="text-ink-2">{o.reason}</div>}
      <div className="flex gap-3">
        {pay.explorerUrl && <ExtLink href={pay.explorerUrl}>settlement</ExtLink>}
        {!pay.explorerUrl && pay.reference && <span className="mono">ref {short(pay.reference, 8)}</span>}
        {pay.auditUrl && <ExtLink href={pay.auditUrl}>HCS audit</ExtLink>}
      </div>
    </div>
  );
}

function CoverChip({ part }: { part: any }) {
  if (part.state !== "output-available") return <Spinner label="Buying cover…" />;
  const o = part.output ?? {};
  if (o.needsApproval) return <div className="text-xs text-muted">Needs your approval: {o.reason}</div>;
  if (!o.purchased)
    return (
      <div className="rounded-lg border border-warn/40 bg-[#fbf0dc] px-3 py-2 text-xs">
        Cover not bought: {o.reason} {o.auditUrl && <ExtLink href={o.auditUrl}>HCS audit</ExtLink>}
      </div>
    );
  return (
    <div className="rounded-lg border border-ok/40 bg-[#e3f1e5] px-3 py-2 text-xs space-y-1">
      <div className="font-semibold">Covered · premium {o.premium} {o.currency}</div>
      <div className="flex gap-3">
        <ExtLink href={o.txUrl}>transaction</ExtLink>
        {o.auditUrl && <ExtLink href={o.auditUrl}>HCS audit</ExtLink>}
        <Link className="underline" href={o.policyUrl}>
          track policy
        </Link>
      </div>
    </div>
  );
}

function ApprovalTool({ part, addToolOutput }: { part: any; addToolOutput: any }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (part.state === "output-available") return <div className="text-xs text-muted">{part.output?.approved ? "✓ You approved this purchase." : "✗ You declined this purchase."}</div>;
  if (part.state !== "input-available") return <Spinner label="Preparing approval…" />;
  const i = part.input ?? {};
  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ approved: boolean; approvalToken?: string }>("/api/freight-agent/approve", { method: "POST", json: { quoteId: i.quoteId, approve } });
      addToolOutput({ tool: "requestApproval", toolCallId: part.toolCallId, output: r.approved ? { approved: true, approvalToken: r.approvalToken } : { approved: false, message: "Customer declined" } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card p-4 space-y-3 border-2 border-signal/50">
      <div className="text-xs uppercase tracking-wide text-muted font-semibold">Approval needed</div>
      <div>
        <div className="font-display text-xl font-semibold">
          {i.premium} {i.currency}
        </div>
        <div className="text-sm text-ink-2">{i.product ?? "Arrival delay cover"} · quote {short(i.quoteId, 6)}</div>
      </div>
      <p className="text-xs text-ink-2">This premium is above your approval threshold, so the agent needs your tap. Pays a fixed amount only if the vessel&rsquo;s recorded arrival is late beyond the threshold.</p>
      <div className="flex gap-2">
        <button className="btn btn-signal flex-1" disabled={busy} onClick={() => decide(true)}>
          Approve
        </button>
        <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => decide(false)}>
          Decline
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

function WalletPanel({ wallet, error, onChange, refresh }: { wallet: WalletView | null; error: string | null; onChange: (w: WalletView) => void; refresh: () => void }) {
  const [form, setForm] = useState<{ perCallMax: string; dailyCap: string; approvalThreshold: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (error) return <ErrorNote error={error} />;
  if (!wallet) return <Spinner label="Loading wallet…" />;
  const f = form ?? { perCallMax: wallet.limits.perCallMax, dailyCap: wallet.limits.dailyCap, approvalThreshold: wallet.limits.approvalThreshold };
  const balances = "error" in wallet.balances ? null : wallet.balances;

  async function save(patch: Record<string, unknown>, label: string) {
    setBusy(label);
    setErr(null);
    try {
      onChange(await api<WalletView>("/api/freight-agent/settings", { method: "PUT", json: patch }));
      setForm(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function deposit() {
    setBusy("deposit");
    setErr(null);
    try {
      const r = await api<{ amount: string; explorerUrl: string }>("/api/freight-agent/deposit", { method: "POST", json: { amount: "1" } });
      setNote(`Deposited ${r.amount} USDC into Circle Gateway.`);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const paused = wallet.limits.paused;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Kill switch</div>
          <button className={`btn ${paused ? "btn-signal" : "btn-ghost"} !py-1 !text-xs`} disabled={!!busy || wallet.limits.globalPause} onClick={() => save({ paused: !paused }, "pause")}>
            {paused ? "Resume agent spending" : "Pause all agent spending"}
          </button>
        </div>
        {wallet.limits.globalPause && <p className="text-xs text-bad">Paused for everyone on this deployment (AGENT_PAUSED).</p>}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {(
            [
              ["perCallMax", "Per data call"],
              ["dailyCap", "Daily cap"],
              ["approvalThreshold", "Ask me above"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="space-y-1">
              <span className="text-muted">{label}</span>
              <input className="input !py-1" inputMode="decimal" value={f[k]} onChange={(e) => setForm({ ...f, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="inline-flex rounded-full border border-line p-0.5">
            {(["hedera", "arc-gateway"] as const).map((r) => (
              <button key={r} className={`px-3 py-1 rounded-full ${wallet.limits.preferredRail === r ? "bg-ink text-paper" : ""}`} disabled={!!busy} onClick={() => save({ preferredRail: r }, "rail")}>
                {r === "hedera" ? "Hedera USDC" : "Arc nanopayments"}
              </button>
            ))}
          </div>
          <button className="btn btn-primary !py-1 !text-xs" disabled={!!busy || !form} onClick={() => save(f, "limits")}>
            Save limits
          </button>
        </div>
        <p className="text-xs text-muted">Amounts in USD stablecoin. Limits are checked on the server before every payment is signed.</p>
      </div>

      <div className="card p-4 space-y-2 text-sm">
        <div className="font-semibold">Agent wallet</div>
        {balances ? (
          <dl className="grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-muted">Arc wallet USDC</dt>
            <dd>{balances.walletUsdc ?? "—"}</dd>
            <dt className="text-muted">Circle Gateway (nanopayments)</dt>
            <dd>{balances.gatewayAvailable ?? "—"}</dd>
            <dt className="text-muted">Hedera account</dt>
            <dd className="mono">{balances.hederaAccount ?? "not configured"}</dd>
          </dl>
        ) : (
          <ErrorNote error={"error" in wallet.balances ? wallet.balances.error : null} />
        )}
        <button className="btn btn-ghost !py-1 !text-xs" disabled={!!busy} onClick={deposit}>
          {busy === "deposit" ? "Depositing…" : "Deposit 1 USDC into Gateway"}
        </button>
        {note && <p className="text-xs text-ok">{note}</p>}
        {wallet.auditTopic && (
          <p className="text-xs">
            Every decision is logged to Hedera topic <ExtLink href={wallet.auditTopic.url}>{wallet.auditTopic.id}</ExtLink>.
          </p>
        )}
      </div>
      <ErrorNote error={err} />

      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-sm">Purchase history</div>
          <button className="text-xs underline text-muted" onClick={refresh}>
            Refresh
          </button>
        </div>
        {wallet.history.length === 0 && <p className="text-xs text-muted">No agent payments yet.</p>}
        <ul className="divide-y divide-line">
          {wallet.history.map((h) => (
            <li key={h.spendId} className="py-2 text-xs space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">
                  {h.kind === "cover" ? "Cover" : "Data"} · {h.amount} {h.asset}
                </span>
                <span className={h.status === "settled" ? "text-ok" : h.status === "declined" ? "text-warn" : "text-bad"}>{h.status}</span>
              </div>
              <div className="text-muted truncate mono">{h.resource.replace(/^https?:\/\/[^/]+/, "")}</div>
              <div className="flex flex-wrap gap-3 text-muted">
                <span>{fmtDate(h.at)}</span>
                <span>{RAIL_LABEL[h.rail] ?? h.rail}</span>
                {h.explorerUrl && <ExtLink href={h.explorerUrl}>tx</ExtLink>}
                {h.auditUrl && <ExtLink href={h.auditUrl}>HCS</ExtLink>}
              </div>
              {h.reason && <div className="text-ink-2">{h.reason}</div>}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Stored on Arkiv (entity type skjol.v1.agent-spend).</p>
      </div>
    </div>
  );
}
