import { Suspense } from "react";
import { PolicyDetail } from "./detail";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyDetail policyId={id} />;
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading policy…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}
