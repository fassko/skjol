import type { Address } from "viem";

/** Client-safe defaults for Arc Testnet capital / Uniswap UI (overridable via NEXT_PUBLIC_*). */
export const PUBLIC_UNISWAP_V2_ROUTER = (process.env.NEXT_PUBLIC_UNISWAP_V2_ROUTER ??
  "0xe27d5d256b370604f1ff060fb489c6a8e3f8a6d9") as Address;

export const PUBLIC_USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  "0x3600000000000000000000000000000000000000") as Address;

export const PUBLIC_EURC = (process.env.NEXT_PUBLIC_EURC_ADDRESS ??
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a") as Address;

export const PUBLIC_USDC_POOL = (process.env.NEXT_PUBLIC_POOL_ADDRESS ??
  "0xf9a17a1b28eecaa8ef15cae0473c39a9c9e91301") as Address;

export const PUBLIC_EURC_POOL = (process.env.NEXT_PUBLIC_EURC_POOL_ADDRESS ??
  "0x3a68001a32a0a5d174b3ed08ba58d42dd70daa84") as Address;

export const PUBLIC_USDC_SHARE_PAIR = (process.env.NEXT_PUBLIC_USDC_SHARE_PAIR ??
  "0x74BC77B067091afd1A7AcB65c4d205002444cC5B") as Address;
