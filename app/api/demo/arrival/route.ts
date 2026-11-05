import { handle } from "@/lib/http";
import { recordSyntheticArrival } from "@/lib/demo-arrival";
import { HttpError } from "@/lib/session";

export const POST = handle(async (req: Request) => {
  const { policyId, minutesAfterDeadline } = (await req.json()) as { policyId: string; minutesAfterDeadline: number };
  if (!/^0x[0-9a-fA-F]{64}$/.test(policyId) || !Number.isFinite(minutesAfterDeadline)) throw new HttpError(400, "Invalid input");
  return recordSyntheticArrival(policyId as `0x${string}`, minutesAfterDeadline);
});
