import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { HttpError } from "./session";

export const jsonSafe = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x instanceof Uint8Array ? undefined : x)));

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(jsonSafe(out));
    } catch (err) {
      unstable_rethrow(err); // let Next.js handle its own control-flow signals (prerender bailouts, redirects)
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again.", detail: (err as Error).message?.slice(0, 300) }, { status: 500 });
    }
  };
}
