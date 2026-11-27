import React from 'react';
import './execution-path.css';
import {getExecutionStages} from './executionStages';

export default function ExecutionPath({language='zh',d,state,observed,completed,below,binding,readFailed}) {
 const en=language==='en';
 const stages=getExecutionStages({language,d,state,observed,completed,below,readFailed,binding});
 return <div className="execution-path" aria-label={en?'Observed rule progress':'规则执行进度'}><div className="execution-path-heading"><span>{en?'ONCHAIN JOURNEY':'链上执行路径'}</span><small>{state?.checkedAt?(en?`Last checked: ${state.checkedAt}`:`最近读取：${state.checkedAt}`):(en?'Based on retrieved onchain data':'读取链上数据后显示')}</small></div><ol>{stages.map((item,index)=><li key={item.title} className={item.active?'is-observed':''}><span className="execution-path-dot">{item.active?'✓':String(index+1).padStart(2,'0')}</span><div><b>{item.title}</b><small>{item.detail}</small>{item.href&&<a href={item.href} target="_blank" rel="noreferrer">{en?'View transaction ↗':'查看交易 ↗'}</a>}</div></li>)}</ol><p>{en?'A callback request does not prove delivery. A missing record does not prove failure.':'请求回调不代表目标链已执行；没有记录也不能证明失败。'}</p>{state?.source&&state?.triggered&&!completed&&<a className="execution-trace" href={`https://lasna.reactscan.net/search?q=${encodeURIComponent(state.source)}`} target="_blank" rel="noreferrer">{en?'Inspect callback status on Reactscan ↗':'在 Reactscan 查看回调进度 ↗'}</a>}</div>;
}
