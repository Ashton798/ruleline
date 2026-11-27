// Requires forge build and two fresh local Anvil instances, on ports 18545/18546.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {Contract, ContractFactory, JsonRpcProvider, JsonRpcSigner, id, parseEther} from 'ethers';
import eventAgent from '../api/event-agent.js';

const sepolia = new JsonRpcProvider('http://127.0.0.1:18545');
const lasna = new JsonRpcProvider('http://127.0.0.1:18546');
const proxy = '0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4';
const token = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const system = '0x8888888888888888888888888888888888888888';
const localToken = 'local-integration-credential-123456789';
const artifact = async (file, name) => JSON.parse(await readFile(new URL('../out/' + file + '/' + name + '.json', import.meta.url)));
const sent = async tx => (await tx).wait();
const deploy = async (name, signer, ...args) => {
  const a = await artifact('AIDecisionFlow.sol', name);
  const contract = await new ContractFactory(a.abi, a.bytecode.object, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
};
const server = createServer(eventAgent);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const realFetch = globalThis.fetch;
let modelCalls = 0;
globalThis.fetch = async (input, options) => {
  if (input === 'https://open.bigmodel.cn/api/paas/v4/chat/completions') {
    modelCalls++;
    assert.match(JSON.parse(options.body).messages[0].content, /Observed single-transfer amount in wei: 10000000000000000000\./);
    return Response.json({choices: [{message: {content: '{"action":"pause","reason":"Test policy selected pause."}'}}]});
  }
  return realFetch(input, options);
};
const request = opts => fetch(url, opts);
const stage = async expected => assert.equal((await (await request()).json()).stage, expected);
const record = (address, signature, topic1, topic2, data, txHash, topics) => [
  11155111, address, id(signature), topic1, topic2, 0, data, 10, topics, 0, txHash, 0
];
try {
  assert.equal((await sepolia.getNetwork()).chainId, 11155111n);
  assert.equal((await lasna.getNetwork()).chainId, 5318007n);
  await stage('awaiting_deployment');
  assert.equal((await request({method: 'POST'})).status, 401);
  await sepolia.send('anvil_setCode', [proxy, (await artifact('Rule.t.sol','MockProxy')).deployedBytecode.object]);
  const sys = await artifact('Rule.t.sol','MockSystem');
  await lasna.send('anvil_setCode', [system, sys.deployedBytecode.object]);
  await lasna.send('anvil_impersonateAccount', [system]);
  await lasna.send('anvil_setBalance', [system, '0x56bc75e2d63100000']);
  const relayCaller = new JsonRpcSigner(lasna, system);
  const sepSigner = await sepolia.getSigner();
  const lasSigner = await lasna.getSigner();
  const owner = await sepSigner.getAddress();
  const amount = parseEther('10');
  const observer = await deploy('AIEventObserver', lasSigner, token, owner, amount);
  const gate = await deploy('AIDecisionGate', sepSigner, proxy, observer.target, owner, parseEther('20'), 1, 1800);
  const relay = await deploy('AIDecisionRelay', lasSigner, gate.target);
  const vault = await deploy('AIDecisionVault', sepSigner, proxy, relay.target, token, gate.target);
  await sent(relay.setVault(vault.target));
  await sent(observer.setGate(gate.target));
  Object.assign(process.env, {AI_FLOW_OBSERVER: observer.target, AI_FLOW_GATE: gate.target, AI_FLOW_RELAY: relay.target,
    AI_FLOW_VAULT: vault.target, AI_FLOW_SEPOLIA_RPC: 'http://127.0.0.1:18545', AI_FLOW_LASNA_RPC: 'http://127.0.0.1:18546',
    AI_FLOW_RUN_TOKEN: localToken, AI_API_KEY: 'local-test', AI_MODEL: 'glm-5.3-flash', AI_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4'});
  await stage('awaiting_transfer');
  const sourceTx = id('synthetic test transfer');
  const amountWord = '0x' + amount.toString(16).padStart(64, '0');
  await sent(observer.connect(relayCaller).react(record(token, 'Transfer(address,address,uint256)', BigInt(owner), 1, amountWord, sourceTx, 3)));
  await stage('awaiting_request_callback');
  const mockSystem = new Contract(system, sys.abi, lasna);
  const callbackProxy = new Contract(proxy, (await artifact('Rule.t.sol','MockProxy')).abi, sepSigner);
  await sent(callbackProxy.deliver(gate.target, observer.target, (await mockSystem.getRequest()).payload, {gasLimit: 1000000}));
  await stage('awaiting_confirmations');
  await sepolia.send('anvil_mine', ['0x2']);
  await stage('awaiting_decision');
  const response = await request({method: 'POST', headers: {Authorization: 'Bearer ' + localToken}});
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.stage, 'awaiting_wallet_confirmation');
  assert.equal(result.recommendation.action, 'pause');
  assert.equal(modelCalls, 1);
  assert.equal(result.transaction.to, gate.target);
  const decision = await sent(sepSigner.sendTransaction({to: result.transaction.to, data: result.transaction.data}));
  await stage('awaiting_decision_relay');
  const log = decision.logs.find(item => item.topics[0] === id('DecisionAccepted(uint256,uint256,uint8,uint64)'));
  await sent(relay.connect(relayCaller).react(record(gate.target, 'DecisionAccepted(uint256,uint256,uint8,uint64)', log.topics[1], 0, log.data, decision.hash, 2)));
  await stage('awaiting_vault_callback');
  await sent(callbackProxy.deliver(vault.target, relay.target, (await mockSystem.getRequest()).payload, {gasLimit: 1000000}));
  await stage('pause_confirmed');
  assert.equal(await vault.lastSourceTx(), BigInt(sourceTx));
  console.log('PASS: simulated logs and callbacks across two local chains, authenticated AI proposal, wallet write and matched vault confirmation.');
} finally {
  globalThis.fetch = realFetch;
  await new Promise(resolve => server.close(resolve));
  sepolia.destroy();
  lasna.destroy();
}
