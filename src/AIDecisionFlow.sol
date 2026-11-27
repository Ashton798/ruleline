// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {TestVault} from "./TestVault.sol";

/// @notice Testnet-only decision inbox. The model never has signing authority.
contract AIDecisionGate is AbstractCallback {
    uint8 public constant SKIP = 0;
    uint8 public constant PAUSE_TEST_VAULT = 1;
    struct Request { uint256 amount; uint64 deadline; bool exists; bool resolved; }
    address public immutable owner;
    address public immutable agent;
    uint256 public immutable maxObservedAmount;
    uint256 public immutable maxPauseDecisions;
    uint64 public immutable decisionWindow;
    uint256 public pauseDecisions;
    uint256 public latestSourceTx;
    bool public disabled;
    mapping(uint256 => Request) public requests;
    mapping(uint256 => bool) public pauseAuthorized;
    event DecisionNeeded(uint256 indexed sourceTx, uint256 amount, uint64 deadline);
    event DecisionAccepted(uint256 indexed sourceTx, uint256 amount, uint8 action, uint64 deadline);
    event RequestCancelled(uint256 indexed sourceTx);
    event Disabled();

    constructor(IPayable proxy, address observer, address agent_, uint256 maxAmount, uint256 maxPauses, uint64 window)
        payable AbstractCallback(proxy, observer)
    {
        require(address(proxy) != address(0) && observer != address(0) && agent_ != address(0), "zero address");
        require(maxAmount > 0 && maxPauses > 0 && window > 0 && window <= 1 days, "invalid limits");
        owner = msg.sender; agent = agent_; maxObservedAmount = maxAmount; maxPauseDecisions = maxPauses; decisionWindow = window;
    }
    function requestDecision(address reactive, uint256 sourceTx, uint256 amount)
        external onlyServiceProvider onlyCallbackSender(reactive)
    {
        require(!disabled && sourceTx != 0 && amount > 0 && !requests[sourceTx].exists, "invalid request");
        uint64 deadline = uint64(block.timestamp + decisionWindow);
        requests[sourceTx] = Request(amount, deadline, true, false);
        latestSourceTx = sourceTx;
        emit DecisionNeeded(sourceTx, amount, deadline);
    }
    /// @dev Only the fixed agent account or owner can submit. Action 0 is a no-op.
    function submitDecision(uint256 sourceTx, uint8 action) external {
        require(msg.sender == agent || msg.sender == owner, "not authorized");
        Request storage r = requests[sourceTx];
        require(!disabled && r.exists && !r.resolved && block.timestamp <= r.deadline, "unavailable request");
        require(action == SKIP || action == PAUSE_TEST_VAULT, "action not allowed");
        if (action == PAUSE_TEST_VAULT) {
            require(r.amount <= maxObservedAmount && pauseDecisions < maxPauseDecisions, "limit exceeded");
            pauseDecisions++;
            pauseAuthorized[sourceTx] = true;
        }
        r.resolved = true;
        emit DecisionAccepted(sourceTx, r.amount, action, r.deadline);
    }
    function cancelRequest(uint256 sourceTx) external {
        require(msg.sender == owner && requests[sourceTx].exists && !requests[sourceTx].resolved, "cannot cancel");
        requests[sourceTx].resolved = true; emit RequestCancelled(sourceTx);
    }
    function disable() external { require(msg.sender == owner, "owner only"); disabled = true; emit Disabled(); }

    function canExecutePause(uint256 sourceTx, uint256 amount) external view returns (bool) {
        Request storage request = requests[sourceTx];
        return !disabled && pauseAuthorized[sourceTx] && request.amount == amount && block.timestamp <= request.deadline;
    }
}

/// @notice Rechecks the authorization on Sepolia when the second callback arrives.
contract AIDecisionVault is TestVault {
    AIDecisionGate public immutable decisionGate;

    constructor(IPayable proxy, address relay, address asset_, AIDecisionGate gate)
        payable TestVault(proxy, relay, asset_)
    {
        require(address(gate).code.length > 0, "invalid gate");
        decisionGate = gate;
    }

    function pauseByRule(address reactive, uint256 sourceTx, uint256 amount)
        public override onlyServiceProvider onlyCallbackSender(reactive)
    {
        require(decisionGate.canExecutePause(sourceTx, amount), "pause not authorized");
        super.pauseByRule(reactive, sourceTx, amount);
    }
}

