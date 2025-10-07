// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault
 * @notice Minimal proxy-compatible vault that receives donations per order and splits them between
 *         the streamer treasury and the platform fee treasury. Only the designated owner can sweep funds.
 */
contract Vault {
    using SafeERC20 for IERC20;

    error AlreadyInitialized();
    error InvalidAddress();
    error InvalidFee();
    error NotOwner();
    error InsufficientBalance();
    error NoPayout();

    event Swept(address indexed caller, address indexed token, uint256 amount, uint256 feeAmount);

    address public owner;
    address public treasury;
    address public feeTreasury;
    uint256 public feeAmount;

    bool private _initialized;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Initializes proxy storage after deployment via clone.
    function initialize(
        address owner_,
        address treasury_,
        address feeTreasury_,
        uint256 feeAmount_
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (owner_ == address(0) || treasury_ == address(0) || feeTreasury_ == address(0)) revert InvalidAddress();
        if (feeAmount_ == 0) revert InvalidFee();

        owner = owner_;
        treasury = treasury_;
        feeTreasury = feeTreasury_;
        feeAmount = feeAmount_;

        _initialized = true;
    }

    /// @notice Sweeps the entire balance of `token`, sending a fixed fee to `feeTreasury` and the rest to `treasury`.
    function sweep(address token) external onlyOwner {
        IERC20 erc20 = IERC20(token);
        uint256 balance = erc20.balanceOf(address(this));
        uint256 fee = feeAmount;

        if (balance < fee) revert InsufficientBalance();

        uint256 streamerAmount = balance - fee;
        if (streamerAmount == 0) revert NoPayout();

        erc20.safeTransfer(feeTreasury, fee);
        erc20.safeTransfer(treasury, streamerAmount);

        emit Swept(msg.sender, token, balance, fee);
    }
}
