export function getExecutionStages({language='zh',d,state,observed,completed,below,readFailed,binding}) {
 const en=language==='en';
 const unknown=readFailed||(!state&&!!d.monitor);
 const hash = value => /^0x[0-9a-f]{64}$/i.test(value || '') ? value : null;
 const origin = hash(state?.source), reactive = hash(state?.reactTx), callback = hash(state?.callbackTx || state?.reportedCallbackTx);
 return [
  {title:en?'Transfer event':'转账事件',detail:unknown?(en?'Unable to confirm':'无法确认'):observed?(en?`Observed ${state.amount} RCAMP`:`已观察到 ${state.amount} RCAMP`):d.monitor?(en?'Waiting for event':'等待事件'):(en?'Monitor not deployed':'监听合约未部署'),active:!unknown&&!!observed,href:!unknown&&observed&&origin?`https://sepolia.etherscan.io/tx/${origin}`:null},
  {title:en?'Reactive check':'Reactive 判断',detail:unknown?(en?'Unable to confirm':'无法确认'):state?.triggered?(en?'Threshold reached':'达到阈值'):below?(en?'Below threshold':'未达到阈值'):observed?(binding?(en?'Result unconfirmed':'判断结果未确认'):(en?'Vault not bound':'金库尚未绑定')):(en?'Awaiting event':'等待事件'),active:!unknown&&(!!state?.triggered||!!below),href:!unknown&&reactive?`https://lasna.reactscan.net/tx/${reactive}`:null},
  {title:en?'Callback request':'请求回调',detail:unknown?(en?'Unable to confirm':'无法确认'):state?.triggered?(en?'Request recorded':'已记录请求'):(en?'Not requested':'尚未请求'),active:!unknown&&!!state?.triggered,href:!unknown&&state?.triggered&&reactive?`https://lasna.reactscan.net/tx/${reactive}`:null},
  {title:en?'Test vault response':'测试金库响应',detail:unknown?(en?'Unable to confirm':'无法确认'):completed?(state.paused?(en?'Pause confirmed':'已确认暂停'):(en?'Previously paused; now resumed':'曾暂停，现已恢复')):state?.callbackReceipt==='failed'?(en?'Callback error recorded':'回调记录错误'):state?.callbackReceipt==='reported'?(en?'Reported; vault unconfirmed':'已有回执，金库未确认'):state?.triggered?(en?'Awaiting confirmation':'等待确认'):(en?'Not confirmed':'尚未确认'),active:!unknown&&!!completed,href:!unknown&&callback?`https://sepolia.etherscan.io/tx/${callback}`:null},
 ];
}
