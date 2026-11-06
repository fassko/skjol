import { isAddress, isHex, stringToHex, type Address, type Hex } from 'viem'

export type QuoteStruct = {
  quoteId: Hex
  policyId: Hex
  beneficiary: Address
  vesselImo: number
  voyageRefHash: Hex
  destinationLocode: Hex
  eventType: number
  earliestArrival: bigint
  agreedArrivalDeadline: bigint
  delayThreshold: number
  premium: bigint
  payout: bigint
  termsHash: Hex
  purchaseCutoff: bigint
  quoteExpiry: bigint
}

export type SignedQuote = { quote: QuoteStruct; signature: Hex }

type Raw = Record<string, unknown>

function isRaw(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function bytes32(raw: Raw, key: string, allowText = false): Hex {
  const v = raw[key]
  if (typeof v !== 'string') throw new Error(`Missing field: ${key}`)
  if (isHex(v) && v.length === 66) return v
  if (allowText && /^[\x20-\x7e]{1,32}$/.test(v)) return stringToHex(v, { size: 32 })
  throw new Error(`${key} must be a 32-byte hex value`)
}

function uint(raw: Raw, key: string, max: bigint): bigint {
  const v = raw[key]
  if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`Missing field: ${key}`)
  let n: bigint
  try {
    n = BigInt(v)
  } catch {
    throw new Error(`${key} must be a whole number`)
  }
  if (n < 0n || n > max) throw new Error(`${key} is out of range`)
  return n
}

/** Accepts either a flat object with a `signature` field, or `{ quote: {...}, signature }`. */
export function parseSignedQuote(text: string): SignedQuote {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('That is not valid JSON. Paste the full signed quote from Skjol.')
  }
  if (!isRaw(json)) throw new Error('Expected a JSON object.')
  const q: Raw = isRaw(json.quote) ? json.quote : json
  const sig = json.signature ?? q.signature
  if (typeof sig !== 'string' || !isHex(sig) || sig.length !== 132) {
    throw new Error('The signature must be a 65-byte hex string (0x followed by 130 characters).')
  }
  const beneficiary = q.beneficiary
  if (typeof beneficiary !== 'string' || !isAddress(beneficiary)) throw new Error('beneficiary must be a wallet address')

  const U64 = (1n << 64n) - 1n
  const U128 = (1n << 128n) - 1n
  const U32 = (1n << 32n) - 1n

  const quote: QuoteStruct = {
    quoteId: bytes32(q, 'quoteId'),
    policyId: bytes32(q, 'policyId'),
    beneficiary,
    vesselImo: Number(uint(q, 'vesselImo', U32)),
    voyageRefHash: bytes32(q, 'voyageRefHash'),
    destinationLocode: bytes32(q, 'destinationLocode', true),
    eventType: Number(uint(q, 'eventType', 255n)),
    earliestArrival: uint(q, 'earliestArrival', U64),
    agreedArrivalDeadline: uint(q, 'agreedArrivalDeadline', U64),
    delayThreshold: Number(uint(q, 'delayThreshold', U32)),
    premium: uint(q, 'premium', U128),
    payout: uint(q, 'payout', U128),
    termsHash: bytes32(q, 'termsHash'),
    purchaseCutoff: uint(q, 'purchaseCutoff', U64),
    quoteExpiry: uint(q, 'quoteExpiry', U64),
  }
  return { quote, signature: sig }
}
