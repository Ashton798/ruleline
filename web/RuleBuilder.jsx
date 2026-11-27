import React, {useEffect, useState} from 'react';
import {isAddress, parseUnits} from 'ethers';
import Conversation from './Conversation';
import {englishNotice} from './englishNotice';
import './rule-builder.css';

export default function RuleBuilder(props) {
 const {draft,language,account,agent,busy,error,onChange,onConnect,onTranslate,onAITranslate,onReview,onCheckAgent}=props;
 const en=language==='en';
 const [mode,setMode]=useState('guided');
 const [step,setStep]=useState(draft.rule?3:0);
 const [amount,setAmount]=useState(draft.threshold||'');
 const [notice,setNotice]=useState('');
 const locked=Boolean(draft.monitor);
 useEffect(()=>{if(draft.rule){setStep(3);setAmount(draft.rule.threshold||'')}else setStep(current=>current===3?0:current)},[draft.rule]);
 const names=en?['Account','Amount','Confirm']:['监听账户','触发数量','确认规则'];
 function nextAccount(){if(!isAddress((draft.sender||'').trim())){setNotice(en?'Enter a valid account address starting with 0x.':'请输入有效的 0x 开头账户地址。');return}setNotice('');setStep(1)}
 function nextAmount(){try {if(!/^\d+(?:\.\d+)?$/.test(amount))throw Error();const n=parseUnits(amount,18);if(n<=0n||n>=2n**256n)throw Error()} catch {setNotice(en?'Enter a positive amount with up to 18 decimal places.':'请输入大于零的数量，最多支持 18 位小数。');return}setNotice('');onChange({threshold:amount});setStep(2)}
 function translate(ai){
  setNotice('');
  const text=en?`When the specified account transfers at least ${amount} RCAMP in one transaction, pause withdrawals from the test vault.`:`当指定账户单笔转出达到 ${amount} RCAMP 时，暂停测试金库。`;
  (ai?onAITranslate:onTranslate)({text,sender:draft.sender,token:draft.token});
 }
 return <div className="builder-shell">
  <div className="builder-mode" aria-label={en?'Rule creation method':'规则创建方式'}><button type="button" aria-pressed={mode==='guided'} onClick={()=>setMode('guided')}>{en?'Step by step':'分步创建'}</button><button type="button" aria-pressed={mode==='direct'} onClick={()=>setMode('direct')}>{en?'Describe in words':'直接描述'}</button></div>
  <div hidden={mode!=='guided'} className="guided-rule">
   <div className="guided-heading"><span>{en?'RULE ASSISTANT · TESTNET':'规则助手 · 测试网'}</span><h2>{en?'Turn an idea into a rule.':'让想法，变成规则。'}</h2><p>{en?'One decision at a time. Review everything before deploying.':'一步一步设置，部署前可以核对每个条件。'}</p></div>
   <ol className="guided-progress" aria-label={en?'Creation progress':'创建进度'}>{names.map((name,index)=><li key={name} className={index===Math.min(step,2)?'current':index<step?'done':''}><span>{index+1}</span><b>{name}</b></li>)}</ol>
   <div className="guided-card" aria-live="polite">
    {step===0&&<><span className="guided-kicker">01 / {names[0]}</span><h3>{en?'Which account should we monitor?':'要监听哪个账户？'}</h3><p>{en?'We watch outgoing transfers after they happen.':'我们会在转账发生后，监听这个账户的转出事件。'}</p><label htmlFor="guided-account">{en?'Account address':'账户地址'}</label><input id="guided-account" value={draft.sender||''} onChange={e=>{setNotice('');onChange({sender:e.target.value})}} placeholder="0x..." autoComplete="off" spellCheck="false" disabled={busy||locked}/><div className="guided-inline"><button type="button" onClick={()=>onConnect()} disabled={busy}>{en?'Connect wallet':'连接钱包'}</button>{account&&<button type="button" onClick={()=>onChange({sender:account})} disabled={busy||locked}>{en?'Use connected account':'使用已连接账户'}</button>}</div><div className="guided-actions"><button type="button" onClick={nextAccount} disabled={busy}>{en?'Continue →':'下一步 →'}</button></div></>}
    {step===1&&<><span className="guided-kicker">02 / {names[1]}</span><h3>{en?'What amount triggers the rule?':'单笔转出多少时触发？'}</h3><p>{en?'The supported test token is RCAMP. The condition includes the amount entered.':'当前使用 RCAMP 测试代币，转出数量达到或超过这个值时触发。'}</p><label htmlFor="guided-amount">{en?'Threshold in RCAMP':'触发数量（RCAMP）'}</label><input id="guided-amount" value={amount} onChange={e=>{setNotice('');setAmount(e.target.value)}} inputMode="decimal" placeholder="10" disabled={busy||locked}/><div className="guided-actions"><button type="button" className="guided-back" onClick={()=>{setNotice('');setStep(0)}}>{en?'← Back':'← 上一步'}</button><button type="button" onClick={nextAmount} disabled={busy}>{en?'Continue →':'下一步 →'}</button></div></>}
    {step===2&&<><span className="guided-kicker">03 / {names[2]}</span><h3>{en?'Review the action':'确认要执行的动作'}</h3><p>{en?'After a matching transfer, request a callback to pause withdrawals from this project’s test vault. The transfer cannot be stopped.':'符合条件的转账发生后，请求回调暂停本项目测试金库的提款。已发生的转账不会被阻止。'}</p><dl className="guided-summary"><div><dt>{en?'Account':'监听账户'}</dt><dd>{draft.sender}</dd></div><div><dt>{en?'Threshold':'触发条件'}</dt><dd>≥ {amount} RCAMP</dd></div><div><dt>{en?'Action':'动作'}</dt><dd>{en?'Pause test vault withdrawals':'暂停测试金库提款'}</dd></div></dl><div className="guided-actions guided-actions-wrap"><button type="button" className="guided-back" onClick={()=>setStep(1)}>{en?'← Back':'← 上一步'}</button><button type="button" onClick={()=>translate(false)} disabled={busy||locked}>{en?'Match locally →':'本地规则匹配 →'}</button><button type="button" className="guided-ai" onClick={()=>translate(true)} disabled={busy||locked||!agent?.configured||agent?.unavailable}>{en?'AI translation':'AI 翻译'}</button></div><p className="guided-note">{en?'Local matching is not AI. For AI, the English template is converted to Chinese before the rule and address are sent to your configured provider; charges may apply.':'本地匹配不是 AI。AI 翻译会将规则和地址发送给配置的服务商，可能产生费用。'}</p><p className="guided-note">{agent?.configured?(en?'AI is configured; a successful call confirms connectivity.':'AI 已配置，实际调用成功才能确认连接。'):(en?'AI is not connected. You can continue with local matching.':'AI 尚未连接，可以先使用本地匹配。')} <button className="guided-link" type="button" onClick={onCheckAgent}>{en?'Check status':'检查状态'}</button></p></>}
    {step===3&&draft.rule&&<><span className="guided-kicker">{en?'READY TO REVIEW':'规则候选'}</span><h3>{en?'Your rule is ready to review':'规则已整理，准备核对'}</h3><p>{locked?(en?'A monitor already exists. Open the execution page for current status.':'已有监听合约，请到执行页查看当前状态。'):(en?'Nothing has been deployed or signed yet.':'现在还没有部署合约或签署交易。')}</p><dl className="guided-summary"><div><dt>{en?'Account':'监听账户'}</dt><dd>{draft.rule.sender}</dd></div><div><dt>{en?'Threshold':'触发条件'}</dt><dd>≥ {draft.rule.threshold} RCAMP</dd></div><div><dt>{en?'Action':'动作'}</dt><dd>{en?'Pause test vault withdrawals':'暂停测试金库提款'}</dd></div><div><dt>{en?'Method':'生成方式'}</dt><dd>{draft.rule.source==='AI'?'AI':en?'Local rule matching':'本地规则匹配'}</dd></div></dl><div className="guided-actions">{!locked&&<button type="button" className="guided-back" onClick={()=>{onChange({});setStep(1)}}>{en?'Edit':'修改条件'}</button>}<button type="button" onClick={onReview} disabled={busy}>{en?'Review deployment →':'核对并部署 →'}</button></div></>}
    {(notice||error)&&<p className="guided-error" role="alert">{en?englishNotice(notice||error):(notice||error)}</p>}
    {busy&&<p className="guided-note" role="status">{en?'Working…':'处理中…'}</p>}
   </div><p className="guided-footer">{en?'Testnet only · You confirm each wallet transaction.':'仅限测试网 · 每笔交易由你在钱包中确认'}</p>
  </div>
  <div hidden={mode!=='direct'}><Conversation {...props}/></div>
 </div>;
}
