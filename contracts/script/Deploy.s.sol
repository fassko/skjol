// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ShipmentDelayPool} from "../src/ShipmentDelayPool.sol";

/// Deploys ShipmentDelayPool to Arc Testnet and funds it with the settlement token.
/// Env: DEPLOYER_PRIVATE_KEY, QUOTE_SIGNER_ADDRESS, CRE_FORWARDER (default: Arc Testnet
/// MockKeystoneForwarder for `cre workflow simulate --broadcast`), POOL_FUNDING (6-dec units),
/// POOL_TOKEN (USDC|EURC), SHARE_NAME, SHARE_SYMBOL.
contract Deploy is Script {
  address constant ARC_USDC = 0x3600000000000000000000000000000000000000; // ERC-20 interface, 6 decimals
  address constant ARC_EURC = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
  address constant ARC_MOCK_FORWARDER = 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1; // CRE simulation

  function run() external {
    uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
    address deployer = vm.addr(pk);
    address signer = vm.envAddress("QUOTE_SIGNER_ADDRESS");
    address forwarder = vm.envOr("CRE_FORWARDER", ARC_MOCK_FORWARDER);
    address simOperator = vm.envOr("SIMULATION_OPERATOR", deployer);
    uint256 funding = vm.envOr("POOL_FUNDING", uint256(10e6));
    string memory tokenName = vm.envOr("POOL_TOKEN", string("USDC"));
    bool eurc = keccak256(bytes(tokenName)) == keccak256(bytes("EURC"));
    address settlement = eurc ? ARC_EURC : ARC_USDC;
    string memory shareName = vm.envOr("SHARE_NAME", eurc ? string("Skjol EURC Pool") : string("Skjol USDC Pool"));
    string memory shareSymbol = vm.envOr("SHARE_SYMBOL", eurc ? string("skjolEURC") : string("skjolUSDC"));

    vm.startBroadcast(pk);
    ShipmentDelayPool pool = new ShipmentDelayPool(
      forwarder,
      IERC20(settlement),
      signer,
      20e6, // max payout 20 units
      6 hours, // max evidence age
      60, // min lead time between purchase cutoff and deadline (seconds)
      30 days, // review delay before manual resolution of evidence-less policies
      shareName,
      shareSymbol
    );
    if (forwarder == ARC_MOCK_FORWARDER && simOperator != address(0)) {
      pool.setSimulationOperator(simOperator);
    }
    if (funding > 0) {
      IERC20(settlement).approve(address(pool), funding);
      pool.fund(funding);
    }
    vm.stopBroadcast();

    console2.log("pool", address(pool));
    console2.log("token", settlement);
    console2.log("shareSymbol", shareSymbol);
    console2.log("forwarder", forwarder);
    console2.log("quoteSigner", signer);
    console2.log("simulationOperator", pool.simulationOperator());
    console2.log("funded", funding);
    console2.log("shares", pool.balanceOf(deployer));
  }
}
