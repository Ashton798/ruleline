// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @notice A one-shot testnet rule: a specific sender's ERC-20 transfer at or above the threshold requests a pause.
contract RuleMonitor is AbstractReactive {
    uint256 public constant SEPOLIA = 11155111;
    uint256 public constant TRANSFER = uint256(keccak256("Transfer(address,address,uint256)"));
    address public immutable owner;
    address public immutable token;
    address public immutable watchedSender;
    uint256 public immutable threshold;
    address public recipient;
    bool public triggered;
    uint256 public lastAmount;
    uint256 public lastSourceTx;
    uint256 public lastReactBlock;
    event TransferChecked(bytes32 indexed sourceTx, uint256 amount, bool meetsThreshold);
    event PauseRequested(bytes32 indexed sourceTx, address indexed vault, uint256 amount);
    event RecipientSet(address indexed vault);

    constructor(address token_, address sender_, uint256 threshold_) payable {
        require(token_ != address(0) && sender_ != address(0) && threshold_ > 0, "invalid rule");
        owner = msg.sender;
        token = token_;
        watchedSender = sender_;
        threshold = threshold_;
        SYSTEM.subscribe(SEPOLIA, token_, TRANSFER, uint256(uint160(sender_)), REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function setRecipient(address vault_) external {
        require(msg.sender == owner, "owner only");
        require(vault_ != address(0) && recipient == address(0), "already set or zero");
        recipient = vault_;
        emit RecipientSet(vault_);
    }

    function react(LogRecord calldata l) external override onlySystem {
        if (triggered || l.chainId != SEPOLIA || l.contractAddress != token || l.topic0 != TRANSFER ||
            l.topic1 != uint256(uint160(watchedSender)) || l.topic2 > type(uint160).max ||
            l.opCode != 3 || l.data.length != 32) return;
        uint256 amount = abi.decode(l.data, (uint256));
        lastAmount = amount;
        lastSourceTx = l.txHash;
        lastReactBlock = block.number;
        bool matched = amount >= threshold;
        emit TransferChecked(bytes32(l.txHash), amount, matched);
        if (!matched || recipient == address(0)) return;
        triggered = true;
        SYSTEM.unsubscribe(SEPOLIA, token, TRANSFER, uint256(uint160(watchedSender)), REACTIVE_IGNORE, REACTIVE_IGNORE);
        bytes memory payload = abi.encodeWithSignature("pauseByRule(address,uint256,uint256)", address(0), l.txHash, amount);
        emit PauseRequested(bytes32(l.txHash), recipient, amount);
        SYSTEM.requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0({
            chainId: SEPOLIA, recipient: recipient, gasLimit: 1000000, payload: payload
        }));
    }
}
