import {toBeHex} from 'ethers';

// System records are only meaningful for the reactive contract and chain we requested.
export function summarizeCallback(records, monitor, chainId) {
 const matches=records.filter(record=>String(record.sender).toLowerCase()===monitor.toLowerCase() && record.chainId===BigInt(chainId));
 if (!matches.length) return {status:records.length?'unknown':'pending'};
 if (matches.length!==1) return {status:'unknown'};
 const record=matches[0];
 const tx=record.txHash>0n?toBeHex(record.txHash,32):null;
 return {status:record.err==='0x'?'reported':'failed',tx};
}
