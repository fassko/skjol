import { connection } from "next/server";
import { handle } from "@/lib/http";
import { catalog } from "@/lib/x402/services";

// Free listing of Skjol's paid endpoints, in the Circle Agent Marketplace Discovery API shape.
export const GET = handle(async () => {
  await connection();
  const items = catalog();
  return { x402Version: 2, items, pagination: { limit: items.length, offset: 0, total: items.length } };
});
