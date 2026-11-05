import { connection } from "next/server";
import { Suspense } from "react";
import { config } from "@/lib/config";
import { CoverFlow } from "./flow";

async function CoverWithFlags() {
  await connection(); // read runtime env per request (AI availability), not at build time
  return <CoverFlow aiEnabled={config.aiEnabled()} />;
}

export default function CoverPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <CoverWithFlags />
    </Suspense>
  );
}
