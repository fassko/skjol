import { connection } from "next/server";
import { Suspense } from "react";
import { config } from "@/lib/config";
import { FreightAgent } from "./freight-agent";

async function AgentWithFlags() {
  await connection(); // read runtime env per request (AI availability), not at build time
  return <FreightAgent aiEnabled={config.aiEnabled()} />;
}

export default function AgentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <AgentWithFlags />
    </Suspense>
  );
}
