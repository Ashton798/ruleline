// Read-only testnet watcher. It prints a transaction for the owner/agent to review;
// it never holds a private key, signs or broadcasts transactions.
import {Contract,JsonRpcProvider,isAddress,formatUnits} from 'ethers';
import {recommendDecision} from './decision.mjs';

const {GATE_ADDRESS,OBSERVER_ADDRESS,SEPOLIA_RPC,LASNA_RPC,START_BLOCK,AI_ENDPOINT}=process.env;
if (!isAddress(GATE_ADDRESS||'') || !isAddress(OBSERVER_ADDRESS||'') || !SEPOLIA_RPC || !LASNA_RPC || !/^\d+$/.test(START_BLOCK||'') || !AI_ENDPOINT) {
  console.error('Set GATE_ADDRESS, OBSERVER_ADDRESS, SEPOLIA_RPC, LASNA_RPC, START_BLOCK and AI_ENDPOINT. No private key is needed.'); process.exit(1);
}
const sepolia=new JsonRpcProvider(SEPOLIA_RPC); const lasna=new JsonRpcProvider(LASNA_RPC);
const gate=new Contract(GATE_ADDRESS,[
  'event DecisionNeeded(uint256 indexed sourceTx,uint256 amount,uint64 deadline)',
  'function requests(uint256) view returns(uint256 amount,uint64 deadline,bool exists,bool resolved)',
  'function maxObservedAmount() view returns(uint256)', 'function _CALLBACK_SENDER() view returns(address)',
  'function disabled() view returns(bool)', 'function submitDecision(uint256,uint8)'
],sepolia);
const observer=new Contract(OBSERVER_ADDRESS,['function threshold() view returns(uint256)','function gate() view returns(address)'],lasna);
const confirmations=3;
if ((await sepolia.getNetwork()).chainId!==11155111n || (await lasna.getNetwork()).chainId!==5318007n) throw Error('Unexpected networks: only Sepolia and Lasna testnets are supported.');
if ((await gate._CALLBACK_SENDER()).toLowerCase()!==OBSERVER_ADDRESS.toLowerCase() || (await observer.gate()).toLowerCase()!==GATE_ADDRESS.toLowerCase()) throw Error('Observer and gate are not bound to each other.');
let cursor=Number(START_BLOCK); if (!Number.isSafeInteger(cursor)) throw Error('Invalid START_BLOCK');
console.log('Watching confirmed testnet events; suggestions require a human wallet transaction.');
while (true) {
  try {
    const last=(await sepolia.getBlockNumber())-confirmations+1;
    while (cursor<=last) {
      const end=Math.min(last,cursor+999);
      const events=await gate.queryFilter(gate.filters.DecisionNeeded(),cursor,end);
      for (const event of events) {
        const sourceTx=event.args.sourceTx;
        const [request,maxAmount,threshold,disabled]=await Promise.all([gate.requests(sourceTx),gate.maxObservedAmount(),observer.threshold(),gate.disabled()]);
        const block=await sepolia.getBlock('latest');
        if (disabled || !request.exists || request.resolved || !block || BigInt(block.timestamp)>request.deadline) continue;
        const proposal=await recommendDecision({amountWei:request.amount.toString(),thresholdWei:threshold.toString(),maxAmountWei:maxAmount.toString()},{endpoint:AI_ENDPOINT});
        const result={sourceTx:'0x'+sourceTx.toString(16).padStart(64,'0'),amountRCAMP:formatUnits(request.amount,18),deadline:request.deadline.toString(),proposal};
        if (proposal.action==='pause' || proposal.action==='skip') {
          result.reviewTransaction={to:GATE_ADDRESS,data:gate.interface.encodeFunctionData('submitDecision',[sourceTx,proposal.action==='pause'?1:0]),value:'0'};
        }
        console.log(JSON.stringify(result));
      }
      cursor=end+1;
    }
  } catch (error) { console.error('Read/AI check failed; no transaction was sent:',error.message); }
  if (process.argv.includes('--once')) break;
  await new Promise(resolve=>setTimeout(resolve,10000));
}
