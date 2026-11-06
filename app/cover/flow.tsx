"use client";
import { useEffect, useRef, useState } from "react";
import { Assistant } from "../components/assistant";
import { BuyCard, ConnectStep, PurchasedNote, QuoteCards, ReviewForm, UploadStep, type Offer, type PurchaseDone, type UploadResult } from "../components/cover-steps";
import { useSession } from "../components/session";
import { DataLabel, Section, Spinner, StorageStrip } from "../components/ui";

const STEPS = ["Connect", "Upload", "Review", "Quote", "Buy"];

export function CoverFlow({ aiEnabled }: { aiEnabled: boolean }) {
  const { session, loading } = useSession();
  const [mode, setMode] = useState<"guided" | "assistant">(aiEnabled ? "assistant" : "guided");
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [done, setDone] = useState<PurchaseDone | null>(null);

  // Documents and quotes belong to the signed-in account: if the account changes, start over.
  const [restartNote, setRestartNote] = useState<string | null>(null);
  const lastAddress = useRef<string | null>(null);
  useEffect(() => {
    const addr = session?.address ?? null;
    if (lastAddress.current && addr && addr !== lastAddress.current) {
      setUpload(null);
      setConfirmed(false);
      setOffer(null);
      setDone(null);
      setRestartNote(`Signed in as a different account. Please upload your document again — it stays private to the account that uploads it.`);
    }
    lastAddress.current = addr;
  }, [session?.address]);

  const step = !session ? 0 : !upload ? 1 : !confirmed ? 2 : !offer ? 3 : 4;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-sea">Buy cover</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">Get arrival delay cover</h1>
          <p className="text-ink-2">Fixed payout if your vessel arrives more than 24 hours after the agreed deadline.</p>
          {!session && !loading && (
            <p className="text-sm text-ink-2 rounded-lg bg-sea-soft/70 px-3 py-2">
              Demo tip: choose <strong>Use demo wallet (test funds)</strong>, then use <strong>Step by step</strong> to upload a bill of lading and buy with test USDC.
            </p>
          )}
        </div>
        {session && (
          <div className="inline-flex rounded-full border border-line bg-[#fffdf8] p-1 text-sm">
            <button className={`px-3 py-1 rounded-full ${mode === "assistant" ? "bg-ink text-paper" : ""}`} onClick={() => setMode("assistant")} disabled={!aiEnabled} title={aiEnabled ? "" : "AI is not configured on this deployment"}>
              Assistant{!aiEnabled && " (off)"}
            </button>
            <button className={`px-3 py-1 rounded-full ${mode === "guided" ? "bg-ink text-paper" : ""}`} onClick={() => setMode("guided")}>
              Step by step
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading…" />
      ) : !session ? (
        <Section title="1. Connect">
          <ConnectStep />
        </Section>
      ) : mode === "assistant" && aiEnabled ? (
        <Assistant />
      ) : (
        <>
          <ol className="flex flex-wrap gap-2 text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className={`px-3 py-1 rounded-full border ${i === step ? "bg-ink text-paper border-ink" : i < step ? "border-sea text-sea" : "border-line text-muted"}`}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
          {restartNote && <div className="rounded-lg bg-sea-soft text-sea text-sm px-3 py-2">{restartNote}</div>}
          {done ? (
            <Section title="Done">
              <PurchasedNote r={done} />
            </Section>
          ) : step === 1 ? (
            <Section title="2. Upload your shipping document">
              <UploadStep onDone={setUpload} />
            </Section>
          ) : step === 2 && upload ? (
            <Section title="3. Check the details" aside={<span className="text-xs text-muted">Stored encrypted · {upload.storage.mode === "local-dev" ? "local dev storage" : "Swarm"}</span>}>
              <div className="space-y-4">
                <StorageStrip arkivKey={upload.arkivKey} arkivUrl={upload.arkivUrl} storage={upload.storage} />
                <ReviewForm shipmentId={upload.shipmentId} extraction={upload.extraction} onConfirmed={() => setConfirmed(true)} />
              </div>
            </Section>
          ) : step === 3 && upload ? (
            <Section title="4. Choose your cover">
              <QuoteCards shipmentId={upload.shipmentId} onChoose={setOffer} />
            </Section>
          ) : offer ? (
            <Section title="5. Buy" aside={<button className="text-xs underline text-muted" onClick={() => setOffer(null)}>Back to quotes</button>}>
              <BuyCard offer={offer} onDone={setDone} />
            </Section>
          ) : null}
          {upload && <p className="text-xs text-muted">Shipment {upload.shipmentId} {upload.extraction && <DataLabel label="customer" />}</p>}
        </>
      )}
    </div>
  );
}
