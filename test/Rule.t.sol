// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;
import {Test} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {RuleMonitor} from "../src/RuleMonitor.sol";
import {TestVault} from "../src/TestVault.sol";

contract MockSystem {
    uint256 public count;
    uint256 public removed;
    uint256 public senderTopic;
    bool public failUnsubscribe;
    bool public failRequest;
    function setFailures(bool unsubscribe_, bool request_) external {failUnsubscribe = unsubscribe_; failRequest = request_;}
    ISystemContract.CallbackConfiguration_V_1_0 private request;
    function subscribe(uint256, address, uint256, uint256 sender_, uint256, uint256) external {senderTopic = sender_;}
    function unsubscribe(uint256, address, uint256, uint256, uint256, uint256) external {require(!failUnsubscribe, "unsubscribe failed"); removed++;}
    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory c) external {require(!failRequest, "request failed"); count++;request=c;}
    function getRequest() external view returns (ISystemContract.CallbackConfiguration_V_1_0 memory) {return request;}
    function debt(address) external pure returns(uint256) {return 0;}
}
contract MockProxy {
    function debt(address) external pure returns(uint256) {return 0;}
    function deliver(address vault, address reactive, bytes memory payload) external returns (bool ok) {
        assembly {mstore(add(payload, 36), reactive)}
        (ok,) = vault.call(payload);
    }
}
contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amount) external {balanceOf[to] += amount;}
    function transfer(address to, uint256 amount) external returns(bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}
