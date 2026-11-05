"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { erc20Abi, parseUnits, type Address } from "viem";
import { poolAbi } from "@/lib/abi/ShipmentDelayPool";
import { uniswapV2RouterAbi } from "@/lib/abi/uniswap-v2";
import { ErrorNote, ExtLink, Section, Spinner, TestFunds } from "../components/ui";
import { short } from "../components/api";
import { arcTestnet } from "../components/wagmi";
import {
  PUBLIC_EURC,
  PUBLIC_EURC_POOL,
  PUBLIC_UNISWAP_V2_ROUTER,
  PUBLIC_USDC,
  PUBLIC_USDC_POOL,
  PUBLIC_USDC_SHARE_PAIR,
} from "@/shared/capital-public";
import { formatUsdc } from "@/shared/products";

type Tab = "fund" | "redeem" | "trade";
type PoolPick = "USDC" | "EURC";

const POOLS: Record<
  PoolPick,
  { pool: Address; token: Address; symbol: string; shareSymbol: string; sharePair: Address | null }
> = {
  USDC: {
    pool: PUBLIC_USDC_POOL,
    token: PUBLIC_USDC,
    symbol: "USDC",
    shareSymbol: "skjolUSDC",
    sharePair: PUBLIC_USDC_SHARE_PAIR,
  },
  EURC: {
    pool: PUBLIC_EURC_POOL,
    token: PUBLIC_EURC,
    symbol: "EURC",
    shareSymbol: "skjolEURC",
    sharePair: null,
  },
};

function units(v: string) {
  try {
    return parseUnits(v.trim() || "0", 6);
  } catch {
    return 0n;
  }
}

export default function CapitalPage() {
  const [currency, setCurrency] = useState<PoolPick>("USDC");
  const [tab, setTab] = useState<Tab>("fund");
  const cfg = POOLS[currency];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="space-y-2 max-w-2xl">
          <p className="tag text-sea">Capital pool</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">Fund the shared pool. Trade the shares.</h1>
        </div>
        <p className="text-ink-2">
          Premiums and operator capital sit in one pot that backs every policy. Deposit{" "}
          <TestFunds currency={cfg.symbol} /> to mint transferable <strong>{cfg.shareSymbol}</strong> shares.
          Redeem free collateral, or swap shares on Uniswap V2 on Arc Testnet.
        </p>
        <p className="text-xs text-muted">
          Reserved payouts cannot be redeemed until policies settle. Share NAV rises with premiums and falls when claims pay.{" "}
          <Link href="/integrations" className="underline">
            How it’s built →
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["USDC", "EURC"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`btn ${currency === c ? "btn-signal" : "btn-ghost"} !py-1.5 !text-sm`}
            onClick={() => setCurrency(c)}
          >
            {c} · {POOLS[c].shareSymbol}
          </button>
        ))}
      </div>

      <PoolStats cfg={cfg} />

      <div className="flex gap-1 text-sm border-b border-line">
        {(
          [
            ["fund", "Fund"],
            ["redeem", "Redeem"],
            ["trade", "Trade · Uniswap"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`px-4 py-2 -mb-px border-b-2 ${tab === id ? "border-signal text-ink font-semibold" : "border-transparent text-muted"}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "fund" && <FundPanel cfg={cfg} />}
      {tab === "redeem" && <RedeemPanel cfg={cfg} />}
      {tab === "trade" && <TradePanel cfg={cfg} />}
    </div>
  );
}

function PoolStats({ cfg }: { cfg: (typeof POOLS)[PoolPick] }) {
  const assets = useReadContract({ address: cfg.pool, abi: poolAbi, functionName: "totalAssets", chainId: arcTestnet.id });
  const supply = useReadContract({ address: cfg.pool, abi: poolAbi, functionName: "totalSupply", chainId: arcTestnet.id });
  const free = useReadContract({ address: cfg.pool, abi: poolAbi, functionName: "availableCapital", chainId: arcTestnet.id });
  const reserved = useReadContract({ address: cfg.pool, abi: poolAbi, functionName: "totalReserved", chainId: arcTestnet.id });
  const nav =
    assets.data !== undefined && supply.data !== undefined && supply.data > 0n
      ? formatUsdc((assets.data * 1_000_000n) / supply.data)
      : "1.00";

  return (
    <Section title={`${cfg.shareSymbol} vault`}>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-muted text-xs uppercase tracking-wide">Total assets</dt>
          <dd className="font-display text-2xl font-semibold mt-1">{assets.data !== undefined ? formatUsdc(assets.data) : "—"} {cfg.symbol}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wide">Free / reserved</dt>
          <dd className="font-display text-2xl font-semibold mt-1">
            {free.data !== undefined ? formatUsdc(free.data) : "—"}
            <span className="text-muted text-base font-sans font-normal"> / {reserved.data !== undefined ? formatUsdc(reserved.data) : "—"}</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wide">Shares outstanding</dt>
          <dd className="font-display text-2xl font-semibold mt-1">{supply.data !== undefined ? formatUsdc(supply.data) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wide">NAV / share</dt>
          <dd className="font-display text-2xl font-semibold mt-1">{nav} {cfg.symbol}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted mt-4 mono">
        Pool <ExtLink href={`https://explorer.testnet.arc.io/address/${cfg.pool}`}>{short(cfg.pool)}</ExtLink>
        {cfg.sharePair && (
          <>
            {" · "}Pair <ExtLink href={`https://explorer.testnet.arc.io/address/${cfg.sharePair}`}>{short(cfg.sharePair)}</ExtLink>
          </>
        )}
      </p>
    </Section>
  );
}

function useArcWallet() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: arcTestnet.id });
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onArc = chainId === arcTestnet.id;

  async function guarded(label: string, fn: () => Promise<void>) {
    setError(null);
    setStep(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStep(null);
    }
  }

  const ensureArc = () =>
    guarded("Approve the network switch…", async () => {
      await switchChainAsync({
        chainId: arcTestnet.id,
        addEthereumChainParameter: {
          chainName: "Arc Testnet",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.testnet.arc.network"],
          blockExplorerUrls: ["https://explorer.testnet.arc.io"],
        },
      });
    });

  return { address, isConnected, onArc, client, writeContractAsync, step, error, setError, guarded, ensureArc };
}

