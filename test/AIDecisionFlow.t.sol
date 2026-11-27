// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AIEventObserver,AIDecisionGate,AIDecisionRelay,AIDecisionVault} from "../src/AIDecisionFlow.sol";
import {MockSystem,MockProxy,MockToken} from "./Rule.t.sol";

contract AIDecisionFlowTest is Test {
    address constant SYSTEM=0x8888888888888888888888888888888888888888;
    address constant AGENT=address(0xa11);
    address constant SENDER=address(0x1234);
    MockSystem system; MockProxy proxy; MockToken token;
    AIEventObserver observer; AIDecisionGate gate; AIDecisionRelay relay; AIDecisionVault vault;
    function setUp() public {
        MockSystem mock=new MockSystem(); vm.etch(SYSTEM,address(mock).code); system=MockSystem(SYSTEM);
        proxy=new MockProxy(); token=new MockToken();
        observer=new AIEventObserver(address(token),SENDER,10 ether);
        gate=new AIDecisionGate(IPayable(payable(address(proxy))),address(observer),AGENT,20 ether,1,300);
        observer.setGate(address(gate)); relay=new AIDecisionRelay(address(gate));
        vault=new AIDecisionVault(IPayable(payable(address(proxy))),address(relay),address(token),gate);
        relay.setVault(address(vault));
    }
    function transferRecord(uint256 amount) internal view returns (IReactive.LogRecord memory l) {
        l.chainId=11155111; l.contractAddress=address(token); l.topic0=uint256(keccak256("Transfer(address,address,uint256)"));
        l.topic1=uint256(uint160(SENDER)); l.topic2=uint256(uint160(address(0xbeef))); l.opCode=3; l.txHash=0xabc; l.data=abi.encode(amount);
    }
    function createRequest(uint256 amount) internal {
        vm.prank(SYSTEM); observer.react(transferRecord(amount));
        ISystemContract.CallbackConfiguration_V_1_0 memory c=system.getRequest();
        assertEq(c.recipient,address(gate)); assertTrue(proxy.deliver(address(gate),address(observer),c.payload));
    }
    function decisionRecord(uint256 sourceTx,uint256 amount,uint8 action,uint64 deadline) internal view returns (IReactive.LogRecord memory l) {
        l.chainId=11155111; l.contractAddress=address(gate); l.topic0=uint256(keccak256("DecisionAccepted(uint256,uint256,uint8,uint64)"));
        l.topic1=sourceTx; l.opCode=2; l.data=abi.encode(amount,action,deadline);
    }
    function test_fullMockedPath_requiresDecisionBeforePause() public {
        createRequest(10 ether); assertFalse(vault.paused());
        vm.prank(AGENT); gate.submitDecision(0xabc,1);
        (uint256 amount,uint64 deadline,,)=gate.requests(0xabc);
        vm.prank(SYSTEM); relay.react(decisionRecord(0xabc,amount,1,deadline));
        ISystemContract.CallbackConfiguration_V_1_0 memory c=system.getRequest();
        assertEq(c.recipient,address(vault)); assertTrue(proxy.deliver(address(vault),address(relay),c.payload));
        assertTrue(vault.paused()); assertEq(vault.lastSourceTx(),0xabc);
    }
    function test_rejectsDirectAndWrongCallbackSender() public {
        vm.expectRevert(); gate.requestDecision(address(observer),1,10 ether);
        bytes memory payload=abi.encodeWithSignature("requestDecision(address,uint256,uint256)",address(0),uint256(1),10 ether);
        assertFalse(proxy.deliver(address(gate),address(0xbeef),payload));
    }
    function test_rejectsUnauthorizedOrUnsupportedDecision() public {
        createRequest(10 ether);
        vm.prank(address(0xbad)); vm.expectRevert(bytes("not authorized")); gate.submitDecision(0xabc,1);
        vm.prank(AGENT); vm.expectRevert(bytes("action not allowed")); gate.submitDecision(0xabc,2);
        vm.prank(AGENT); gate.submitDecision(0xabc,0);
        vm.prank(AGENT); vm.expectRevert(bytes("unavailable request")); gate.submitDecision(0xabc,1);
    }
    function test_limitAndExpirationFailClosed() public {
        createRequest(21 ether); vm.prank(AGENT); vm.expectRevert(bytes("limit exceeded")); gate.submitDecision(0xabc,1);
        vm.warp(block.timestamp+301); vm.expectRevert(bytes("unavailable request")); gate.submitDecision(0xabc,0);
    }
    function test_ownerCanCancelOrDisable() public {
        createRequest(10 ether); gate.cancelRequest(0xabc);
        vm.prank(AGENT); vm.expectRevert(bytes("unavailable request")); gate.submitDecision(0xabc,1);
        gate.disable(); assertTrue(gate.disabled());
    }
    function test_pauseCountAndDuplicateRequestsAreBounded() public {
        createRequest(10 ether); vm.prank(AGENT); gate.submitDecision(0xabc,1);
        bytes memory payload=abi.encodeWithSignature("requestDecision(address,uint256,uint256)",address(0),uint256(0xabc),10 ether);
        assertFalse(proxy.deliver(address(gate),address(observer),payload));
        payload=abi.encodeWithSignature("requestDecision(address,uint256,uint256)",address(0),uint256(0xdef),10 ether);
        assertTrue(proxy.deliver(address(gate),address(observer),payload));
        vm.prank(AGENT); vm.expectRevert(bytes("limit exceeded")); gate.submitDecision(0xdef,1);
        gate.submitDecision(0xdef,0);
    }
    function test_vaultRechecksPauseAndOwnerCanStopInFlightCallback() public {
        createRequest(10 ether);
        bytes memory payload=abi.encodeCall(vault.pauseByRule,(address(0),0xabc,10 ether));
        assertFalse(proxy.deliver(address(vault),address(relay),payload));
        vm.prank(AGENT); gate.submitDecision(0xabc,1);
        gate.disable();
        assertFalse(proxy.deliver(address(vault),address(relay),payload));
        assertFalse(vault.paused());
    }
    function test_vaultRejectsExpiredSecondCallback() public {
        createRequest(10 ether);
        vm.prank(AGENT); gate.submitDecision(0xabc,1);
        vm.warp(block.timestamp+301);
        bytes memory payload=abi.encodeCall(vault.pauseByRule,(address(0),0xabc,10 ether));
        assertFalse(proxy.deliver(address(vault),address(relay),payload));
    }
    function test_relayRejectsUntrustedOrExpiredAndDeduplicates() public {
        IReactive.LogRecord memory l=decisionRecord(1,10 ether,1,uint64(block.timestamp+30));
        vm.expectRevert(); relay.react(l);
        l.contractAddress=address(0xbad); vm.prank(SYSTEM); relay.react(l); assertEq(system.count(),0);
        l.contractAddress=address(gate); l.data=abi.encode(10 ether,uint8(0),uint64(block.timestamp+30)); vm.prank(SYSTEM); relay.react(l); assertEq(system.count(),0);
        l.data=abi.encode(10 ether,uint8(1),uint64(block.timestamp+30)); vm.prank(SYSTEM); relay.react(l); assertEq(system.count(),1);
        vm.prank(SYSTEM); relay.react(l); assertEq(system.count(),1);
        l.topic1=2; vm.warp(block.timestamp+31); vm.prank(SYSTEM); relay.react(l); assertEq(system.count(),1);
    }
}
