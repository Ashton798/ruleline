import {test} from 'node:test';
import assert from 'node:assert/strict';
import {englishExplanation} from './englishNotice.js';
test('translates only known verified state sentences without changing numbers or uncertainty',()=>{
 const source='规则阈值为 2.5 RCAMP。已请求回调，但这不代表回调已执行。现有信息不足以确认回调成功，也不能确认金库因该规则暂停。';
 const result=englishExplanation(source);
 assert.match(result,/2\.5 RCAMP/);
 assert.match(result,/execution is not confirmed/);
 assert.match(result,/cannot confirm a successful callback/);
 assert.equal(englishExplanation('未知状态。'), '未知状态。');
});
