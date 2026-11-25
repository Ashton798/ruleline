// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";

interface IERC20Demo { function transfer(address to, uint256 amount) external returns (bool); }

/// @notice Demonstration vault only. Owner can withdraw deposited ERC-20 while unpaused.
contract TestVault is AbstractCallback {
    address public immutable owner;
    address public immutable asset;
    bool public paused;
    uint256 public lastSourceTx;
    uint256 public lastAmount;
    event VaultPaused(address indexed reactive, bytes32 indexed sourceTx, uint256 amount);
    event VaultResumed();
    event Withdrawn(address indexed to, uint256 amount);
    constructor(IPayable proxy_, address reactive_, address asset_) payable AbstractCallback(proxy_, reactive_) {
        require(address(proxy_) != address(0) && reactive_ != address(0) && asset_ != address(0), "zero address");
        owner = msg.sender;
        asset = asset_;
    }
    function pauseByRule(address reactive_, uint256 sourceTx_, uint256 amount_)
        external onlyServiceProvider onlyCallbackSender(reactive_)
    {
        paused = true;
        lastSourceTx = sourceTx_;
        lastAmount = amount_;
        emit VaultPaused(reactive_, bytes32(sourceTx_), amount_);
    }
    function withdraw(address to, uint256 amount) external {
        require(msg.sender == owner, "owner only");
        require(!paused, "vault paused");
        require(to != address(0), "zero address");
        emit Withdrawn(to, amount);
        require(IERC20Demo(asset).transfer(to, amount), "transfer failed");
    }
    function resume() external {
        require(msg.sender == owner, "owner only");
        paused = false;
        emit VaultResumed();
    }
}
