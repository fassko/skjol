import { handle } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { policySummaries } from "@/lib/views";

export const GET = handle(async () => ({ policies: await policySummaries(await requireSession()) }));
