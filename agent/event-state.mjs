import {Contract, FetchRequest, JsonRpcProvider, formatUnits, isAddress, toBeHex} from 'ethers';

const SEPOLIA = 11155111;
const LASNA = 5318007;
const proxy = '0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4';
const token = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const gateAbi = [
  'function latestSourceTx() view returns (uint256)',
  'function requests(uint256) view returns (uint256 amount, uint64 deadline, bool exists, bool resolved)',
  'function maxObservedAmount() view returns (uint256)',
  'function disabled() view returns (bool)',
  'function pauseAuthorized(uint256) view returns (bool)',
  'function _CALLBACK_SENDER() view returns (address)',
  'function _SERVICE_PROVIDER() view returns (address)',
  'function submitDecision(uint256 sourceTx, uint8 action)'
];
const observerAbi = ['function threshold() view returns (uint256)', 'function gate() view returns (address)', 'function token() view returns (address)', 'function triggered() view returns (bool)'];
const relayAbi = ['function gate() view returns (address)', 'function vault() view returns (address)', 'function processed(uint256) view returns (bool)'];
const vaultAbi = [
  'function decisionGate() view returns (address)', 'function _CALLBACK_SENDER() view returns (address)',
  'function _SERVICE_PROVIDER() view returns (address)',
  'function asset() view returns (address)', 'function paused() view returns (bool)', 'function processedSourceTx(uint256) view returns (bool)'
];
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function network(url, chainId) {
  const request = new FetchRequest(url);
  request.timeout = 7000;
  const provider = new JsonRpcProvider(request, chainId, {staticNetwork: true});
  try {
    if (BigInt(await provider.send('eth_chainId', [])) !== BigInt(chainId)) throw Error('Wrong network');
    return provider;
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

export function eventAgentConfigured(env) {
  return ['GATE', 'OBSERVER', 'RELAY', 'VAULT'].every(name => {
    const address = env['AI_FLOW_' + name];
    return isAddress(address || '') && !/^0x0{40}$/i.test(address);
  });
}

export async function inspectEventState(env) {
  if (!eventAgentConfigured(env)) return {stage: 'awaiting_deployment'};
  const {AI_FLOW_GATE, AI_FLOW_OBSERVER, AI_FLOW_RELAY, AI_FLOW_VAULT} = env;
  const providers = await Promise.allSettled([
    network(env.AI_FLOW_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com', SEPOLIA),
    network(env.AI_FLOW_LASNA_RPC || 'https://lasna-rpc.rnk.dev/', LASNA)
  ]);
  try {
    if (providers.some(result => result.status === 'rejected')) throw Error('RPC unavailable');
    const [sepolia, lasna] = providers.map(result => result.value);
    if (await sepolia.getCode(proxy) === '0x') throw Error('Proxy unavailable');
    const gate = new Contract(AI_FLOW_GATE, gateAbi, sepolia);
    const observer = new Contract(AI_FLOW_OBSERVER, observerAbi, lasna);
    const relay = new Contract(AI_FLOW_RELAY, relayAbi, lasna);
    const vault = new Contract(AI_FLOW_VAULT, vaultAbi, sepolia);
    const [gateSender, observerGate, observerToken, relayGate, relayVault, vaultGate, vaultSender, vaultToken, gateProxy, vaultProxy] = await Promise.all([
      gate._CALLBACK_SENDER(), observer.gate(), observer.token(), relay.gate(), relay.vault(), vault.decisionGate(), vault._CALLBACK_SENDER(), vault.asset(),
      gate._SERVICE_PROVIDER(), vault._SERVICE_PROVIDER()
    ]);
    if (!same(gateSender, AI_FLOW_OBSERVER) || !same(observerGate, AI_FLOW_GATE) || !same(relayGate, AI_FLOW_GATE)
      || !same(relayVault, AI_FLOW_VAULT) || !same(vaultGate, AI_FLOW_GATE) || !same(vaultSender, AI_FLOW_RELAY)
      || !same(observerToken, token) || !same(vaultToken, token) || !same(gateProxy, proxy) || !same(vaultProxy, proxy)) throw Error('Invalid binding');
    const head = await sepolia.getBlock('latest');
    const [sourceTx, disabled, triggered] = await Promise.all([gate.latestSourceTx(), gate.disabled(), observer.triggered()]);
    const base = {checkedAt: new Date().toISOString(), disabled};
    if (sourceTx === 0n) return {...base, stage: disabled ? 'disabled' : triggered ? 'awaiting_request_callback' : 'awaiting_transfer'};
    const [request, threshold, limit, approvedPause, relayed, executed, paused, confirmedTx] = await Promise.all([
      gate.requests(sourceTx), observer.threshold(), gate.maxObservedAmount(), gate.pauseAuthorized(sourceTx),
      relay.processed(sourceTx), vault.processedSourceTx(sourceTx), vault.paused(),
      gate.latestSourceTx({blockTag: Math.max(0, head.number - 2)})
    ]);
    const details = {...base, sourceTransaction: toBeHex(sourceTx, 32), observedRCAMP: formatUnits(request.amount, 18),
      deadline: new Date(Number(request.deadline) * 1000).toISOString(), approvedPause, executionObserved: executed, vaultPaused: paused};
    if (executed) return {...details, stage: paused ? 'pause_confirmed' : 'previously_paused'};
    if (disabled) return {...details, stage: 'disabled'};
    if (request.resolved) return {...details, stage: approvedPause ? relayed ? 'awaiting_vault_callback' : 'awaiting_decision_relay' : 'resolved_without_pause'};
    if (request.deadline < BigInt(head.timestamp)) return {...details, stage: 'expired'};
    if (confirmedTx !== sourceTx) return {...details, stage: 'awaiting_confirmations'};
    return {...details, stage: 'awaiting_decision',
      context: {amountWei: request.amount.toString(), thresholdWei: threshold.toString(), maxAmountWei: limit.toString()},
      decisionTransaction: action => ({
        chainId: SEPOLIA, to: AI_FLOW_GATE, value: '0x0',
        data: gate.interface.encodeFunctionData('submitDecision', [sourceTx, action === 'pause' ? 1 : 0])
      })
    };
  } finally {
    for (const result of providers) if (result.status === 'fulfilled') result.value.destroy();
  }
}
