// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReceiverTemplate} from "./cre/ReceiverTemplate.sol";

/// @title ShipmentDelayPool
/// @notice Funded capital vault for parametric vessel-arrival delay protection.
///
/// Capital providers deposit the settlement token and receive transferable ERC-20
/// vault shares (ERC-4626). Premiums raise share NAV; claim payouts lower it.
/// Exits are priced as if every open policy pays out (balance minus reserved payouts), so a
/// funder cannot redeem ahead of a payout and leave it to the funders who stay. Deposits are
/// priced at gross assets, so nobody can buy in just before open reserves are released.
///
/// Insured event (exactly one): the RECORDED ARRIVAL of the named vessel (IMO) at the named
/// destination port (UN/LOCODE). The policy pays a fixed amount when the recorded arrival time is
/// MORE THAN `delayThreshold` seconds after the agreed arrival deadline. Vessel arrival is not
/// container discharge, customs release or delivery; none of those are insured.
///
/// Settlement evidence is accepted only through the Chainlink CRE receiver path
/// (`onReport`, gated by the configured forwarder and optional workflow identity checks).
/// Eligibility and payout are recomputed here from the locked policy terms; the report only
/// carries evidence (timestamps + digest), never a payout decision.
contract ShipmentDelayPool is ReceiverTemplate, ERC4626, EIP712, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Math for uint256;

  // ---------------------------------------------------------------- constants
  uint8 public constant EVENT_VESSEL_ARRIVAL_AT_PORT = 1;
  uint8 public constant REPORT_VERSION = 1;
  /// @notice Tolerated clock skew for evidence observed slightly "ahead" of the block time.
  uint64 public constant MAX_FUTURE_SKEW = 5 minutes;
  /// @notice Shares that must stay outstanding while any payout is reserved, so open reserves
  ///         always belong to someone. Also the minimum first deposit (in token units).
  uint256 public constant MIN_LIVE_SHARES = 1e6;

  bytes32 public constant QUOTE_TYPEHASH = keccak256(
    "Quote(bytes32 quoteId,bytes32 policyId,address beneficiary,uint32 vesselImo,bytes32 voyageRefHash,bytes32 destinationLocode,uint8 eventType,uint64 earliestArrival,uint64 agreedArrivalDeadline,uint32 delayThreshold,uint128 premium,uint128 payout,bytes32 termsHash,uint64 purchaseCutoff,uint64 quoteExpiry)"
  );

  // -------------------------------------------------------------------- types
  enum Status {
    None,
    Active,
    PaidOut,
    ClosedNoPayout,
    ResolvedByReview
  }

  struct Quote {
    bytes32 quoteId;
    bytes32 policyId;
    address beneficiary;
    uint32 vesselImo;
    bytes32 voyageRefHash; // keccak256 of the normalised voyage reference (plaintext stays offchain)
    bytes32 destinationLocode; // UN/LOCODE, left-aligned ASCII, e.g. "FIHEL"
    uint8 eventType;
    uint64 earliestArrival; // earliest plausible arrival (sailing date); older evidence is rejected
    uint64 agreedArrivalDeadline; // fixed contractual deadline; never changes with ETAs
    uint32 delayThreshold; // seconds; payout when arrival > deadline + threshold
    uint128 premium; // token units (USDC: 6 decimals)
    uint128 payout; // token units, fixed
    bytes32 termsHash; // hash of the human-readable policy wording
    uint64 purchaseCutoff;
    uint64 quoteExpiry;
  }

  struct Policy {
    address beneficiary;
    Status status;
    uint8 eventType;
    uint32 vesselImo;
    uint32 delayThreshold;
    uint64 earliestArrival;
    uint64 agreedArrivalDeadline;
    uint64 purchasedAt;
    uint64 settledAt;
    uint64 recordedArrival;
    uint128 premium;
    uint128 payout;
    bytes32 quoteId;
    bytes32 voyageRefHash;
    bytes32 destinationLocode;
    bytes32 termsHash;
    bytes32 settlementEvidence;
  }

  /// @notice ABI layout of a CRE report. Binds evidence to this chain, this contract and a policy.
  struct ArrivalReport {
    uint8 version;
    uint256 chainId;
    address pool;
    bytes32 policyId;
    uint32 vesselImo;
    bytes32 destinationLocode;
    uint8 eventType;
    uint64 arrivalTime; // recorded actual time of arrival (unix seconds)
    uint64 observedAt; // when the evidence was retrieved from the source (unix seconds)
    bytes32 evidenceDigest; // keccak256 of the canonical evidence record
    bytes32 sourceId; // keccak256 of the source identifier, e.g. "digitraffic.port-call.v2"
  }

  // ------------------------------------------------------------------ storage
  /// @notice Settlement token (same as ERC-4626 `asset()`). Kept for existing callers.
  IERC20 public immutable token;
  address public quoteSigner;
  uint64 public maxEvidenceAge; // seconds
  uint64 public minLeadTime; // seconds between purchase cutoff and agreed deadline
  uint64 public reviewDelay; // seconds after deadline+threshold before manual review may resolve
  uint128 public maxPayout;
  bool public purchasesPaused;
  /// @notice DEMO-ONLY gate for `cre workflow simulate --broadcast`: the simulation
  ///         MockKeystoneForwarder carries no workflow metadata, so when set, the transaction
  ///         origin must be this operator EOA. Must be address(0) with the production forwarder.
  address public simulationOperator;

  uint256 public totalReserved;
  /// @notice Payouts whose transfer failed (e.g. the beneficiary is blocklisted by the token).
  ///         Owed to the beneficiary, excluded from pool assets, claimable with `claimPayout`.
  uint256 public totalOwed;
  mapping(address => uint256) public owedPayout;
  mapping(bytes32 => Policy) private s_policies;
  mapping(bytes32 => bool) public quoteUsed;
  mapping(bytes32 => bool) public reportProcessed;

  // ------------------------------------------------------------------- events
  event PoolFunded(address indexed from, uint256 amount, uint256 shares);
  event PolicyPurchased(
    bytes32 indexed policyId,
    address indexed beneficiary,
    bytes32 indexed quoteId,
    uint32 vesselImo,
    bytes32 destinationLocode,
    uint64 agreedArrivalDeadline,
    uint32 delayThreshold,
    uint128 premium,
    uint128 payout,
    bytes32 termsHash
  );
  event EvidenceAccepted(
    bytes32 indexed policyId, bytes32 indexed evidenceDigest, uint64 arrivalTime, uint64 observedAt, bytes32 sourceId
  );
  event PolicyPaidOut(
    bytes32 indexed policyId, address indexed beneficiary, uint128 payout, uint64 arrivalTime, uint64 delaySeconds
  );
  event PolicyClosedNoPayout(bytes32 indexed policyId, uint64 arrivalTime, int64 delaySeconds);
  event PolicyResolvedByReview(bytes32 indexed policyId, bool paid, bytes32 reasonHash);
  event DuplicateReportIgnored(bytes32 indexed policyId, bytes32 indexed reportHash, Status status);
  event ReserveReleased(bytes32 indexed policyId, uint128 amount, uint256 totalReserved);
  event ConfigUpdated(bytes32 indexed key, uint256 value);
  event QuoteSignerUpdated(address indexed signer);
  event SimulationOperatorUpdated(address indexed operator);
  event PayoutDeferred(bytes32 indexed policyId, address indexed beneficiary, uint128 amount);
  event PayoutClaimed(address indexed beneficiary, uint256 amount);

  // ------------------------------------------------------------------- errors
  error NotBeneficiary();
  error QuoteExpired();
  error PurchaseCutoffPassed();
  error InvalidQuoteTerms();
  error QuoteAlreadyUsed();
  error PolicyExists();
  error InvalidQuoteSignature();
  error InsufficientCollateral(uint256 available, uint256 required);
  error PurchasesPaused();
  error UnknownPolicy();
  error InvalidReportBinding();
  error EvidenceMismatch();
  error ImplausibleEvidence();
  error StaleEvidence(uint64 observedAt, uint256 blockTime);
  error SimulationOriginRejected();
  error ReviewNotOpen();
  error PolicyNotActive();
  error ZeroAddress();
  error ReportIdentityNotConfigured();
  error NothingOwed();
  error ZeroShares();
  error FirstDepositTooSmall(uint256 assets, uint256 minimum);

  constructor(
    address forwarder,
    IERC20 token_,
    address quoteSigner_,
    uint128 maxPayout_,
    uint64 maxEvidenceAge_,
    uint64 minLeadTime_,
    uint64 reviewDelay_,
    string memory shareName,
    string memory shareSymbol
  )
    ReceiverTemplate(forwarder)
    ERC20(shareName, shareSymbol)
    ERC4626(token_)
    EIP712("SkjolShipmentDelayPool", "1")
  {
    if (address(token_) == address(0) || quoteSigner_ == address(0)) revert ZeroAddress();
    token = token_;
    quoteSigner = quoteSigner_;
    maxPayout = maxPayout_;
    maxEvidenceAge = maxEvidenceAge_;
    minLeadTime = minLeadTime_;
    reviewDelay = reviewDelay_;
  }

  // ---------------------------------------------------------------- liquidity
  /// @notice Deposit settlement tokens and mint vault shares to `msg.sender`.
  function fund(uint256 amount) external returns (uint256 shares) {
    shares = deposit(amount, msg.sender);
    emit PoolFunded(msg.sender, amount, shares);
  }

  /// @notice Gross pool assets: token balance minus payouts already owed to beneficiaries.
  ///         Used for deposits and mints.
  function totalAssets() public view override returns (uint256) {
    uint256 bal = token.balanceOf(address(this));
    return bal > totalOwed ? bal - totalOwed : 0;
  }

  /// @notice Capital not reserved for open policies or owed to beneficiaries. This is also the
  ///         exit value of the whole pool: withdrawals assume every open policy pays out.
  function availableCapital() public view returns (uint256) {
    uint256 gross = totalAssets();
    return gross > totalReserved ? gross - totalReserved : 0;
  }

  /// @notice Assets `shares` would receive on exit (worst case: all open policies pay).
  function exitValue(uint256 shares) public view returns (uint256) {
    return _toExitAssets(shares, Math.Rounding.Floor);
  }

  function maxWithdraw(address owner) public view override returns (uint256) {
    return _toExitAssets(maxRedeem(owner), Math.Rounding.Floor);
  }

  /// @dev While payouts are reserved, MIN_LIVE_SHARES must stay outstanding: the last funder
  ///      cannot leave a reserve with no shareholder to receive it if the policy closes unpaid.
  function maxRedeem(address owner) public view override returns (uint256) {
    if (availableCapital() == 0) return 0;
    uint256 bal = balanceOf(owner);
    if (totalReserved == 0) return bal;
    uint256 supply = totalSupply();
    uint256 redeemable = supply > MIN_LIVE_SHARES ? supply - MIN_LIVE_SHARES : 0;
    return bal < redeemable ? bal : redeemable;
  }

  function previewWithdraw(uint256 assets) public view override returns (uint256) {
    return _toExitShares(assets, Math.Rounding.Ceil);
  }

  function previewRedeem(uint256 shares) public view override returns (uint256) {
    return _toExitAssets(shares, Math.Rounding.Floor);
  }

  /// @dev Same virtual-offset formula as ERC4626, priced on `availableCapital()`.
  function _toExitAssets(uint256 shares, Math.Rounding rounding) private view returns (uint256) {
    return shares.mulDiv(availableCapital() + 1, totalSupply() + 10 ** _decimalsOffset(), rounding);
  }

  function _toExitShares(uint256 assets, Math.Rounding rounding) private view returns (uint256) {
    return assets.mulDiv(totalSupply() + 10 ** _decimalsOffset(), availableCapital() + 1, rounding);
  }

  function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
    return super.deposit(assets, receiver);
  }

  function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
    return super.mint(shares, receiver);
  }

  /// @dev Rejects deposits that would mint no shares (donation / inflation griefing), and a first
  ///      deposit smaller than MIN_LIVE_SHARES token units.
  function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
    if (shares == 0) revert ZeroShares();
    if (totalSupply() == 0 && assets < MIN_LIVE_SHARES) revert FirstDepositTooSmall(assets, MIN_LIVE_SHARES);
    super._deposit(caller, receiver, assets, shares);
  }

  function withdraw(uint256 assets, address receiver, address owner) public override nonReentrant returns (uint256) {
    return super.withdraw(assets, receiver, owner);
  }

  function redeem(uint256 shares, address receiver, address owner) public override nonReentrant returns (uint256) {
    return super.redeem(shares, receiver, owner);
  }

  // ------------------------------------------------------------------ quoting
  function hashQuote(Quote calldata q) public view returns (bytes32) {
    return _hashTypedDataV4(_quoteStructHash(q));
  }

  function _quoteStructHash(Quote calldata q) private pure returns (bytes32) {
    // Encoded in two halves to keep the stack shallow.
    bytes memory a = abi.encode(
      QUOTE_TYPEHASH,
      q.quoteId,
      q.policyId,
      q.beneficiary,
      q.vesselImo,
      q.voyageRefHash,
      q.destinationLocode,
      q.eventType
    );
    bytes memory b = abi.encode(
      q.earliestArrival,
      q.agreedArrivalDeadline,
      q.delayThreshold,
      q.premium,
      q.payout,
      q.termsHash,
      q.purchaseCutoff,
      q.quoteExpiry
    );
    return keccak256(bytes.concat(a, b));
  }

  // ----------------------------------------------------------------- purchase
  /// @notice Buy a policy from a quote signed by the underwriting backend.
  /// @dev Caller must be the beneficiary and must have approved `premium` to this contract.
  function purchase(Quote calldata q, bytes calldata signature) external nonReentrant returns (bytes32) {
    if (purchasesPaused) revert PurchasesPaused();
    if (msg.sender != q.beneficiary) revert NotBeneficiary();
    if (block.timestamp > q.quoteExpiry) revert QuoteExpired();
    if (block.timestamp > q.purchaseCutoff) revert PurchaseCutoffPassed();
    if (
      q.eventType != EVENT_VESSEL_ARRIVAL_AT_PORT || q.premium == 0 || q.payout == 0 || q.payout > maxPayout
        || q.delayThreshold == 0 || q.vesselImo == 0 || q.destinationLocode == bytes32(0)
        || q.earliestArrival >= q.agreedArrivalDeadline
        || uint256(q.purchaseCutoff) + minLeadTime > q.agreedArrivalDeadline
    ) revert InvalidQuoteTerms();
    if (quoteUsed[q.quoteId]) revert QuoteAlreadyUsed();
    if (s_policies[q.policyId].status != Status.None) revert PolicyExists();
    if (ECDSA.recover(hashQuote(q), signature) != quoteSigner) revert InvalidQuoteSignature();

    uint256 available = availableCapital();
    if (available + q.premium < q.payout) revert InsufficientCollateral(available + q.premium, q.payout);

    quoteUsed[q.quoteId] = true;
    totalReserved += q.payout;

    Policy storage p = s_policies[q.policyId];
    p.beneficiary = q.beneficiary;
    p.status = Status.Active;
    p.eventType = q.eventType;
    p.vesselImo = q.vesselImo;
    p.delayThreshold = q.delayThreshold;
    p.earliestArrival = q.earliestArrival;
    p.agreedArrivalDeadline = q.agreedArrivalDeadline;
    p.purchasedAt = uint64(block.timestamp);
    p.premium = q.premium;
    p.payout = q.payout;
    p.quoteId = q.quoteId;
    p.voyageRefHash = q.voyageRefHash;
    p.destinationLocode = q.destinationLocode;
    p.termsHash = q.termsHash;

    token.safeTransferFrom(msg.sender, address(this), q.premium);

    emit PolicyPurchased(
      q.policyId,
      q.beneficiary,
      q.quoteId,
      q.vesselImo,
      q.destinationLocode,
      q.agreedArrivalDeadline,
      q.delayThreshold,
      q.premium,
      q.payout,
      q.termsHash
    );
    return q.policyId;
  }

  // --------------------------------------------------------------- settlement
  function onReport(bytes calldata metadata, bytes calldata report) external override {
    // DEMO-ONLY: see `simulationOperator`. tx.origin is used deliberately and only as an
    // additional restriction while the simulation forwarder cannot authenticate workflows.
    // Fail closed: a report is only accepted when either the demo operator gate or a CRE
    // workflow identity check (id or author) is configured. A forwarder alone is not enough.
    if (simulationOperator != address(0)) {
      if (tx.origin != simulationOperator) revert SimulationOriginRejected();
    } else if (getExpectedWorkflowId() == bytes32(0) && getExpectedAuthor() == address(0)) {
      revert ReportIdentityNotConfigured();
    }
    _checkReportOrigin(metadata);
    _processReport(report);
  }

  function _processReport(bytes calldata rawReport) internal override nonReentrant {
    ArrivalReport memory r = abi.decode(rawReport, (ArrivalReport));
    if (r.version != REPORT_VERSION || r.chainId != block.chainid || r.pool != address(this)) {
      revert InvalidReportBinding();
    }

    Policy storage p = s_policies[r.policyId];
    if (p.status == Status.None) revert UnknownPolicy();

    bytes32 reportHash = keccak256(rawReport);
    if (p.status != Status.Active || reportProcessed[reportHash]) {
      // Duplicate or late report for an already-concluded policy: record it, change nothing.
      emit DuplicateReportIgnored(r.policyId, reportHash, p.status);
      return;
    }

    if (r.vesselImo != p.vesselImo || r.destinationLocode != p.destinationLocode || r.eventType != p.eventType) {
      revert EvidenceMismatch();
    }
    if (r.arrivalTime < p.earliestArrival || r.arrivalTime > r.observedAt) revert ImplausibleEvidence();
    if (r.observedAt > block.timestamp + MAX_FUTURE_SKEW) revert ImplausibleEvidence();
    if (block.timestamp > r.observedAt && block.timestamp - r.observedAt > maxEvidenceAge) {
      revert StaleEvidence(r.observedAt, block.timestamp);
    }

    reportProcessed[reportHash] = true;
    p.settledAt = uint64(block.timestamp);
    p.recordedArrival = r.arrivalTime;
    p.settlementEvidence = r.evidenceDigest;
    emit EvidenceAccepted(r.policyId, r.evidenceDigest, r.arrivalTime, r.observedAt, r.sourceId);

    // Eligibility is recomputed from locked terms: strictly MORE than the threshold late.
    uint256 lateBoundary = uint256(p.agreedArrivalDeadline) + p.delayThreshold;
    int64 delay = int64(r.arrivalTime) - int64(p.agreedArrivalDeadline);
    _releaseReserve(r.policyId, p.payout);

    if (r.arrivalTime > lateBoundary) {
      p.status = Status.PaidOut;
      _pay(r.policyId, p.beneficiary, p.payout);
      emit PolicyPaidOut(r.policyId, p.beneficiary, p.payout, r.arrivalTime, uint64(delay));
    } else {
      p.status = Status.ClosedNoPayout;
      emit PolicyClosedNoPayout(r.policyId, r.arrivalTime, delay);
    }
  }

  /// @dev Pays the beneficiary. If the token refuses the transfer (e.g. a blocklisted address),
  ///      the payout is owed instead, so the policy still settles and the reserve is released.
  function _pay(bytes32 policyId, address beneficiary, uint128 amount) private {
    if (!token.trySafeTransfer(beneficiary, amount)) {
      owedPayout[beneficiary] += amount;
      totalOwed += amount;
      emit PayoutDeferred(policyId, beneficiary, amount);
    }
  }

  /// @notice Claim a payout whose transfer failed. Pays only the beneficiary, so a token
  ///         blocklist is respected: a blocked address can claim once the issuer unblocks it.
  function claimPayout() external nonReentrant {
    uint256 amount = owedPayout[msg.sender];
    if (amount == 0) revert NothingOwed();
    owedPayout[msg.sender] = 0;
    totalOwed -= amount;
    token.safeTransfer(msg.sender, amount);
    emit PayoutClaimed(msg.sender, amount);
  }

  function _releaseReserve(bytes32 policyId, uint128 amount) private {
    totalReserved -= amount;
    emit ReserveReleased(policyId, amount, totalReserved);
  }

  /// @notice Manual resolution when no acceptable arrival evidence exists long after the
  ///         deadline (e.g. voyage cancelled or source permanently unavailable). Never automatic:
  ///         missing evidence keeps a policy Active until this explicit, logged decision.
  function resolveByReview(bytes32 policyId, bool pay, bytes32 reasonHash) external onlyOwner nonReentrant {
    Policy storage p = s_policies[policyId];
    if (p.status != Status.Active) revert PolicyNotActive();
    if (block.timestamp < uint256(p.agreedArrivalDeadline) + p.delayThreshold + reviewDelay) revert ReviewNotOpen();
    p.status = Status.ResolvedByReview;
    p.settledAt = uint64(block.timestamp);
    p.settlementEvidence = reasonHash;
    _releaseReserve(policyId, p.payout);
    if (pay) _pay(policyId, p.beneficiary, p.payout);
    emit PolicyResolvedByReview(policyId, pay, reasonHash);
  }

  // -------------------------------------------------------------------- views
  function getPolicy(bytes32 policyId) external view returns (Policy memory) {
    return s_policies[policyId];
  }

  // ------------------------------------------------------------------- admin
  function setQuoteSigner(address signer) external onlyOwner {
    if (signer == address(0)) revert ZeroAddress();
    quoteSigner = signer;
    emit QuoteSignerUpdated(signer);
  }

  function setSimulationOperator(address operator) external onlyOwner {
    simulationOperator = operator;
    emit SimulationOperatorUpdated(operator);
  }

  function setPurchasesPaused(bool paused) external onlyOwner {
    purchasesPaused = paused;
    emit ConfigUpdated("purchasesPaused", paused ? 1 : 0);
  }

  function setMaxEvidenceAge(uint64 v) external onlyOwner {
    maxEvidenceAge = v;
    emit ConfigUpdated("maxEvidenceAge", v);
  }

  function setMaxPayout(uint128 v) external onlyOwner {
    maxPayout = v;
    emit ConfigUpdated("maxPayout", v);
  }
}
