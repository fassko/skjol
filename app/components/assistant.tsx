"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useRef, useState } from "react";
import { api, fmtDate } from "./api";
import { BuyCard, PurchasedNote, ReviewForm, SampleChoices, type Extraction, type Offer, type PurchaseDone, type UploadResult } from "./cover-steps";
import { Markdown } from "./markdown";
import { ErrorNote, Spinner, TestFunds } from "./ui";

// Conversational buying agent. Confirmation and purchase are client-side tools: the model can only
// ASK; the customer completes them in these components.
export function Assistant() {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { messages, sendMessage, setMessages, addToolOutput, status, error, stop, clearError } = useChat({
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
      const what = synthetic ? `the sample “${file.name}”` : `“${file.name}”`;
      sendMessage({ text: `I uploaded ${what}. Please read shipment ${r.shipmentId}.` });
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

  function clearMessages() {
    if (busy) stop();
    setMessages([]);
    clearError();
    setUploadError(null);
    setInput("");
  }

  return (
    <div className="card flex flex-col h-[70vh] min-h-[520px]">
      <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-lg font-semibold">Cover assistant</div>
          <div className="text-xs text-muted">AI helps you read documents and choose cover. Prices and payouts come from fixed rules.</div>
        </div>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost !py-1 !px-3 !text-xs shrink-0" onClick={clearMessages}>
            Clear messages
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-ink-2 space-y-3">
            <p>Hi! I can help you protect a shipment against a late vessel arrival at a port in Finland or India. Upload your bill of lading or booking confirmation to start, or try a synthetic sample:</p>
            <SampleChoices disabled={uploading} onPick={sample} />
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "bg-ink text-paper rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] text-sm" : "space-y-3 text-sm max-w-full"}>
              {m.parts.map((p: any, i: number) => {
                if (p.type === "text")
                  return m.role === "user" ? (
                    <p key={i} className="whitespace-pre-wrap leading-relaxed">{p.text}</p>
                  ) : (
                    <div key={i} className="rounded-2xl rounded-bl-sm bg-paper px-4 py-3">
                      <Markdown text={p.text} />
                    </div>
                  );
                if (p.type === "tool-requestConfirmation") return <ConfirmTool key={i} part={p} addToolOutput={addToolOutput} />;
                if (p.type === "tool-getShipment" && p.state === "output-available")
                  return (
                    <div key={i} className="space-y-2">
                      <ToolLine name="getShipment" state={p.state} />
                      <ShipmentSummary output={p.output} />
                    </div>
                  );
                if (p.type === "tool-getQuotes" && p.state === "output-available")
                  return (
                    <div key={i} className="space-y-3">
                      <ToolLine name="getQuotes" state={p.state} />
                      <QuoteChoices output={p.output} />
                    </div>
                  );
                if (p.type === "tool-buyPolicy") return <BuyTool key={i} part={p} offers={offers} addToolOutput={addToolOutput} />;
                if (typeof p.type === "string" && p.type.startsWith("tool-")) return <ToolLine key={i} name={p.type.slice(5)} state={p.state} errorText={p.errorText} />;
                return null;
              })}
            </div>
          </div>
        ))}
        {busy && <Spinner label="Thinking…" />}
        <ErrorNote error={plainError(error?.message)} />
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
  getShipment: "Read your document",
  getQuotes: "Prepared quotes",
  listMyPolicies: "Checked your policies",
  getPolicyStatus: "Checked policy status",
};

const FIELD_LABELS: Record<string, string> = {
  vesselName: "Vessel",
  vesselImo: "IMO",
  vesselMmsi: "MMSI",
  voyageRef: "Voyage",
  originPort: "Loaded at",
  destinationLocode: "Destination",
  destinationPort: "Discharge port",
  departureDate: "Departure",
  agreedArrivalDeadline: "Agreed arrival deadline",
};

