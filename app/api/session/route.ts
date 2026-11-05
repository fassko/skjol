import { z } from "zod";
import { handle } from "@/lib/http";
import { clearSession, getSession, HttpError, signInMessage, verifyWalletSignIn } from "@/lib/session";
import { config } from "@/lib/config";

export const GET = handle(async () => ({ session: await getSession(), demoCustomerEnabled: config.demoCustomerEnabled() }));

const Body = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), issuedAt: z.string(), signature: z.string().regex(/^0x[0-9a-f]+$/i) });

export const POST = handle(async (req: Request) => {
  const b = Body.safeParse(await req.json());
  if (!b.success) throw new HttpError(400, "Invalid sign-in request");
  try {
    return { session: await verifyWalletSignIn(b.data.address as `0x${string}`, b.data.issuedAt, b.data.signature as `0x${string}`) };
  } catch (e) {
    throw new HttpError(401, (e as Error).message);
  }
});

export const PUT = handle(async (req: Request) => {
  const { address } = (await req.json()) as { address: string };
  const issuedAt = new Date().toISOString();
  return { message: signInMessage(address, issuedAt), issuedAt };
});

export const DELETE = handle(async () => {
  await clearSession();
  return { ok: true };
});
