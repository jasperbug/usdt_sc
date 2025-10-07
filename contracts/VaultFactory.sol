// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {Vault} from "./Vault.sol";

/**
 * @title VaultFactory
 * @notice Deploys deterministic minimal proxy vaults for each donation order using CREATE2.
 */
contract VaultFactory {
    error VaultAlreadyDeployed(bytes32 salt);
    error InvalidFee();

    event VaultDeployed(
        address indexed vault,
        bytes32 indexed salt,
        address indexed owner,
        address treasury,
        address feeTreasury,
        uint256 feeAmount
    );

    address public immutable implementation;
    uint256 public immutable feeAmount;

    mapping(bytes32 => address) public vaultForSalt;

    constructor(uint256 feeAmount_) {
        if (feeAmount_ == 0) revert InvalidFee();
        implementation = address(new Vault());
        feeAmount = feeAmount_;
    }

    /// @notice Deterministically deploys a new vault for the provided order id.
    function deployVault(
        string calldata orderId,
        address owner,
        address treasury,
        address feeTreasury
    ) external returns (address vault) {
        bytes32 salt = _salt(orderId);
        if (vaultForSalt[salt] != address(0)) revert VaultAlreadyDeployed(salt);

        vault = Clones.cloneDeterministic(implementation, salt);
        Vault(vault).initialize(owner, treasury, feeTreasury, feeAmount);
        vaultForSalt[salt] = vault;

        emit VaultDeployed(vault, salt, owner, treasury, feeTreasury, feeAmount);
    }

    /// @notice Predicts the vault address for an order id without deploying it.
    function getPredicted(string calldata orderId) external view returns (address) {
        bytes32 salt = _salt(orderId);
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    /// @notice Computes the salt used for CREATE2 from the order id string.
    function getSalt(string calldata orderId) external pure returns (bytes32) {
        return _salt(orderId);
    }

    function _salt(string calldata orderId) private pure returns (bytes32) {
        return keccak256(bytes(orderId));
    }
}