function plainError(message: string | null | undefined) {
  if (!message) return null;
  if (/503|unavailable|not configured/i.test(message)) return "The assistant is not configured here. Use the step-by-step flow.";
  return message
    .replace(/\bdepartureDate\b/g, "departure date")
    .replace(/\bagreedArrivalDeadline\b/g, "agreed arrival deadline")
    .replace(/\bdestinationLocode\b/g, "destination port")
    .replace(/\bvesselImo\b/g, "IMO number")
    .replace(/invalid iso datetime/gi, "is not a valid date");
}

function ToolLine({ name, state, errorText }: { name: string; state?: string; errorText?: string }) {
  const mark = state === "output-available" ? "✓" : state === "output-error" ? "✗" : "…";
  const label = TOOL_LABELS[name] ?? name;
  return (
    <div className="text-xs text-muted">
      {mark} {label}
      {state === "output-error" && errorText && <span className="text-bad"> — {plainError(errorText)}</span>}
    </div>
  );
}

function fieldValue(key: string, value: string | null | undefined) {
  if (!value) return "Not in the document";
  if (key === "departureDate" || key === "agreedArrivalDeadline") return fmtDate(value);
  return value;
}

function ShipmentSummary({ output }: { output?: { fields?: Record<string, { value?: string | null; status?: string }>; issues?: { field?: string; message?: string }[] } }) {
  const fields = output?.fields ?? {};
  const keys = Object.keys(FIELD_LABELS).filter((k) => fields[k]);
  if (!keys.length) return null;
  const issues = (output?.issues ?? []).filter((i) => i.message);
  return (
    <div className="rounded-xl border border-line bg-[#fffdf8] px-3 py-2 text-sm space-y-2">
      <p className="font-semibold">From your document</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {keys.map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted">{FIELD_LABELS[k]}</dt>
            <dd className={fields[k].value ? "" : "text-muted"}>{fieldValue(k, fields[k].value)}</dd>
          </div>
        ))}
      </dl>
      {issues.length > 0 && (
        <ul className="text-ink-2 space-y-1 border-t border-line pt-2">
          {issues.map((i, n) => (
            <li key={n}>{i.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function lateLabel(hours: number) {
  return hours >= 1 ? `${hours} h` : `${Math.round(hours * 60)} min`;
}

function QuoteChoices({ output }: { output?: { offers?: Offer[]; declined?: { reasons: string[] }[] } }) {
  const offers = output?.offers ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [done, setDone] = useState<PurchaseDone | null>(null);
  const active = offers.find((o) => o.quoteId === activeId);

  if (!offers.length) {
    const reasons = [...new Set((output?.declined ?? []).flatMap((d) => d.reasons))];
    if (!reasons.length) return null;
    return (
      <div className="rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink-2 space-y-1">
        <p className="font-semibold text-ink">Nothing to buy for this shipment</p>
        <ul className="list-disc pl-5 space-y-1">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (done) return <PurchasedNote r={done} />;
  if (active) {
    return (
      <div className="card p-4 space-y-3">
        <button type="button" className="text-xs text-muted underline" onClick={() => setActiveId(null)}>
          Back to quotes
        </button>
        <BuyCard offer={active} onDone={setDone} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {offers.map((o) => (
        <div key={o.quoteId} className="rounded-xl border border-line bg-[#fffdf8] p-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold">{o.productName}</span>
              {o.demoOnly && <span className="tag text-warn">Test only</span>}
              <TestFunds currency={o.currency} />
            </div>
            <p className="text-sm text-ink-2">
              Pays <span className="font-semibold text-ink">{o.payout} {o.currency}</span> if the vessel is more than {lateLabel(o.thresholdHours)} late.
              Premium <span className="font-semibold text-ink">{o.premium} {o.currency}</span>.
            </p>
          </div>
          <button type="button" className="btn btn-signal shrink-0" onClick={() => setActiveId(o.quoteId)}>
            Buy
          </button>
        </div>
      ))}
    </div>
  );
}

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
