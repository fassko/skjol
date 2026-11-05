import { handle } from "@/lib/http";
import { config } from "@/lib/config";
import { HttpError } from "@/lib/session";
import { runSync } from "@/lib/sync";

export const maxDuration = 300;

// Called by Vercel Cron (GET with CRON_SECRET bearer) and by the app after purchases.
async function authorised(req: Request) {
  const secret = config.cronSecret();
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-skjol-sync") === "app";
}

export const GET = handle(async (req: Request) => {
  if (!(await authorised(req))) throw new HttpError(401, "Unauthorised");
  return runSync();
});

export const POST = handle(async () => runSync());
