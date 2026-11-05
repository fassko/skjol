// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice LOCAL/TEST ONLY 6-decimal stand-in for USDC. Arc deployments use the real
///         USDC ERC-20 interface at 0x3600000000000000000000000000000000000000 (6 decimals).
contract MockUSDC is ERC20 {
  constructor() ERC20("Mock USDC (local test)", "mUSDC") {}

  function decimals() public pure override returns (uint8) {
    return 6;
  }

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