function FundPanel({ cfg }: { cfg: (typeof POOLS)[PoolPick] }) {
  const w = useArcWallet();
  const [amount, setAmount] = useState("5");
  const assets = units(amount);
  const preview = useReadContract({
    address: cfg.pool,
    abi: poolAbi,
    functionName: "previewDeposit",
    args: [assets],
    chainId: arcTestnet.id,
    query: { enabled: assets > 0n },
  });
  const bal = useReadContract({
    address: cfg.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: w.address ? [w.address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!w.address },
  });
  const allowance = useReadContract({
    address: cfg.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: w.address ? [w.address, cfg.pool] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!w.address },
  });
  const approved = (allowance.data ?? 0n) >= assets && assets > 0n;

  const approve = () =>
    w.guarded(`Approve ${cfg.symbol}…`, async () => {
      const hash = await w.writeContractAsync({
        address: cfg.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [cfg.pool, assets],
        chainId: arcTestnet.id,
      });
      await w.client!.waitForTransactionReceipt({ hash });
      await allowance.refetch();
    });

  const deposit = () =>
    w.guarded("Confirm deposit…", async () => {
      const hash = await w.writeContractAsync({
        address: cfg.pool,
        abi: poolAbi,
        functionName: "deposit",
        args: [assets, w.address!],
        chainId: arcTestnet.id,
      });
      await w.client!.waitForTransactionReceipt({ hash });
      await Promise.all([bal.refetch(), preview.refetch()]);
    });

  return (
    <Section title={`Deposit ${cfg.symbol} → mint ${cfg.shareSymbol}`}>
      {!w.isConnected ? (
        <p className="text-sm text-ink-2">Connect a wallet from the header (via Get cover) to fund the pool.</p>
      ) : (
        <div className="space-y-4 max-w-md">
          {!w.onArc && (
            <button type="button" className="btn btn-ghost" onClick={w.ensureArc} disabled={!!w.step}>
              Switch to Arc Testnet
            </button>
          )}
          <label className="block text-sm">
            <span className="text-muted">Amount ({cfg.symbol})</span>
            <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="text-xs text-muted">
            Wallet: {bal.data !== undefined ? formatUsdc(bal.data) : "—"} {cfg.symbol} · You receive ≈{" "}
            {preview.data !== undefined ? formatUsdc(preview.data) : "—"} {cfg.shareSymbol}
          </p>
          <div className="flex flex-wrap gap-2">
            {!approved ? (
              <button type="button" className="btn btn-signal" disabled={!w.onArc || !!w.step || assets === 0n} onClick={approve}>
                Approve
              </button>
            ) : (
              <button type="button" className="btn btn-signal" disabled={!w.onArc || !!w.step || assets === 0n} onClick={deposit}>
                Deposit
              </button>
            )}
            {w.step && <Spinner label={w.step} />}
          </div>
          <ErrorNote error={w.error} />
        </div>
      )}
    </Section>
  );
}

