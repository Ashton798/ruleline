import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getExecutionStages} from './executionStages.js';
const stages=(args)=>getExecutionStages({d:{monitor:'0x1'},state:null,observed:false,completed:false,below:false,readFailed:false,...args});
test('unread and failed states do not imply a callback result',()=>{
 assert.equal(stages({})[2].detail,'无法确认');
 assert.equal(stages({readFailed:true})[3].detail,'无法确认');
 assert.equal(stages({state:{triggered:true},observed:true})[3].detail,'等待确认');
});
test('only matched callback evidence marks a confirmed pause',()=>{
 assert.equal(stages({state:{triggered:true,paused:true},observed:true,completed:false})[3].active,false);
 assert.equal(stages({state:{triggered:true,paused:true},observed:true,completed:true})[3].detail,'已确认暂停');
 assert.equal(stages({state:{triggered:true,paused:false},observed:true,completed:true})[3].detail,'曾暂停，现已恢复');
 assert.equal(stages({state:{triggered:false},observed:true,below:true})[1].detail,'未达到阈值');
});