/// @notice Routes only the gate's whitelisted decision event to a fixed vault.
contract AIDecisionRelay is AbstractReactive {
    uint256 public constant SEPOLIA = 11155111;
    uint256 public constant DECISION = uint256(keccak256("DecisionAccepted(uint256,uint256,uint8,uint64)"));
    address public immutable owner;
    address public immutable gate;
    address public vault;
    mapping(uint256 => bool) public processed;
    event PauseCallbackRequested(uint256 indexed sourceTx, address indexed vault, uint256 amount);
    constructor(address gate_) payable {
        require(gate_ != address(0), "zero gate"); owner = msg.sender; gate = gate_;
        SYSTEM.subscribe(SEPOLIA, gate_, DECISION, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }
    function setVault(address vault_) external {
        require(msg.sender == owner && vault == address(0) && vault_ != address(0), "invalid vault"); vault = vault_;
    }
    function react(LogRecord calldata l) external override onlySystem {
        if (l.chainId != SEPOLIA || l.contractAddress != gate || l.topic0 != DECISION || l.opCode != 2 || l.data.length != 96 || vault == address(0)) return;
        (uint256 amount, uint8 action, uint64 deadline) = abi.decode(l.data, (uint256,uint8,uint64));
        if (action != 1 || l.topic1 == 0 || processed[l.topic1] || block.timestamp > deadline) return;
        processed[l.topic1] = true;
        bytes memory payload = abi.encodeWithSignature("pauseByRule(address,uint256,uint256)", address(0), l.topic1, amount);
        emit PauseCallbackRequested(l.topic1, vault, amount);
        SYSTEM.requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0({chainId:SEPOLIA, recipient:vault, gasLimit:1000000, payload:payload}));
    }
}

/// @notice Listens once for a matching transfer and requests an AI decision, not an immediate vault pause.
contract AIEventObserver is AbstractReactive {
    uint256 public constant SEPOLIA = 11155111;
    uint256 public constant TRANSFER = uint256(keccak256("Transfer(address,address,uint256)"));
    address public immutable owner;
    address public immutable token;
    address public immutable sender;
    uint256 public immutable threshold;
    address public gate;
    bool public triggered;
    constructor(address token_, address sender_, uint256 threshold_) payable {
        require(token_ != address(0) && sender_ != address(0) && threshold_ > 0, "invalid rule");
        owner=msg.sender; token=token_; sender=sender_; threshold=threshold_;
        SYSTEM.subscribe(SEPOLIA,token_,TRANSFER,uint256(uint160(sender_)),REACTIVE_IGNORE,REACTIVE_IGNORE);
    }
    function setGate(address gate_) external {
        require(msg.sender==owner && gate==address(0) && gate_!=address(0), "invalid gate"); gate=gate_;
    }
    function react(LogRecord calldata l) external override onlySystem {
        if (triggered || gate==address(0) || l.chainId!=SEPOLIA || l.contractAddress!=token || l.topic0!=TRANSFER || l.topic1!=uint256(uint160(sender)) || l.topic2>type(uint160).max || l.opCode!=3 || l.data.length!=32 || l.txHash==0) return;
        uint256 amount=abi.decode(l.data,(uint256)); if (amount<threshold) return;
        triggered=true;
        SYSTEM.unsubscribe(SEPOLIA,token,TRANSFER,uint256(uint160(sender)),REACTIVE_IGNORE,REACTIVE_IGNORE);
        bytes memory payload=abi.encodeWithSignature("requestDecision(address,uint256,uint256)",address(0),l.txHash,amount);
        SYSTEM.requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0({chainId:SEPOLIA,recipient:gate,gasLimit:1000000,payload:payload}));
    }
}
