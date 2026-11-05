import { parseAbi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id

/**
 * The one place the deployed pool is configured. Set both after deploying
 * ShipmentDelayPool. Leave POOL_ADDRESS undefined until then: the app shows a
 * "not deployed yet" state instead of guessing.
 */
export const POOL_ADDRESS: Address | undefined = '0xa7505609b6c380c3f87940db151ef4a5437f70c0'
/** Block the pool was deployed at. Policy history is read from here, never from block 0. */
export const POOL_DEPLOY_BLOCK: bigint | undefined = 70874549n

export const SKJOL_APP_URL = 'https://skjol-insurance.vercel.app'

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address
export const EXPLORER_BASE = requireChain(CHAIN_ID).explorerBase

export const addressUrl = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)
export const txUrl = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)

export const poolAbi = parseAbi([
  'struct Quote { bytes32 quoteId; bytes32 policyId; address beneficiary; uint32 vesselImo; bytes32 voyageRefHash; bytes32 destinationLocode; uint8 eventType; uint64 earliestArrival; uint64 agreedArrivalDeadline; uint32 delayThreshold; uint128 premium; uint128 payout; bytes32 termsHash; uint64 purchaseCutoff; uint64 quoteExpiry; }',
  'struct Policy { address beneficiary; uint8 status; uint8 eventType; uint32 vesselImo; uint32 delayThreshold; uint64 earliestArrival; uint64 agreedArrivalDeadline; uint64 purchasedAt; uint64 settledAt; uint64 recordedArrival; uint128 premium; uint128 payout; bytes32 quoteId; bytes32 voyageRefHash; bytes32 destinationLocode; bytes32 termsHash; bytes32 settlementEvidence; }',
  'function fund(uint256 amount) returns (uint256 shares)',
  'function deposit(uint256 assets, address receiver) returns (uint256)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function purchase(Quote q, bytes signature) returns (bytes32)',
  'function hashQuote(Quote q) view returns (bytes32)',
  'function getPolicy(bytes32 policyId) view returns (Policy)',
  'function availableCapital() view returns (uint256)',
  'function totalReserved() view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function exitValue(uint256 shares) view returns (uint256)',
  'function owedPayout(address account) view returns (uint256)',
  'function totalOwed() view returns (uint256)',
  'function claimPayout()',
  'function MIN_LIVE_SHARES() view returns (uint256)',
  'function acceptOwnership()',
  'function maxRedeem(address owner) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  'function quoteSigner() view returns (address)',
  'function quoteUsed(bytes32 quoteId) view returns (bool)',
  'function maxPayout() view returns (uint128)',
  'function purchasesPaused() view returns (bool)',
  'event PolicyPurchased(bytes32 indexed policyId, address indexed beneficiary, bytes32 indexed quoteId, uint32 vesselImo, bytes32 destinationLocode, uint64 agreedArrivalDeadline, uint32 delayThreshold, uint128 premium, uint128 payout, bytes32 termsHash)',
  'event PolicyPaidOut(bytes32 indexed policyId, address indexed beneficiary, uint128 payout, uint64 arrivalTime, uint64 delaySeconds)',
  'event PolicyClosedNoPayout(bytes32 indexed policyId, uint64 arrivalTime, int64 delaySeconds)',
  'event PolicyResolvedByReview(bytes32 indexed policyId, bool paid, bytes32 reasonHash)',
  'error NotBeneficiary()',
  'error QuoteExpired()',
  'error PurchaseCutoffPassed()',
  'error InvalidQuoteTerms()',
  'error QuoteAlreadyUsed()',
  'error PolicyExists()',
  'error InvalidQuoteSignature()',
  'error InsufficientCollateral(uint256 available, uint256 required)',
  'error PurchasesPaused()',
  'error NothingOwed()',
  'error ZeroShares()',
  'error FirstDepositTooSmall(uint256 assets, uint256 minimum)',
  'error ERC4626ExceededMaxDeposit(address receiver, uint256 assets, uint256 max)',
  'error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
])

export const STATUS_LABELS = ['None', 'Active', 'PaidOut', 'ClosedNoPayout', 'ResolvedByReview'] as const
export type PolicyStatus = (typeof STATUS_LABELS)[number]
