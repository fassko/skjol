import { BaseError, hexToString, type Hex } from 'viem'
import { formatUnitsFixed } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'

export const usd = (raw: bigint, digits = 2) => `${formatUnitsFixed(raw, USDC_DECIMALS, digits)} USDC`

export const usdNumber = (raw: bigint, digits = 2) => formatUnitsFixed(raw, USDC_DECIMALS, digits)

export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
export const shortHash = (h: string) => `${h.slice(0, 10)}...${h.slice(-6)}`

/** UN/LOCODE is stored left-aligned ASCII in a bytes32. */
export function locodeToText(b: Hex): string {
  try {
    return hexToString(b, { size: 32 }).replace(/\0+$/g, '')
  } catch {
    return b
  }
}

export function formatDateTime(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) {
    const d = seconds / 86400
    return d === 1 ? '24 hours' : `${d} days`
  }
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`
  if (seconds % 60 === 0) return `${seconds / 60} minutes`
  return `${seconds} seconds`
}

const ERROR_COPY: Record<string, string> = {
  QuoteExpired: 'This quote has expired. Ask Skjol for a fresh one.',
  PurchaseCutoffPassed: 'The purchase window for this shipment has closed.',
  QuoteAlreadyUsed: 'This quote was already used. Each quote can only be bought once.',
  PolicyExists: 'A policy with this id already exists.',
  NotBeneficiary: 'Connect the wallet named in the quote. Only that wallet can buy this cover.',
  InvalidQuoteSignature: 'The signature does not match Skjol\u2019s underwriting key. The quote may have been edited.',
  InvalidQuoteTerms: 'The quote terms are not valid for this pool (check payout limit, threshold and dates).',
  InsufficientCollateral: 'The pool does not have enough free capital to back this payout right now.',
  PurchasesPaused: 'New cover is paused by the pool owner.',
  ERC4626ExceededMaxRedeem: 'That is more than the free capital allows. Reserved capital cannot be withdrawn.',
  ERC4626ExceededMaxDeposit: 'This deposit is above the pool limit.',
  ERC20InsufficientBalance: 'Your USDC balance is too low for this amount.',
  ERC20InsufficientAllowance: 'USDC spending is not approved for this amount yet.',
}

export type ParsedError = { message: string; cancelled: boolean }

/** Turn a wagmi/viem error into plain language. Never shows raw error text. */
export function parseTxError(error: unknown): ParsedError {
  if (error instanceof BaseError) {
    const text = (error.shortMessage + ' ' + error.message).toLowerCase()
    if (text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
      return { message: 'Transaction cancelled.', cancelled: true }
    }
    let revertName: string | undefined
    error.walk((e) => {
      const data = (e as { data?: { errorName?: string } }).data
      if (data?.errorName && !revertName) revertName = data.errorName
      return false
    })
    if (revertName && ERROR_COPY[revertName]) return { message: ERROR_COPY[revertName], cancelled: false }
    if (text.includes('insufficient funds')) {
      return { message: 'Not enough USDC to cover gas. Use Get test USDC in Arc Studio.', cancelled: false }
    }
    if (text.includes('network') || text.includes('timeout') || text.includes('fetch')) {
      return { message: 'Network issue. Check your connection and retry.', cancelled: false }
    }
    if (text.includes('reverted')) return { message: 'The transaction would fail onchain. Check the details and retry.', cancelled: false }
  }
  return { message: 'Something went wrong. Please try again.', cancelled: false }
}
