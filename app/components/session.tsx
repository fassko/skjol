"use client";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { api } from "./api";

interface Session { address: `0x${string}`; demo: boolean; exp: number }
interface Ctx {
  session: Session | null;
  hasBrowserWallet: boolean;
  loading: boolean;
  demoAvailable: boolean;
  error: string | null;
  signInWithWallet: () => Promise<void>;
  useDemoWallet: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoAvailable, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const [hasBrowserWallet, setHasBrowserWallet] = useState(false);
  useEffect(() => {
    setHasBrowserWallet(typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum);
  }, []);

  useEffect(() => {
    api<{ session: Session | null; demoCustomerEnabled: boolean }>("/api/session")
      .then((r) => {
        setSession(r.session);
        setDemo(r.demoCustomerEnabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signInWithWallet = useCallback(async () => {
    setError(null);
    try {
      let addr = address;
      if (isConnected && address) {
        addr = address;
      } else {
        const c = connectors[0];
        const provider = c ? await c.getProvider().catch(() => null) : null;
        if (!c || !provider) {
          throw new Error("No browser wallet was found. Install a wallet such as MetaMask or Rabby, or use the demo wallet to try the flow.");
        }
        const r = await connectAsync({ connector: c });
        addr = r.accounts[0];
      }
      const { message, issuedAt } = await api<{ message: string; issuedAt: string }>("/api/session", { method: "PUT", json: { address: addr } });
      const signature = await signMessageAsync({ message });
      const r = await api<{ session: Session }>("/api/session", { method: "POST", json: { address: addr, issuedAt, signature } });
      setSession(r.session);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [address, isConnected, connectors, connectAsync, signMessageAsync]);

  const useDemoWallet = useCallback(async () => {
    setError(null);
    try {
      const r = await api<{ session: Session }>("/api/session/demo", { method: "POST" });
      setSession(r.session);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/session", { method: "DELETE" });
    if (isConnected) await disconnectAsync().catch(() => {});
    setSession(null);
  }, [isConnected, disconnectAsync]);

  return (
    <SessionCtx.Provider value={{ session, hasBrowserWallet, loading, demoAvailable, error, signInWithWallet, useDemoWallet, signOut }}>{children}</SessionCtx.Provider>
  );
}

const noopSubscribe = () => () => {};

/** false while React hydrates this component (matches the server render), true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside provider");
  const hydrated = useHydrated();
  // The server never knows the session. Until this component has hydrated, report the same
  // "loading, signed out" state the server rendered, even if the provider already fetched it.
  return hydrated ? c : { ...c, session: null, loading: true, hasBrowserWallet: false };
}
