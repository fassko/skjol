import { z } from "zod";
import { bridgeEurc, BRIDGE_CHAINS } from "@/lib/bridge";
import { handle } from "@/lib/http";
import { HttpError, demoCustomer, requireSession } from "@/lib/session";

export const maxDuration = 300;

const Body = z.object({ chain: z.enum(BRIDGE_CHAINS), amount: z.string(), direction: z.enum(["in", "out"]).default("in") });

export const POST = handle(async (req: Request) => {
  const session = await requireSession();
  const acct = demoCustomer();
  if (!acct || !session.demo || session.address !== acct.address) throw new HttpError(403, "Server-side bridging is only available for the demo wallet.");
  const body = Body.safeParse(await req.json());
  if (!body.success) throw new HttpError(422, "Choose a source chain and an amount.");
  return bridgeEurc({ privateKey: process.env.DEMO_CUSTOMER_PRIVATE_KEY as `0x${string}`, ...body.data });
});
