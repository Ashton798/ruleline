import {readFile} from 'node:fs/promises';
import {ContractFactory, FetchRequest, JsonRpcProvider, formatEther, getAddress, getCreateAddress, parseEther, toQuantity} from 'ethers';

const wallet = getAddress(process.argv[2] || '');
const SEPOLIA = 11155111;
const LASNA = 5318007;
const token = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const proxy = '0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4';
const provider = url => {
  const request = new FetchRequest(url);
  request.timeout = 8000;
  return new JsonRpcProvider(request, undefined, {staticNetwork: true});
};
const sepolia = provider('https://ethereum-sepolia-rpc.publicnode.com');
const lasna = provider('https://lasna-rpc.rnk.dev/');

try {
  const [sourceNetwork, reactiveNetwork, sourceNonce, reactiveNonce, sourceBalance, reactiveBalance] = await Promise.all([
    sepolia.getNetwork(), lasna.getNetwork(), sepolia.getTransactionCount(wallet, 'pending'),
    lasna.getTransactionCount(wallet, 'pending'), sepolia.getBalance(wallet), lasna.getBalance(wallet)
  ]);
  if (sourceNetwork.chainId !== BigInt(SEPOLIA) || reactiveNetwork.chainId !== BigInt(LASNA)) throw Error('Unexpected RPC networks');
  const predicted = {
    observer: getCreateAddress({from: wallet, nonce: reactiveNonce}),
    gate: getCreateAddress({from: wallet, nonce: sourceNonce}),
    relay: getCreateAddress({from: wallet, nonce: reactiveNonce + 1}),
    vault: getCreateAddress({from: wallet, nonce: sourceNonce + 1})
  };
  const load = async name => {
    const artifact = JSON.parse(await readFile(new URL('../out/AIDecisionFlow.sol/' + name + '.json', import.meta.url)));
    return new ContractFactory(artifact.abi, artifact.bytecode.object);
  };
  const [observer, gate, relay, vault] = await Promise.all(['AIEventObserver', 'AIDecisionGate', 'AIDecisionRelay', 'AIDecisionVault'].map(load));
  const sourceDeposit = parseEther(process.env.AI_FLOW_SEPOLIA_PREFUND || '0.01');
  const reactiveDeposit = parseEther(process.env.AI_FLOW_LASNA_PREFUND || '0.1');
  const steps = [];
  const addDeployment = async (description, factory, chainId, nonce, value, address, args) => {
    const request = await factory.getDeployTransaction(...args, {value});
    steps.push({description, predictedAddress: address, chainId, from: wallet, nonce, value: toQuantity(value), data: request.data});
  };
  await addDeployment('Deploy RCAMP observer', observer, LASNA, reactiveNonce, reactiveDeposit, predicted.observer, [token, wallet, parseEther('10')]);
  await addDeployment('Deploy decision gate', gate, SEPOLIA, sourceNonce, sourceDeposit, predicted.gate, [proxy, predicted.observer, wallet, parseEther('20'), 1, 1800]);
  await addDeployment('Deploy decision relay', relay, LASNA, reactiveNonce + 1, reactiveDeposit, predicted.relay, [predicted.gate]);
  await addDeployment('Deploy protected test vault', vault, SEPOLIA, sourceNonce + 1, sourceDeposit, predicted.vault, [proxy, predicted.relay, token, predicted.gate]);
  steps.push({description: 'Bind relay to test vault', chainId: LASNA, from: wallet, nonce: reactiveNonce + 2,
    to: predicted.relay, value: '0x0', data: relay.interface.encodeFunctionData('setVault', [predicted.vault])});
  steps.push({description: 'Bind observer to decision gate', chainId: LASNA, from: wallet, nonce: reactiveNonce + 3,
    to: predicted.observer, value: '0x0', data: observer.interface.encodeFunctionData('setGate', [predicted.gate])});
  const funds = (balance, reserve) => ({balance: formatEther(balance), plannedReserve: formatEther(reserve), coversReserve: balance >= reserve});
  console.log(JSON.stringify({wallet, predicted, sepoliaETH: funds(sourceBalance, sourceDeposit * 2n),
    lasnaREACT: funds(reactiveBalance, reactiveDeposit * 2n), steps}, null, 2));
} finally {
  sepolia.destroy();
  lasna.destroy();
}
