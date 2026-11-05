// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReceiver} from "../cre/IReceiver.sol";

/// @title LocalReportRelay
/// @notice LOCAL DEVELOPMENT ONLY. Stands in for Chainlink's forwarder on a local Anvil chain so
///         the deterministic demo can exercise the exact `onReport` path. It performs NO DON
///         signature verification and must never be configured as a forwarder on a public network.
contract LocalReportRelay is Ownable {
  constructor() Ownable(msg.sender) {}

  function report(address receiver, bytes calldata metadata, bytes calldata rawReport) external onlyOwner {
    IReceiver(receiver).onReport(metadata, rawReport);
  }
}
