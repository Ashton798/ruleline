import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCallback} from './callbackReceipt.js';
const monitor='0x1111111111111111111111111111111111111111';
const row=(overrides={})=>({sender:monitor,chainId:11155111n,txHash:10n,err:'0x',...overrides});
test('callback records only report evidence belonging to this monitor and destination',()=>{
 assert.deepEqual(summarizeCallback([],monitor,11155111),{status:'pending'});
 assert.equal(summarizeCallback([row({sender:'0x2222222222222222222222222222222222222222'})],monitor,11155111).status,'unknown');
 assert.equal(summarizeCallback([row({chainId:1n})],monitor,11155111).status,'unknown');
 assert.equal(summarizeCallback([row(),row()],monitor,11155111).status,'unknown');
 assert.equal(summarizeCallback([row({err:'0x1234'})],monitor,11155111).status,'failed');
 const result=summarizeCallback([row()],monitor,11155111);
 assert.equal(result.status,'reported');assert.equal(result.tx,'0x'+'0'.repeat(63)+'a');
});
