import { handle } from "@/lib/http";
import { createSession, demoCustomer, HttpError } from "@/lib/session";

// Demo wallet: a server-held TEST key so judges can try the flow without a browser wallet.
export const POST = handle(async () => {
  const acct = demoCustomer();
  if (!acct) throw new HttpError(404, "The demo wallet is not enabled here.");
  return { session: await createSession(acct.address, true) };
});
