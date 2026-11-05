import "server-only";
import { generateText } from "ai";
import { config } from "../config";
import type { AssessmentStatus } from "../../shared/evidence";

// AI writes plain-language explanations ONLY from the structured facts passed in. It never sees
// document text here and never decides eligibility: `payoutEligible` comes from the rules / contract.

export interface ClaimFacts {
  vesselName: string;
  vesselImo: string;
  port: string;
  agreedArrivalDeadline: string;
  thresholdHours: number;
  assessment: AssessmentStatus;
  reasons: string[];
  recordedArrival: string | null;
  latestEta: string | null;
  delayHours: number | null;
  payoutEligible: boolean | null;
  payoutUsdc: string;
  /** Settlement token of the policy's pool; defaults to USDC. */
  currency?: "USDC" | "EURC";
  dataLabel: "live" | "recorded" | "synthetic";
}

export function rulesExplanation(f: ClaimFacts): string {
  const lbl = f.dataLabel === "live" ? "" : ` (${f.dataLabel} data)`;
  switch (f.assessment) {
    case "ARRIVAL_CONFIRMED":
      return f.payoutEligible
        ? `${f.vesselName} was recorded arriving at ${f.port} on ${f.recordedArrival}${lbl}, ${f.delayHours?.toFixed(1)} hours after the agreed deadline. That is more than the ${f.thresholdHours}-hour threshold, so the fixed payout of ${f.payoutUsdc} ${f.currency ?? "USDC"} applies. Note: vessel arrival is not the same as your container being unloaded or delivered.`
        : `${f.vesselName} was recorded arriving at ${f.port} on ${f.recordedArrival}${lbl}. That is within ${f.thresholdHours} hours of the agreed deadline, so this cover closes without a payout. Delays after arrival (unloading, customs, delivery) are not covered.`;
    case "PENDING_NO_ARRIVAL":
      return `No arrival of ${f.vesselName} at ${f.port} has been recorded yet${lbl}.${f.latestEta ? ` The latest reported ETA is ${f.latestEta}; ETAs are for information only and do not change your agreed deadline.` : ""} Your cover stays active and we will check again.`;
    case "PENDING_STALE":
      return `The most recent port data we have is too old to rely on${lbl}. Your cover stays active; nothing is decided until fresh data is available.`;
    case "PENDING_CONFLICT":
      return `The port records for ${f.vesselName} contradict each other${lbl} (${f.reasons.join(", ")}). We do not settle on conflicting data; your cover stays active until the records are consistent or reviewed.`;
    case "SOURCE_UNAVAILABLE":
      return `The port-call data source could not be reached. Your cover stays active and the check will be retried.`;
  }
}

export async function explainClaim(f: ClaimFacts): Promise<{ text: string; source: "ai" | "rules" }> {
  const fallback = rulesExplanation(f);
  if (!config.aiEnabled()) return { text: fallback, source: "rules" };
  try {
    const { text } = await generateText({
      model: config.aiModel(),
      system:
        "You explain a parametric vessel-arrival delay cover to a small importer in 2-4 short sentences. Use ONLY the JSON facts. Never change or speculate about the decision, amounts or dates. Say clearly that vessel arrival is not unloading or delivery when relevant. No jargon about blockchains or oracles.",
      prompt: JSON.stringify(f),
      temperature: 0.2,
    });
    return { text: text.trim() || fallback, source: "ai" };
  } catch {
    return { text: fallback, source: "rules" };
  }
}
