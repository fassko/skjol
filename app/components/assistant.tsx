"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { BuyCard, PurchasedNote, ReviewForm, SAMPLES, type Extraction, type Offer, type UploadResult } from "./cover-steps";
import { ErrorNote, Spinner } from "./ui";

// Conversational buying agent. Confirmation and purchase are client-side tools: the model can only
// ASK; the customer completes them in these components.
export function Assistant() {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { messages, sendMessage, addToolOutput, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup function.
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const offers: Offer[] = messages.flatMap((m) =>
    m.parts.flatMap((p: any) => (p.type === "tool-getQuotes" && p.state === "output-available" ? (p.output?.offers ?? []) : [])),
  );

  async function upload(file: File, synthetic: boolean) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("synthetic", String(synthetic));
      const r = await api<UploadResult>("/api/shipments", { method: "POST", body: fd });
      sendMessage({ text: `I uploaded "${file.name}"${synthetic ? " (synthetic sample)" : ""}. Shipment id: ${r.shipmentId}` });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function sample(name: string) {
    const res = await fetch(`/samples/${name}`);
    await upload(new File([await res.blob()], name, { type: "text/plain" }), true);
  }

  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="card flex flex-col h-[70vh] min-h-[520px]">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="font-display text-lg font-semibold">Cover assistant</div>
          <div className="text-xs text-muted">AI helps you read documents and choose cover. Prices and payouts come from fixed rules.</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-ink-2 space-y-3">
            <p>Hi! I can help you protect a shipment against a late vessel arrival at a port in Finland or India. Upload your bill of lading or booking confirmation to start, or try a synthetic sample:</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.slice(0, 3).map((s) => (
                <button key={s.file} className="btn btn-ghost !py-1 !px-3 !text-xs" disabled={uploading} onClick={() => sample(s.file)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "bg-ink text-paper rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] text-sm" : "space-y-3 text-sm max-w-full"}>
              {m.parts.map((p: any, i: number) => {
                if (p.type === "text") return <p key={i} className="whitespace-pre-wrap leading-relaxed">{p.text}</p>;
                if (p.type === "tool-requestConfirmation") return <ConfirmTool key={i} part={p} addToolOutput={addToolOutput} />;
                if (p.type === "tool-buyPolicy") return <BuyTool key={i} part={p} offers={offers} addToolOutput={addToolOutput} />;
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
        {busy && <Spinner label="Thinking…" />}
        <ErrorNote error={error?.message?.includes("503") || error?.message?.includes("unavailable") ? "The AI assistant is not configured here — use the step-by-step flow." : error?.message} />
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
        <label className="btn btn-ghost !px-3 cursor-pointer" title="Upload document">
          <input type="file" className="hidden" accept=".pdf,.txt" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], false)} />
          {uploading ? "…" : "📎"}
        </label>
        <input className="input" placeholder="Ask about cover or your shipment…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  describeCover: "Looked up cover options",
  getShipment: "Read your document details",
  getQuotes: "Prepared quotes",
  listMyPolicies: "Checked your policies",
  getPolicyStatus: "Checked policy status",
};

export function ConfirmTool({ part, addToolOutput }: { part: any; addToolOutput: any }) {
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = part.input?.shipmentId as string | undefined;
  useEffect(() => {
    if (id && part.state === "input-available") api<{ extraction: Extraction }>(`/api/shipments/${id}`).then((r) => setExtraction(r.extraction)).catch((e) => setErr(e.message));
  }, [id, part.state]);
  if (part.state === "output-available") return <div className="text-xs text-ok">✓ {part.output?.confirmed ? "You confirmed the shipment details." : "Confirmation cancelled."}</div>;
  if (part.state !== "input-available" || !id) return <Spinner label="Preparing review form…" />;
  if (err) return <ErrorNote error={err} />;
  if (!extraction) return <Spinner label="Loading details…" />;
  return (
    <div className="card p-4">
      <ReviewForm
        shipmentId={id}
        extraction={extraction}
        onConfirmed={(shipment) => addToolOutput({ tool: "requestConfirmation", toolCallId: part.toolCallId, output: { confirmed: true, shipment } })}
      />
      <button className="text-xs text-muted mt-2 underline" onClick={() => addToolOutput({ tool: "requestConfirmation", toolCallId: part.toolCallId, output: { confirmed: false, message: "Customer cancelled" } })}>
        Cancel
      </button>
    </div>
  );
}

function BuyTool({ part, offers, addToolOutput }: { part: any; offers: Offer[]; addToolOutput: any }) {
  const [done, setDone] = useState<{ policyId: `0x${string}`; purchaseTx: `0x${string}`; purchaseTxUrl: string | null } | null>(null);
  if (part.state === "output-available")
    return done ? <PurchasedNote r={done} /> : <div className="text-xs text-ok">✓ {part.output?.purchased ? "Cover purchased." : "Purchase not completed."}</div>;
  if (part.state !== "input-available") return <Spinner label="Preparing purchase…" />;
  const offer = offers.find((o) => o.quoteId.toLowerCase() === String(part.input?.quoteId).toLowerCase());
  if (!offer) return <ErrorNote error="That quote is not available. Please ask for new quotes." />;
  return (
    <div className="card p-4">
      <BuyCard
        offer={offer}
        onDone={(r) => {
          setDone(r);
          addToolOutput({ tool: "buyPolicy", toolCallId: part.toolCallId, output: { purchased: true, policyId: r.policyId, txUrl: r.purchaseTxUrl } });
        }}
      />
      <button className="text-xs text-muted mt-2 underline" onClick={() => addToolOutput({ tool: "buyPolicy", toolCallId: part.toolCallId, output: { purchased: false, message: "Customer cancelled" } })}>
        Not now
      </button>
    </div>
  );
}
