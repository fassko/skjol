// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ShipmentDelayPool} from "../src/ShipmentDelayPool.sol";
import {ReceiverTemplate} from "../src/cre/ReceiverTemplate.sol";
import {IReceiver} from "../src/cre/IReceiver.sol";
import {LocalReportRelay} from "../src/test-support/LocalReportRelay.sol";
import {MockUSDC} from "../src/test-support/MockUSDC.sol";

/// USDC-style token that refuses transfers to blocklisted addresses.
contract BlocklistUSDC is MockUSDC {
  mapping(address => bool) public blocked;

  function setBlocked(address a, bool b) external {
    blocked[a] = b;
  }

  function _update(address from, address to, uint256 value) internal override {
    require(!blocked[from] && !blocked[to], "blocklisted");
    super._update(from, to, value);
  }
}

contract ShipmentDelayPoolTest is Test {
  BlocklistUSDC usdc;
  LocalReportRelay relay;
  ShipmentDelayPool pool;

  uint256 signerPk = 0xA11CE;
  address signer;
  address customer = makeAddr("customer");
  address lp = makeAddr("lp");

  uint128 constant PREMIUM = 25e6; // 25 USDC (6 decimals)
  uint128 constant PAYOUT = 500e6; // 500 USDC
  uint32 constant THRESHOLD = 24 hours;
  uint32 constant IMO = 9393266;
  bytes32 constant LOCODE = bytes32("FIHEL");
  bytes32 constant WORKFLOW_ID = keccak256("skjol-arrival-evaluator");

  uint64 t0;

  function setUp() public {
    vm.warp(1_800_000_000);
    t0 = uint64(block.timestamp);
    signer = vm.addr(signerPk);
    usdc = new BlocklistUSDC();
    relay = new LocalReportRelay();
    pool = new ShipmentDelayPool(
      address(relay), usdc, signer, 10_000e6, 6 hours, 1 hours, 30 days, "Skjol USDC Pool", "skjolUSDC"
    );

    pool.setExpectedWorkflowId(WORKFLOW_ID);

    usdc.mint(lp, 1_000e6);
    vm.startPrank(lp);
    usdc.approve(address(pool), type(uint256).max);
    pool.fund(1_000e6);
    vm.stopPrank();
    assertEq(pool.balanceOf(lp), 1_000e6);
    assertEq(pool.totalAssets(), 1_000e6);

    usdc.mint(customer, 1_000e6);
    vm.prank(customer);
    usdc.approve(address(pool), type(uint256).max);
  }

  // ------------------------------------------------------------- helpers
  function _quote(bytes32 id) internal view returns (ShipmentDelayPool.Quote memory q) {
    q = ShipmentDelayPool.Quote({
      quoteId: keccak256(abi.encode("quote", id)),
      policyId: id,
      beneficiary: customer,
      vesselImo: IMO,
      voyageRefHash: keccak256("VOY-123"),
      destinationLocode: LOCODE,
      eventType: 1,
      earliestArrival: t0,
      agreedArrivalDeadline: t0 + 10 days,
      delayThreshold: THRESHOLD,
      premium: PREMIUM,
      payout: PAYOUT,
      termsHash: keccak256("terms-v1"),
      purchaseCutoff: t0 + 2 days,
      quoteExpiry: t0 + 1 days
    });
  }

  function _sign(ShipmentDelayPool.Quote memory q, uint256 pk) internal view returns (bytes memory) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, pool.hashQuote(q));
    return abi.encodePacked(r, s, v);
  }

  function _buy(bytes32 id) internal returns (ShipmentDelayPool.Quote memory q) {
    q = _quote(id);
    bytes memory sig = _sign(q, signerPk);
    vm.prank(customer);
    pool.purchase(q, sig);
  }

  function _report(bytes32 id, uint64 arrival, uint64 observedAt) internal view returns (bytes memory) {
    return abi.encode(
      ShipmentDelayPool.ArrivalReport({
        version: 1,
        chainId: block.chainid,
        pool: address(pool),
        policyId: id,
        vesselImo: IMO,
        destinationLocode: LOCODE,
        eventType: 1,
        arrivalTime: arrival,
        observedAt: observedAt,
        evidenceDigest: keccak256(abi.encode(id, arrival)),
        sourceId: keccak256("digitraffic.port-call.v2")
      })
    );
  }

  function _deliver(bytes memory report) internal {
    relay.report(address(pool), _metadata(), report);
  }

  function _metadata() internal view returns (bytes memory) {
    return abi.encodePacked(WORKFLOW_ID, bytes10("skjol"), address(this));
  }

  function _addFunder(string memory name, uint256 amount) internal returns (address who) {
    who = makeAddr(name);
    usdc.mint(who, amount);
    vm.startPrank(who);
    usdc.approve(address(pool), type(uint256).max);
    pool.deposit(amount, who);
    vm.stopPrank();
  }

  function _redeemAll(address who) internal returns (uint256 got) {
    uint256 shares = pool.balanceOf(who);
    vm.prank(who);
    got = pool.redeem(shares, who, who);
  }

  // --------------------------------------------------- purchase & collateral
  function test_PurchaseLocksTermsAndReservesPayout() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    ShipmentDelayPool.Policy memory p = pool.getPolicy("P1");
    assertEq(uint8(p.status), uint8(ShipmentDelayPool.Status.Active));
    assertEq(p.beneficiary, customer);
    assertEq(p.payout, PAYOUT);
    assertEq(p.agreedArrivalDeadline, q.agreedArrivalDeadline);
    assertEq(p.termsHash, q.termsHash);
    assertEq(pool.totalReserved(), PAYOUT);
    assertEq(usdc.balanceOf(address(pool)), 1_000e6 + PREMIUM);
    assertEq(pool.availableCapital(), 1_000e6 + PREMIUM - PAYOUT);
  }

  function test_RejectsWhenCollateralExhausted() public {
    _buy("P1"); // available after: 525
    _buy("P2"); // 525 + 25 >= 500 -> available after: 50
    ShipmentDelayPool.Quote memory q = _quote("P3");
    bytes memory sig = _sign(q, signerPk);
    vm.prank(customer);
    vm.expectRevert(abi.encodeWithSelector(ShipmentDelayPool.InsufficientCollateral.selector, 50e6 + PREMIUM, PAYOUT));
    pool.purchase(q, sig);
  }

  function test_RedeemCappedByFreeCapital() public {
    _buy("P1");
    uint256 free = pool.availableCapital();
    uint256 maxAssets = pool.maxWithdraw(lp);
    // The sole funder keeps MIN_LIVE_SHARES while a payout is reserved.
    assertLt(maxAssets, free);
    assertApproxEqAbs(maxAssets, free - pool.exitValue(pool.MIN_LIVE_SHARES()), 2);
    vm.startPrank(lp);
    vm.expectRevert();
    pool.withdraw(free, lp, lp);
    uint256 before = usdc.balanceOf(lp);
    pool.withdraw(maxAssets, lp, lp);
    vm.stopPrank();
    assertEq(usdc.balanceOf(lp), before + maxAssets);
    assertGe(usdc.balanceOf(address(pool)), PAYOUT);
    assertGe(pool.totalSupply(), pool.MIN_LIVE_SHARES());
  }

  function test_FundMintsSharesAndPremiumRaisesNav() public {
    assertEq(pool.convertToAssets(1e6), 1e6);
    _buy("P1");
    // Premium added without minting shares → each share is worth more.
    uint256 assetsPerShare = pool.convertToAssets(1e6);
    assertGt(assetsPerShare, 1e6);
    uint256 sharesBefore = pool.totalSupply();
    address lp2 = makeAddr("lp2");
    usdc.mint(lp2, 100e6);
    vm.startPrank(lp2);
    usdc.approve(address(pool), type(uint256).max);
    uint256 minted = pool.deposit(100e6, lp2);
    vm.stopPrank();
    assertGt(minted, 0);
    assertLt(minted, 100e6); // paid a premium relative to pre-premium NAV
    assertEq(pool.totalSupply(), sharesBefore + minted);
  }

  function test_PayoutLowersShareNav() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint256 navBefore = pool.convertToAssets(pool.balanceOf(lp));
    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD + 1;
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    uint256 navAfter = pool.convertToAssets(pool.balanceOf(lp));
    assertLt(navAfter, navBefore);
  }

  // -------------------------------------------------------- quote validation
  function test_RejectsForgedQuoteSignature() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    bytes memory sig = _sign(q, 0xBAD);
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.InvalidQuoteSignature.selector);
    pool.purchase(q, sig);
  }

  function test_RejectsTamperedQuote() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    bytes memory sig = _sign(q, signerPk);
    q.payout = PAYOUT * 2; // customer edits the payout after signing
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.InvalidQuoteSignature.selector);
    pool.purchase(q, sig);
  }

  function test_RejectsExpiredQuote() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    bytes memory sig = _sign(q, signerPk);
    vm.warp(q.quoteExpiry + 1);
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.QuoteExpired.selector);
    pool.purchase(q, sig);
  }

  function test_RejectsAfterPurchaseCutoff() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    q.quoteExpiry = q.purchaseCutoff + 1 days; // quote still valid, but cutoff passed
    bytes memory sig = _sign(q, signerPk);
    vm.warp(q.purchaseCutoff + 1);
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.PurchaseCutoffPassed.selector);
    pool.purchase(q, sig);
  }

  function test_AcceptsExactlyAtCutoff() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    q.quoteExpiry = q.purchaseCutoff;
    bytes memory sig = _sign(q, signerPk);
    vm.warp(q.purchaseCutoff);
    vm.prank(customer);
    pool.purchase(q, sig);
  }

  function test_RejectsCutoffTooCloseToDeadline() public {
    ShipmentDelayPool.Quote memory q = _quote("P1");
    q.purchaseCutoff = q.agreedArrivalDeadline - 30 minutes; // minLeadTime is 1h
    bytes memory sig = _sign(q, signerPk);
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.InvalidQuoteTerms.selector);
    pool.purchase(q, sig);
  }

  function test_RejectsQuoteReuseAndNonBeneficiary() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    bytes memory sig = _sign(q, signerPk);
    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.QuoteAlreadyUsed.selector);
    pool.purchase(q, sig);

    ShipmentDelayPool.Quote memory q2 = _quote("P2");
    bytes memory sig2 = _sign(q2, signerPk);
    vm.prank(lp);
    vm.expectRevert(ShipmentDelayPool.NotBeneficiary.selector);
    pool.purchase(q2, sig2);
  }

  // ------------------------------------------------------- report authority
  function test_RejectsReportFromNonForwarder() public {
    _buy("P1");
    bytes memory r = _report("P1", t0 + 12 days, t0 + 12 days);
    vm.warp(t0 + 12 days);
    vm.expectRevert(abi.encodeWithSelector(ReceiverTemplate.InvalidSender.selector, address(this), address(relay)));
    pool.onReport(_metadata(), r);
  }

  function test_RejectsReportBoundToOtherChainOrContract() public {
    _buy("P1");
    vm.warp(t0 + 12 days);
    ShipmentDelayPool.ArrivalReport memory ar = abi.decode(_report("P1", t0 + 12 days, t0 + 12 days), (ShipmentDelayPool.ArrivalReport));
    ar.chainId = 1;
    vm.expectRevert(ShipmentDelayPool.InvalidReportBinding.selector);
    _deliver(abi.encode(ar));
    ar.chainId = block.chainid;
    ar.pool = address(0xBEEF);
    vm.expectRevert(ShipmentDelayPool.InvalidReportBinding.selector);
    _deliver(abi.encode(ar));
  }

  function test_RejectsMismatchedVesselOrPort() public {
    _buy("P1");
    vm.warp(t0 + 12 days);
    ShipmentDelayPool.ArrivalReport memory ar = abi.decode(_report("P1", t0 + 12 days, t0 + 12 days), (ShipmentDelayPool.ArrivalReport));
    ar.destinationLocode = bytes32("FITKU");
    vm.expectRevert(ShipmentDelayPool.EvidenceMismatch.selector);
    _deliver(abi.encode(ar));
  }

  function test_RejectsStaleAndImplausibleEvidence() public {
    _buy("P1");
    vm.warp(t0 + 12 days);
    // observed 7h ago (> 6h max age)
    vm.expectRevert();
    _deliver(_report("P1", t0 + 11 days, uint64(block.timestamp - 7 hours)));
    // arrival before sailing date (e.g. a stale 2015 ATA in source data)
    vm.expectRevert(ShipmentDelayPool.ImplausibleEvidence.selector);
    _deliver(_report("P1", t0 - 1, uint64(block.timestamp)));
    // arrival after observation
    vm.expectRevert(ShipmentDelayPool.ImplausibleEvidence.selector);
    _deliver(_report("P1", uint64(block.timestamp) + 1, uint64(block.timestamp)));
    // observation in the future
    vm.expectRevert(ShipmentDelayPool.ImplausibleEvidence.selector);
    _deliver(_report("P1", uint64(block.timestamp), uint64(block.timestamp) + 1 hours));
  }

  // ----------------------------------------------------- threshold boundaries
  function test_OnTimeArrivalClosesWithoutPayoutAndReleasesReserve() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline - 3 hours;
    vm.warp(arrival + 1 hours);
    uint256 before = usdc.balanceOf(customer);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    ShipmentDelayPool.Policy memory p = pool.getPolicy("P1");
    assertEq(uint8(p.status), uint8(ShipmentDelayPool.Status.ClosedNoPayout));
    assertEq(usdc.balanceOf(customer), before);
    assertEq(pool.totalReserved(), 0);
    assertEq(pool.availableCapital(), 1_000e6 + PREMIUM);
  }

  function test_ExactlyAtThresholdDoesNotPay() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD; // exactly 24h late: not MORE than 24h
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.ClosedNoPayout));
  }

  function test_OneSecondPastThresholdPaysFixedPayout() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD + 1;
    vm.warp(arrival + 10 minutes);
    uint256 before = usdc.balanceOf(customer);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    ShipmentDelayPool.Policy memory p = pool.getPolicy("P1");
    assertEq(uint8(p.status), uint8(ShipmentDelayPool.Status.PaidOut));
    assertEq(usdc.balanceOf(customer), before + PAYOUT);
    assertEq(pool.totalReserved(), 0);
    assertEq(p.recordedArrival, arrival);
  }

  // ------------------------------------------------------- replay prevention
  function test_DuplicateReportDoesNotPayTwice() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline + 2 days;
    vm.warp(arrival + 10 minutes);
    bytes memory r = _report("P1", arrival, uint64(block.timestamp));
    _deliver(r);
    uint256 afterFirst = usdc.balanceOf(customer);
    uint256 reservedAfterFirst = pool.totalReserved();

    vm.expectEmit(true, true, false, true, address(pool));
    emit ShipmentDelayPool.DuplicateReportIgnored("P1", keccak256(r), ShipmentDelayPool.Status.PaidOut);
    _deliver(r);
    // A different report (new observation) for a concluded policy is also ignored.
    _deliver(_report("P1", arrival + 1 hours, uint64(block.timestamp)));

    assertEq(usdc.balanceOf(customer), afterFirst);
    assertEq(pool.totalReserved(), reservedAfterFirst);
  }

  // --------------------------------------------------- missing evidence path
  function test_MissingEvidenceKeepsPolicyActiveUntilExplicitReview() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    vm.warp(q.agreedArrivalDeadline + THRESHOLD + 5 days);
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.Active));
    assertEq(pool.totalReserved(), PAYOUT);

    vm.expectRevert(ShipmentDelayPool.ReviewNotOpen.selector);
    pool.resolveByReview("P1", false, keccak256("no-evidence"));

    vm.warp(q.agreedArrivalDeadline + THRESHOLD + 30 days);
    vm.prank(customer);
    vm.expectRevert();
    pool.resolveByReview("P1", true, keccak256("x")); // not owner

    pool.resolveByReview("P1", false, keccak256("voyage-cancelled"));
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.ResolvedByReview));
    assertEq(pool.totalReserved(), 0);
  }

  // ------------------------------------------------------- simulation gate
  function test_SimulationOperatorGate() public {
    _buy("P1");
    address operator = makeAddr("simOperator");
    pool.setSimulationOperator(operator);
    vm.warp(t0 + 12 days);
    bytes memory r = _report("P1", t0 + 12 days - 1 hours, uint64(block.timestamp));
    vm.expectRevert(ShipmentDelayPool.SimulationOriginRejected.selector);
    _deliver(r);
    // Same call with the operator as tx.origin succeeds.
    vm.prank(address(this), operator);
    relay.report(address(pool), _metadata(), r);
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.PaidOut));
  }

  // ------------------------------------------------- report identity (fail closed)
  function test_RejectsReportsWithoutWorkflowIdentity() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD + 1;
    vm.warp(arrival + 10 minutes);
    pool.setExpectedWorkflowId(bytes32(0));
    vm.expectRevert(ShipmentDelayPool.ReportIdentityNotConfigured.selector);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));

    // A report from another workflow is rejected once the identity is set again.
    pool.setExpectedWorkflowId(WORKFLOW_ID);
    bytes memory other = abi.encodePacked(keccak256("other-workflow"), bytes10("x"), address(this));
    vm.expectRevert();
    relay.report(address(pool), other, _report("P1", arrival, uint64(block.timestamp)));

    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.PaidOut));
  }

  // ------------------------------------------------------ redeem-ahead (NAV)
  function test_FunderCannotExitAheadOfPayout() public {
    address lp2 = _addFunder("lp2", 1_000e6);
    ShipmentDelayPool.Quote memory q = _buy("P1");

    // lp exits while the policy is open: priced as if it pays out.
    uint256 lpShares = pool.balanceOf(lp);
    uint256 lpGot = _redeemAll(lp);

    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD + 1;
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));

    // lp2 stayed and absorbed the payout, yet gets at least as much per share.
    uint256 lp2Shares = pool.balanceOf(lp2);
    uint256 lp2Got = _redeemAll(lp2);
    assertGe(lp2Got * lpShares, lpGot * lp2Shares);
    // Together the funders got their capital plus premium minus payout.
    assertApproxEqAbs(lpGot + lp2Got, 2_000e6 + PREMIUM - PAYOUT, 2);
  }

  function test_ExitWhileOpenLeavesReserveToStayers() public {
    address lp2 = _addFunder("lp2", 1_000e6);
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint256 lpGot = _redeemAll(lp);
    // Exit value = share of (assets - reserved): (2025 - 500) / 2 = 762.5
    assertApproxEqAbs(lpGot, (2_000e6 + PREMIUM - PAYOUT) / 2, 2);

    // Policy closes on time: the released reserve goes to the funder who stayed.
    uint64 arrival = q.agreedArrivalDeadline - 1 hours;
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    uint256 lp2Got = _redeemAll(lp2);
    assertApproxEqAbs(lp2Got, 2_000e6 + PREMIUM - lpGot, 2);
  }

  function test_DepositJustBeforeReleaseIsNotProfitable() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint64 arrival = q.agreedArrivalDeadline - 1 hours;
    vm.warp(arrival + 5 minutes);
    // Deposit priced at gross assets; immediate exit is worth less than the deposit.
    address late = _addFunder("late", 1_000e6);
    assertLt(pool.exitValue(pool.balanceOf(late)), 1_000e6);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    // After the reserve is released the late funder gets back about what they put in, no windfall.
    uint256 got = _redeemAll(late);
    assertApproxEqAbs(got, 1_000e6, 2);
  }

  function test_LastFunderCannotLeaveReserveWithoutShareholders() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    uint256 shares = pool.balanceOf(lp);
    assertEq(pool.maxRedeem(lp), shares - pool.MIN_LIVE_SHARES());
    vm.prank(lp);
    vm.expectRevert();
    pool.redeem(shares, lp, lp);
    _redeemMax(lp);
    assertEq(pool.totalSupply(), pool.MIN_LIVE_SHARES());

    // The policy closes unpaid: the released reserve goes to the remaining shares, and new
    // deposits still mint shares at a fair price.
    uint64 arrival = q.agreedArrivalDeadline - 1 hours;
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));
    assertEq(pool.maxRedeem(lp), pool.MIN_LIVE_SHARES());
    address next = _addFunder("next", 100e6);
    assertGt(pool.balanceOf(next), 0);
    assertApproxEqAbs(pool.exitValue(pool.balanceOf(next)), 100e6, 1e3);
  }

  function _redeemMax(address who) internal returns (uint256 got) {
    uint256 shares = pool.maxRedeem(who);
    vm.prank(who);
    got = pool.redeem(shares, who, who);
  }

  // ------------------------------------------------------------ deposit guards
  function test_FirstDepositMinimumAndZeroShareDepositsRevert() public {
    ShipmentDelayPool fresh = new ShipmentDelayPool(
      address(relay), usdc, signer, 10_000e6, 6 hours, 1 hours, 30 days, "Skjol USDC Pool", "skjolUSDC"
    );
    address attacker = makeAddr("attacker");
    usdc.mint(attacker, 10_000e6);
    vm.startPrank(attacker);
    usdc.approve(address(fresh), type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(ShipmentDelayPool.FirstDepositTooSmall.selector, 1, 1e6));
    fresh.deposit(1, attacker);
    // Donation before any deposit: a victim's deposit that would mint 0 shares reverts instead.
    usdc.transfer(address(fresh), 5_000e6);
    vm.stopPrank();
    address victim = makeAddr("victim");
    usdc.mint(victim, 1_000e6);
    vm.startPrank(victim);
    usdc.approve(address(fresh), type(uint256).max);
    vm.expectRevert(ShipmentDelayPool.ZeroShares.selector);
    fresh.deposit(1_000e6, victim);
    vm.stopPrank();
    assertEq(usdc.balanceOf(victim), 1_000e6);
  }

  // -------------------------------------------------- blocklisted beneficiary
  function test_BlocklistedBeneficiaryPayoutIsOwedAndClaimable() public {
    ShipmentDelayPool.Quote memory q = _buy("P1");
    usdc.setBlocked(customer, true);
    uint64 arrival = q.agreedArrivalDeadline + THRESHOLD + 1;
    vm.warp(arrival + 10 minutes);
    _deliver(_report("P1", arrival, uint64(block.timestamp)));

    // The policy settles, the reserve is released, and the payout is held for the customer.
    assertEq(uint8(pool.getPolicy("P1").status), uint8(ShipmentDelayPool.Status.PaidOut));
    assertEq(pool.totalReserved(), 0);
    assertEq(pool.owedPayout(customer), PAYOUT);
    assertEq(pool.totalOwed(), PAYOUT);
    // Owed money is not pool capital.
    assertEq(pool.totalAssets(), 1_000e6 + PREMIUM - PAYOUT);
    assertEq(pool.availableCapital(), 1_000e6 + PREMIUM - PAYOUT);

    // The claim pays only the beneficiary, so the blocklist holds until the issuer lifts it.
    vm.prank(customer);
    vm.expectRevert();
    pool.claimPayout();
    assertEq(pool.owedPayout(customer), PAYOUT);

    usdc.setBlocked(customer, false);
    uint256 before = usdc.balanceOf(customer);
    vm.prank(customer);
    pool.claimPayout();
    assertEq(usdc.balanceOf(customer), before + PAYOUT);
    assertEq(pool.totalOwed(), 0);

    vm.prank(customer);
    vm.expectRevert(ShipmentDelayPool.NothingOwed.selector);
    pool.claimPayout();
  }

  // ------------------------------------------------------------- ownership
  function test_OwnershipTransferIsTwoStep() public {
    address next = makeAddr("nextOwner");
    pool.transferOwnership(next);
    assertEq(pool.owner(), address(this));
    vm.prank(makeAddr("someoneElse"));
    vm.expectRevert();
    pool.acceptOwnership();
    vm.prank(next);
    pool.acceptOwnership();
    assertEq(pool.owner(), next);
  }

  function test_SupportsReceiverInterface() public view {
    assertTrue(pool.supportsInterface(type(IReceiver).interfaceId));
  }
}

