// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IReceiver} from "../../cre/IReceiver.sol";

/// @notice Test-only stand-in for the Chainlink CRE forwarder. Passes reports straight to a receiver.
contract LocalReportRelay {
  function report(address receiver, bytes calldata metadata, bytes calldata reportData) external {
    IReceiver(receiver).onReport(metadata, reportData);
  }
}
