// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShipmentDelayPool} from "../src/ShipmentDelayPool.sol";

/// Deploys ShipmentDelayPool to Arc Testnet and funds it with test USDC.
/// Env: DEPLOYER_PRIVATE_KEY, QUOTE_SIGNER_ADDRESS, CRE_FORWARDER (default: Arc Testnet
/// MockKeystoneForwarder for `cre workflow simulate --broadcast`), POOL_FUNDING (6-dec units).
contract Deploy is Script {
  address constant ARC_USDC = 0x3600000000000000000000000000000000000000; // ERC-20 interface, 6 decimals
  address constant ARC_MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1; // CRE simulation

  function run() external {
    uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
    address deployer = vm.addr(pk);
    address signer = vm.envAddress("QUOTE_SIGNER_ADDRESS");
    address forwarder = vm.envOr("CRE_FORWARDER", ARC_MOCK_FORWARDER);
    address simOperator = vm.envOr("SIMULATION_OPERATOR", deployer);
    uint256 funding = vm.envOr("POOL_FUNDING", uint256(10e6));

    vm.startBroadcast(pk);
    ShipmentDelayPool pool = new ShipmentDelayPool(
      forwarder,
      IERC20(ARC_USDC),
      signer,
      20e6, // max payout 20 USDC
      6 hours, // max evidence age
      60, // min lead time between purchase cutoff and deadline (seconds)
      30 days // review delay before manual resolution of evidence-less policies
    );
    if (forwarder == ARC_MOCK_FORWARDER && simOperator != address(0)) {
      pool.setSimulationOperator(simOperator);
    }
    if (funding > 0) {
      IERC20(ARC_USDC).approve(address(pool), funding);
      pool.fund(funding);
    }
    vm.stopBroadcast();

    console2.log("pool", address(pool));
    console2.log("forwarder", forwarder);
    console2.log("quoteSigner", signer);
    console2.log("simulationOperator", pool.simulationOperator());
    console2.log("funded", funding);
  }
}
