import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendDecision} from './decision.mjs';
const context={amountWei:'100',thresholdWei:'100',maxAmountWei:'200'};
const endpoint='http://127.0.0.1:4399';
const model = answer => async () => ({ok:true,json:async()=>({source:'AI',answer})});
test('accepts only the three fixed decisions',async()=>{
  assert.equal((await recommendDecision(context,{endpoint,fetchImpl:model('{"action":"pause","reason":"threshold met"}')})).action,'pause');
  assert.equal((await recommendDecision(context,{endpoint,fetchImpl:model('{"action":"withdraw","reason":"x"}')})).action,'manual');
  assert.equal((await recommendDecision(context,{endpoint,fetchImpl:model('{"action":"pause","reason":"x","to":"other"}')})).action,'manual');
  assert.equal((await recommendDecision({...context,vaultPaused:true},{endpoint,fetchImpl:model('{"action":"pause","reason":"x"}')})).reason,'vault_already_paused');
});
test('invalid, unavailable and out-of-limit cases fall back to a person',async()=>{
  let calls=0; const fetchImpl=async()=>{calls++; throw Error('unavailable')};
  assert.equal((await recommendDecision({...context,amountWei:'201'},{endpoint,fetchImpl})).reason,'limit_exceeded');
  assert.equal(calls,0);
  assert.equal((await recommendDecision(context,{endpoint,fetchImpl})).reason,'model_unavailable');
  assert.equal((await recommendDecision(context,{endpoint,fetchImpl:model('not json')})).reason,'invalid_model_response');
  assert.equal((await recommendDecision(context,{endpoint:'http://example.com',fetchImpl})).reason,'invalid_endpoint');
});