function RedeemPanel({ cfg }: { cfg: (typeof POOLS)[PoolPick] }) {
  const w = useArcWallet();
  const [amount, setAmount] = useState("1");
  const shares = units(amount);
  const shareBal = useReadContract({
    address: cfg.pool,
    abi: poolAbi,
    functionName: "balanceOf",
    args: w.address ? [w.address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!w.address },
  });
  const maxRedeem = useReadContract({
    address: cfg.pool,
    abi: poolAbi,
    functionName: "maxRedeem",
    args: w.address ? [w.address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!w.address },
  });
  const preview = useReadContract({
    address: cfg.pool,
    abi: poolAbi,
    functionName: "previewRedeem",
    args: [shares],
    chainId: arcTestnet.id,
    query: { enabled: shares > 0n },
  });
  const capped = maxRedeem.data !== undefined && shares > maxRedeem.data;

  const redeem = () =>
    w.guarded("Confirm redeem…", async () => {
      const hash = await w.writeContractAsync({
        address: cfg.pool,
        abi: poolAbi,
        functionName: "redeem",
        args: [shares, w.address!, w.address!],
        chainId: arcTestnet.id,
      });
      await w.client!.waitForTransactionReceipt({ hash });
      await Promise.all([shareBal.refetch(), maxRedeem.refetch()]);
    });

  return (
    <Section title={`Burn ${cfg.shareSymbol} → ${cfg.symbol}`}>
      {!w.isConnected ? (
        <p className="text-sm text-ink-2">Connect a wallet to redeem free capital.</p>
      ) : (
        <div className="space-y-4 max-w-md">
          {!w.onArc && (
            <button type="button" className="btn btn-ghost" onClick={w.ensureArc} disabled={!!w.step}>
              Switch to Arc Testnet
            </button>
          )}
          <label className="block text-sm">
            <span className="text-muted">Shares to redeem</span>
            <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="text-xs text-muted">
            Your shares: {shareBal.data !== undefined ? formatUsdc(shareBal.data) : "—"} · Max redeemable now:{" "}
            {maxRedeem.data !== undefined ? formatUsdc(maxRedeem.data) : "—"} · You receive ≈{" "}
            {preview.data !== undefined ? formatUsdc(preview.data) : "—"} {cfg.symbol}
          </p>
          {capped && <ErrorNote error="That redeem exceeds free collateral (capital reserved for active policies). Try a smaller amount or wait for settlements." />}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-signal" disabled={!w.onArc || !!w.step || shares === 0n || capped} onClick={redeem}>
              Redeem
            </button>
            {w.step && <Spinner label={w.step} />}
          </div>
          <ErrorNote error={w.error} />
        </div>
      )}
    </Section>
  );
}

