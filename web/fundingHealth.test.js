import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fundingHealth} from './fundingHealth.js';
test('debt and missing reads remain distinct',()=>{
 assert.equal(fundingHealth({monitor:'x',state:null}).level,'unknown');
 assert.equal(fundingHealth({monitor:'x',state:{monitorDebt:null}}).level,'unknown');
 assert.equal(fundingHealth({monitor:'x',vault:'y',state:{monitorDebt:'0.0',vaultDebt:'0.00001'}}).level,'warning');
 assert.equal(fundingHealth({monitor:'x',vault:'y',state:{monitorDebt:'0.0',vaultDebt:'0'}}).level,'checked');
});