contract RuleTest is Test {
    address constant SYSTEM = 0x8888888888888888888888888888888888888888;
    address constant SENDER = address(0x1234);
    MockSystem system;
    MockProxy proxy;
    MockToken token;
    RuleMonitor monitor;
    TestVault vault;
    function setUp() public {
        MockSystem mock = new MockSystem(); vm.etch(SYSTEM, address(mock).code); system = MockSystem(SYSTEM);
        proxy = new MockProxy(); token = new MockToken();
        monitor = new RuleMonitor(address(token), SENDER, 10 ether);
        vault = new TestVault(IPayable(payable(address(proxy))), address(monitor), address(token));
        monitor.setRecipient(address(vault)); token.mint(address(vault), 100 ether);
    }
    function record(uint256 amount) internal view returns (IReactive.LogRecord memory l) {
        l.chainId=11155111; l.contractAddress=address(token); l.topic0=uint256(keccak256("Transfer(address,address,uint256)"));
        l.topic1=uint256(uint160(SENDER)); l.topic2=uint256(uint160(address(0x5678)));
        l.data=abi.encode(amount); l.opCode=3; l.txHash=0xabc;
    }
    function test_subscriptionFiltersSender() public view {assertEq(system.senderTopic(), uint256(uint160(SENDER)));}
    function test_onlySystem() public {vm.expectRevert(); monitor.react(record(10 ether));}
    function test_belowThreshold() public {vm.prank(SYSTEM); monitor.react(record(9 ether)); assertEq(system.count(),0); assertFalse(vault.paused());}
    function test_unrelatedSenderIgnored() public {IReactive.LogRecord memory l=record(10 ether); l.topic1=8; vm.prank(SYSTEM); monitor.react(l); assertEq(system.count(),0);}
    function test_happyPathPausesAndStopsWithdrawals() public {
        vm.prank(SYSTEM); monitor.react(record(10 ether));
        assertEq(system.count(),1); assertEq(system.removed(),1); assertTrue(monitor.triggered());
        ISystemContract.CallbackConfiguration_V_1_0 memory c=system.getRequest();
        assertEq(c.chainId,11155111); assertEq(c.recipient,address(vault)); assertEq(c.gasLimit,1000000);
        assertEq(c.payload, abi.encodeWithSignature("pauseByRule(address,uint256,uint256)",address(0),uint256(0xabc),10 ether));
        assertTrue(proxy.deliver(address(vault),address(monitor),c.payload));
        assertTrue(vault.paused()); assertEq(vault.lastSourceTx(),0xabc); assertEq(vault.lastAmount(),10 ether);
        vm.expectRevert(bytes("vault paused")); vault.withdraw(address(this),1 ether);
        vault.resume(); vault.withdraw(address(this),1 ether); assertEq(token.balanceOf(address(this)),1 ether);
        vm.prank(SYSTEM); monitor.react(record(15 ether)); assertEq(system.count(),1);
        assertEq(system.removed(),1); assertEq(monitor.lastAmount(),10 ether); assertEq(monitor.lastSourceTx(),0xabc);
    }
    function test_callbackRejectsDirectCaller() public {vm.expectRevert(); vault.pauseByRule(address(monitor),1,10 ether);}
    function test_duplicateCallbackCannotPauseAgainAfterResume() public {
        bytes memory payload = abi.encodeWithSignature("pauseByRule(address,uint256,uint256)", address(0), 0xabc, 10 ether);
        assertTrue(proxy.deliver(address(vault), address(monitor), payload));
        vault.resume();
        assertFalse(proxy.deliver(address(vault), address(monitor), payload));
        assertFalse(vault.paused());
    }
    function test_withdrawalLimitsAndAccounting() public {
        vm.expectRevert(bytes("per withdrawal limit")); vault.withdraw(address(this), 11 ether);
        assertEq(vault.totalWithdrawn(), 0);
        for (uint256 i = 0; i < 5; i++) vault.withdraw(address(this), 10 ether);
        assertEq(vault.totalWithdrawn(), 50 ether);
        vm.expectRevert(bytes("total withdrawal limit")); vault.withdraw(address(this), 1 ether);
        assertEq(vault.totalWithdrawn(), 50 ether);
        assertEq(token.balanceOf(address(vault)), 50 ether);
    }
    function test_callbackRejectsWrongReactive() public {
        bytes memory payload=abi.encodeWithSignature("pauseByRule(address,uint256,uint256)",address(0),1,10 ether);
        assertFalse(proxy.deliver(address(vault),address(0xaaaa),payload)); assertFalse(vault.paused());
    }
    function test_onlyOwnerCanBindAndResume() public {
        vm.prank(address(0xaaaa)); vm.expectRevert(); monitor.setRecipient(address(0x1111));
        vm.prank(address(0xaaaa)); vm.expectRevert(); vault.resume();
    }
    function test_constructorRejectsInvalidAddressesAndThreshold() public {
        vm.expectRevert(bytes("invalid rule")); new RuleMonitor(address(0), SENDER, 1);
        vm.expectRevert(bytes("invalid rule")); new RuleMonitor(address(token), address(0), 1);
        vm.expectRevert(bytes("invalid rule")); new RuleMonitor(address(token), SENDER, 0);
        vm.expectRevert(bytes("zero address")); new TestVault(IPayable(payable(address(0))), address(monitor), address(token));
        vm.expectRevert(bytes("zero address")); new TestVault(IPayable(payable(address(proxy))), address(0), address(token));
        vm.expectRevert(bytes("zero address")); new TestVault(IPayable(payable(address(proxy))), address(monitor), address(0));
    }

    function test_recipientMustBeNonzeroAndCanOnlyBeSetOnce() public {
        RuleMonitor fresh = new RuleMonitor(address(token), SENDER, 10 ether);
        vm.expectRevert(bytes("already set or zero")); fresh.setRecipient(address(0));
        fresh.setRecipient(address(vault));
        vm.expectRevert(bytes("already set or zero")); fresh.setRecipient(address(0x9999));
        assertEq(fresh.recipient(), address(vault));
    }

    function test_thresholdBeforeRecipientDoesNotTrigger() public {
        RuleMonitor fresh = new RuleMonitor(address(token), SENDER, 10 ether);
        vm.prank(SYSTEM); fresh.react(record(10 ether));
        assertFalse(fresh.triggered());
        assertEq(fresh.lastAmount(), 10 ether);
        assertEq(fresh.lastSourceTx(), 0xabc);
        assertEq(system.count(), 0);
        assertEq(system.removed(), 0);
        fresh.setRecipient(address(vault));
        assertEq(system.count(), 0);
        vm.prank(SYSTEM); fresh.react(record(11 ether));
        assertTrue(fresh.triggered());
        assertEq(system.count(), 1);
    }

    function test_malformedAndUnrelatedRecordsDoNotChangeState() public {
        IReactive.LogRecord memory l = record(10 ether);
        l.chainId = 1; vm.prank(SYSTEM); monitor.react(l); l.chainId = 11155111;
        l.contractAddress = address(0xaaaa); vm.prank(SYSTEM); monitor.react(l); l.contractAddress = address(token);
        l.topic0 = 0; vm.prank(SYSTEM); monitor.react(l); l.topic0 = monitor.TRANSFER();
        l.topic1 = 0; vm.prank(SYSTEM); monitor.react(l); l.topic1 = uint256(uint160(SENDER));
        l.topic2 = uint256(1) << 160; vm.prank(SYSTEM); monitor.react(l); l.topic2 = 0;
        l.opCode = 4; vm.prank(SYSTEM); monitor.react(l); l.opCode = 3;
        l.data = hex"01"; vm.prank(SYSTEM); monitor.react(l);
        l.data = new bytes(64); vm.prank(SYSTEM); monitor.react(l);
        assertFalse(monitor.triggered());
        assertEq(monitor.lastAmount(), 0);
        assertEq(monitor.lastSourceTx(), 0);
        assertEq(monitor.lastReactBlock(), 0);
        assertEq(system.count(), 0);
        assertEq(system.removed(), 0);
    }

    function test_belowThresholdUpdatesStateWithoutAccumulation() public {
        IReactive.LogRecord memory l = record(6 ether);
        vm.prank(SYSTEM); monitor.react(l);
        l.txHash = 0xdef;
        vm.prank(SYSTEM); monitor.react(l);
        assertFalse(monitor.triggered());
        assertEq(monitor.lastAmount(), 6 ether);
        assertEq(monitor.lastSourceTx(), 0xdef);
        assertEq(monitor.lastReactBlock(), block.number);
        assertEq(system.count(), 0);
        assertEq(system.removed(), 0);
    }

    function test_failedUnsubscribeRollsBackTrigger() public {
        system.setFailures(true, false);
        vm.expectRevert(bytes("unsubscribe failed")); vm.prank(SYSTEM); monitor.react(record(10 ether));
        assertFalse(monitor.triggered());
        assertEq(monitor.lastAmount(), 0);
        assertEq(system.removed(), 0);
        assertEq(system.count(), 0);
    }

    function test_failedCallbackRequestRollsBackUnsubscribeAndTrigger() public {
        system.setFailures(false, true);
        vm.expectRevert(bytes("request failed")); vm.prank(SYSTEM); monitor.react(record(10 ether));
        assertFalse(monitor.triggered());
        assertEq(monitor.lastSourceTx(), 0);
        assertEq(system.removed(), 0);
        assertEq(system.count(), 0);
    }

    function test_unauthorizedWithdrawalAndInvalidDestination() public {
        vm.prank(address(0xaaaa)); vm.expectRevert(bytes("owner only")); vault.withdraw(address(0xaaaa), 1 ether);
        vm.expectRevert(bytes("zero address")); vault.withdraw(address(0), 1 ether);
        assertEq(token.balanceOf(address(vault)), 100 ether);
    }

    function test_directCallerCannotSpoofReactiveAddress() public {
        vm.prank(address(0xaaaa)); vm.expectRevert(); vault.pauseByRule(address(monitor), 1, 10 ether);
        assertFalse(vault.paused());
        assertEq(vault.lastSourceTx(), 0);
        assertEq(vault.lastAmount(), 0);
    }
}