function TradePanel({ cfg }: { cfg: (typeof POOLS)[PoolPick] }) {
  const w = useArcWallet();
  const [direction, setDirection] = useState<"sell" | "buy">("sell");
  const [amount, setAmount] = useState("1");
  const amountIn = units(amount);
  const path = useMemo((): Address[] => {
    return direction === "sell" ? [cfg.pool, cfg.token] : [cfg.token, cfg.pool];
  }, [direction, cfg.pool, cfg.token]);

  const quote = useReadContract({
    address: PUBLIC_UNISWAP_V2_ROUTER,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountIn, path],
    chainId: arcTestnet.id,
    query: { enabled: amountIn > 0n && !!cfg.sharePair },
  });
  const amountOut = quote.data?.[1];
  const minOut = amountOut !== undefined ? (amountOut * 995n) / 1000n : 0n;

  const tokenIn = direction === "sell" ? cfg.pool : cfg.token;
  const tokenInLabel = direction === "sell" ? cfg.shareSymbol : cfg.symbol;
  const tokenOutLabel = direction === "sell" ? cfg.symbol : cfg.shareSymbol;

  const allowance = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: "allowance",
    args: w.address ? [w.address, PUBLIC_UNISWAP_V2_ROUTER] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!w.address && !!cfg.sharePair },
  });
  const approved = (allowance.data ?? 0n) >= amountIn && amountIn > 0n;

  const approve = () =>
    w.guarded(`Approve ${tokenInLabel}…`, async () => {
      const hash = await w.writeContractAsync({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "approve",
        args: [PUBLIC_UNISWAP_V2_ROUTER, amountIn],
        chainId: arcTestnet.id,
      });
      await w.client!.waitForTransactionReceipt({ hash });
      await allowance.refetch();
    });

  const swap = () =>
    w.guarded("Confirm swap…", async () => {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
      const hash = await w.writeContractAsync({
        address: PUBLIC_UNISWAP_V2_ROUTER,
        abi: uniswapV2RouterAbi,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, minOut, path, w.address!, deadline],
        chainId: arcTestnet.id,
      });
      await w.client!.waitForTransactionReceipt({ hash });
      await quote.refetch();
    });

  if (!cfg.sharePair) {
    return (
      <Section title="Trade on Uniswap V2">
        <p className="text-sm text-ink-2">
          No Uniswap pair is seeded for {cfg.shareSymbol} yet. The USDC pool has a live share pair — switch currency above, or seed with{" "}
          <span className="mono">scripts/seed-share-pair.mts</span>.
        </p>
      </Section>
    );
  }

  return (
    <Section title={`Swap ${cfg.shareSymbol} ↔ ${cfg.symbol} on Uniswap V2`}>
      {!w.isConnected ? (
        <p className="text-sm text-ink-2">Connect a wallet to trade pool shares on Uniswap V2.</p>
      ) : (
        <div className="space-y-4 max-w-md">
          {!w.onArc && (
            <button type="button" className="btn btn-ghost" onClick={w.ensureArc} disabled={!!w.step}>
              Switch to Arc Testnet
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" className={`btn !py-1.5 !text-sm ${direction === "sell" ? "btn-signal" : "btn-ghost"}`} onClick={() => setDirection("sell")}>
              Sell shares
            </button>
            <button type="button" className={`btn !py-1.5 !text-sm ${direction === "buy" ? "btn-signal" : "btn-ghost"}`} onClick={() => setDirection("buy")}>
              Buy shares
            </button>
          </div>
          <label className="block text-sm">
            <span className="text-muted">Amount in ({tokenInLabel})</span>
            <input className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <p className="text-xs text-muted">
            Quote ≈ {amountOut !== undefined ? formatUsdc(amountOut) : "—"} {tokenOutLabel} (0.5% slippage) · Router{" "}
            <span className="mono">{short(PUBLIC_UNISWAP_V2_ROUTER)}</span>
          </p>
          {quote.error && <ErrorNote error="No liquidity quote — pair may need seeding." />}
          <div className="flex flex-wrap gap-2">
            {!approved ? (
              <button type="button" className="btn btn-signal" disabled={!w.onArc || !!w.step || amountIn === 0n} onClick={approve}>
                Approve
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-signal"
                disabled={!w.onArc || !!w.step || amountIn === 0n || amountOut === undefined}
                onClick={swap}
              >
                Swap
              </button>
            )}
            {w.step && <Spinner label={w.step} />}
          </div>
          <ErrorNote error={w.error} />
        </div>
      )}
    </Section>
  );
}
