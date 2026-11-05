import type { Address } from "viem";

/** Client-safe defaults for Arc Testnet capital / Uniswap UI (overridable via NEXT_PUBLIC_*). */
export const PUBLIC_UNISWAP_V2_ROUTER = (process.env.NEXT_PUBLIC_UNISWAP_V2_ROUTER ??
  "0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9") as Address;

export const PUBLIC_USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as Address;

export const PUBLIC_EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ??
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as Address;

export const PUBLIC_USDC_POOL = (process.env.NEXT_PUBLIC_POOL_ADDRESS ??
  "0xa7505609b6c380c3f87940db151ef4a5437f70c0") as Address;

export const PUBLIC_EURC_POOL = (process.env.NEXT_PUBLIC_EURC_POOL_ADDRESS ??
  "0x3a68001a32a0a5d174b3ed08ba58d42dd70daa84") as Address;

export const PUBLIC_USDC_SHARE_PAIR = (process.env.NEXT_PUBLIC_USDC_SHARE_PAIR ??
  "0xE89f57309472a3F26378EC887B738ED294b5d124") as Address;
