import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserProvider,JsonRpcProvider,Contract,ContractFactory,formatUnits,parseUnits,isAddress} from 'ethers';
import {parseRule} from './parser';
import monitorArtifact from '../out/RuleMonitor.sol/RuleMonitor.json';
import vaultArtifact from '../out/TestVault.sol/TestVault.json';
import './style.css';

const SEPOLIA=11155111, LASNA=5318007;
const TOKEN='0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const PROXY='0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4';
const SYSTEM='0x8888888888888888888888888888888888888888';
const payerABI=['function debt(address) view returns(uint256)','function reserves(address) view returns(uint256)'];
const tokenABI=['function transfer(address,uint256) returns (bool)','function balanceOf(address) view returns(uint256)','function symbol() view returns(string)','function decimals() view returns(uint8)'];
const defaults={text:'当指定账户转账达到 10 RCAMP 时，暂停测试金库',token:TOKEN,sender:'',threshold:'10',monitor:'',vault:'',hashes:{},rule:null};
const short=(v)=>v? v.slice(0,6)+'…'+v.slice(-4):'尚未设置';
const explorer=(chain,type,value)=> (chain===LASNA?'https://lasna.reactscan.net/':'https://sepolia.etherscan.io/')+type+'/'+value;
function App(){
 const [d,setD]=useState(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem('ruleline-v1')||'{}')}}catch{return defaults}});
 const [account,setAccount]=useState(''); const [chain,setChain]=useState(null); const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('先把一句规则翻译成可以核对的条件。'); const [err,setErr]=useState('');
 const [state,setState]=useState(null); const [agent,setAgent]=useState(null); const [agentBusy,setAgentBusy]=useState(false);
 const [deposit,setDeposit]=useState('1'); const [explanation,setExplanation]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [readFailed,setReadFailed]=useState(false);
 useEffect(()=>{localStorage.setItem('ruleline-v1',JSON.stringify(d));},[d]);
 useEffect(()=>{checkAgent();},[]);
 useEffect(()=>{if(!window.ethereum)return;const onAccounts=(a)=>setAccount(a[0]||'');const onChain=(c)=>setChain(Number(c));window.ethereum.on('accountsChanged',onAccounts);window.ethereum.on('chainChanged',onChain);return()=>{window.ethereum.removeListener('accountsChanged',onAccounts);window.ethereum.removeListener('chainChanged',onChain)}},[]);
 const update=(part)=>setD(old=>({...old,...part}));
 async function checkAgent(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();const result=await r.json();setAgent({configured:result.configured===true,provider:result.provider||'',endpoint:result.endpoint||''});}catch{setAgent({configured:false,unavailable:true});}}
 async function connect(){
  try{setErr('');if(!window.ethereum)throw Error('请先安装或打开 MetaMask。');const p=new BrowserProvider(window.ethereum);const accounts=await p.send('eth_requestAccounts',[]);setAccount(accounts[0]);setChain(Number((await p.getNetwork()).chainId));if(!d.sender)update({sender:accounts[0]});setMessage('钱包已连接。请检查监控账户与规则后再确认。');}catch(e){setErr(e.shortMessage||e.message)}
 }
 function checkRule(threshold){
  if(!isAddress(d.token)||!isAddress(d.sender))throw Error('请输入有效的代币和监控账户地址。');
  if(d.token.toLowerCase()!==TOKEN.toLowerCase())throw Error('当前版本只支持已部署的 RCAMP 测试代币。');
  const units=parseUnits(String(threshold),18);if(units<=0n)throw Error('阈值必须大于零。');
  return {token:d.token,sender:d.sender,threshold:String(threshold)};
 }
 function translate(){try{setErr('');setConfirmed(false);setExplanation('');const p=parseRule(d.text); const rule={...checkRule(p.threshold),source:'本地规则匹配'};update({threshold:p.threshold,rule});setMessage('本地规则匹配完成。请核对清单后确认；这不是 AI 模型。');}catch(e){update({rule:null});setErr(e.shortMessage||e.message)}}
 async function aiTranslate(){try{setAgentBusy(true);setErr('');setConfirmed(false);setExplanation('');update({rule:null});if(!isAddress(d.token)||!isAddress(d.sender))throw Error('请先填写有效的监控账户和代币地址，再请求 AI 翻译。');const r=await fetch('/api/interpret',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:d.text,sender:d.sender,token:d.token})});const p=await r.json();if(!r.ok)throw Error(p.error||'AI 翻译未完成。');const candidate=p.rule;if(p.source!=='AI'||!candidate||candidate.sender?.toLowerCase()!==d.sender.toLowerCase()||candidate.token?.toLowerCase()!==d.token.toLowerCase()||candidate.action!=='pause_vault'||candidate.originChainId!==SEPOLIA||candidate.reactiveChainId!==LASNA)throw Error('AI 返回的候选规则与页面条件不一致，请检查后重试。');const rule={...checkRule(candidate.threshold),source:'AI'};update({threshold:rule.threshold,rule});setMessage('AI 已生成候选规则；请自行核对，系统不会自动签名。');}catch(e){setErr(e.message||'AI 服务暂时不可用，请稍后重试。')}finally{setAgentBusy(false)}}
 async function aiExplain(){if(!state||(!d.monitor&&!d.vault)){setExplanation('尚未读取到本项目的链上证据，无法确认是否发生转账、回调或暂停。');return}try{setAgentBusy(true);setErr('');setExplanation('');const facts=JSON.stringify({threshold:d.rule?.threshold,latestObservedAmount:state?.block&&state.block!=='0'?state.amount:undefined,callbackRequested:state?.triggered,vaultPaused:state?.paused,callbackMatchesSource:state?.callbackMatches});const r=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:facts})});const p=await r.json();if(!r.ok)throw Error(p.error||'AI 解释未完成。');setExplanation(p.explanation)}catch(e){setErr(e.message||'AI 服务暂时不可用，请稍后重试。')}finally{setAgentBusy(false)}}
 async function signerFor(expected){
  if(!window.ethereum)throw Error('请打开 MetaMask。');
  const p=new BrowserProvider(window.ethereum); const accounts=await p.send('eth_accounts',[]);
  if(!accounts.length)throw Error('请先点击“连接钱包”。');
  const current=Number((await p.getNetwork()).chainId);setChain(current);
  if(current!==expected){await p.send('wallet_switchEthereumChain',[{chainId:'0x'+expected.toString(16)}]);throw Error('网络已切换，请核对网络后再点击一次操作。');}
  return p.getSigner();
 }
 async function action(name,network,fn){
  setBusy(true);setErr('');
  try{const s=await signerFor(network);setMessage('请在 MetaMask 中核对交易并自行确认。');const tx=await fn(s);setMessage('钱包已提交，等待链上确认：'+tx.hash);const receipt=await tx.wait();if(receipt.status!==1)throw Error('交易已失败，请在浏览器查看详情。');update({hashes:{...d.hashes,[name]:tx.hash}});setMessage('交易已确认。你可以在下方打开区块浏览器查看。');return receipt;}
  catch(e){setErr(e.shortMessage||e.reason||e.message||'操作未完成');return null}finally{setBusy(false)}
 }
 async function deployMonitor(){if(!d.rule||!confirmed)return setErr('请先翻译规则，并勾选确认完整部署清单。');if(d.monitor)return setErr('当前规则已有监听合约。');
  const receipt=await action('deployMonitor',LASNA,async s=>(await new ContractFactory(monitorArtifact.abi,monitorArtifact.bytecode.object,s).deploy(d.rule.token,d.rule.sender,parseUnits(d.rule.threshold,18),{value:parseUnits('0.1',18)})).deploymentTransaction());
  if(receipt?.contractAddress)update({monitor:receipt.contractAddress,hashes:{...d.hashes,deployMonitor:receipt.hash}});
 }
 async function deployVault(){if(!d.monitor)return setErr('请先部署监听合约。');if(d.vault)return setErr('当前已有测试金库。');
  const receipt=await action('deployVault',SEPOLIA,async s=>(await new ContractFactory(vaultArtifact.abi,vaultArtifact.bytecode.object,s).deploy(PROXY,d.monitor,d.rule.token,{value:parseUnits('0.01',18)})).deploymentTransaction());
  if(receipt?.contractAddress)update({vault:receipt.contractAddress,vaultDeployBlock:receipt.blockNumber,hashes:{...d.hashes,deployVault:receipt.hash}});
 }
 async function bind(){if(!d.vault)return setErr('请先部署测试金库。');await action('bind',LASNA,s=>new Contract(d.monitor,monitorArtifact.abi,s).setRecipient(d.vault));}
 async function transfer(){if(!d.rule||!d.vault)return setErr('请先完成部署和绑定。');if(account.toLowerCase()!==d.rule.sender.toLowerCase())return setErr('请切换到规则中指定的监控账户。');
  await action('source',SEPOLIA,s=>new Contract(d.rule.token,tokenABI,s).transfer(d.rule.sender,parseUnits(d.rule.threshold,18)));
 }
 async function fundVault(){if(!d.vault)return setErr('请先部署金库。');try{if(parseUnits(deposit,18)<=0n)throw Error('存入数量须大于零。')}catch(e){return setErr(e.message)}
  await action('deposit',SEPOLIA,s=>new Contract(d.rule.token,tokenABI,s).transfer(d.vault,parseUnits(deposit,18)));
 }
 async function resume(){await action('resume',SEPOLIA,s=>new Contract(d.vault,vaultArtifact.abi,s).resume());}
 async function refresh(){
  setErr('');setBusy(true);setExplanation('');setReadFailed(false);
  try{
   const sepolia=new JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com',SEPOLIA,{staticNetwork:true});
   const lasna=new JsonRpcProvider('https://lasna-rpc.rnk.dev/',LASNA,{staticNetwork:true});
   const out={checkedAt:new Date().toLocaleString()};
   if(d.monitor){
    const m=new Contract(d.monitor,monitorArtifact.abi,lasna);
    const [recipient,triggered,amount,source,block,balance]=await Promise.all([m.recipient(),m.triggered(),m.lastAmount(),m.lastSourceTx(),m.lastReactBlock(),lasna.getBalance(d.monitor)]);
    Object.assign(out,{recipient,triggered,amount:formatUnits(amount,18),source:'0x'+source.toString(16).padStart(64,'0'),block:block.toString(),monitorBalance:formatUnits(balance,18)});
    if(block>0n){try{const logs=await m.queryFilter(triggered?m.filters.PauseRequested():m.filters.TransferChecked(),Number(block),Number(block));out.reactTx=logs.at(-1)?.transactionHash}catch{out.logError=true}}
    try{out.monitorDebt=formatUnits(await new Contract(SYSTEM,payerABI,lasna).debt(d.monitor),18)}catch{out.monitorDebt=null}
   }
   if(d.vault){
    const v=new Contract(d.vault,vaultArtifact.abi,sepolia);const t=new Contract(d.rule.token,tokenABI,sepolia);
    const [paused,amount,balance,source,nativeBalance]=await Promise.all([v.paused(),v.lastAmount(),t.balanceOf(d.vault),v.lastSourceTx(),sepolia.getBalance(d.vault)]);
    Object.assign(out,{paused,vaultAmount:formatUnits(amount,18),balance:formatUnits(balance,18),vaultBalance:formatUnits(nativeBalance,18),callbackMatches:out.triggered&&out.source==='0x'+source.toString(16).padStart(64,'0')});
    try{const proxy=new Contract(PROXY,payerABI,sepolia);const [debt,reserves]=await Promise.all([proxy.debt(d.vault),proxy.reserves(d.vault)]);out.vaultDebt=formatUnits(debt,18);out.vaultReserves=formatUnits(reserves,18)}catch{out.vaultDebt=null}
    if(out.callbackMatches){try{const latest=await sepolia.getBlockNumber();const from=d.vaultDeployBlock??Math.max(0,latest-1900);const logs=await v.queryFilter(v.filters.VaultPaused(null,out.source),from,latest);out.callbackTx=logs.at(-1)?.transactionHash}catch{out.logError=true}}
   }
   setState(out);setMessage('已读取当前链上状态。跨链回调可能延迟；无记录不代表失败。');
  }catch(e){setState(null);setReadFailed(true);setErr('读取链上状态失败，当前结果无法确认：'+(e.shortMessage||e.message))}finally{setBusy(false)}
 }
 const binding=state?.recipient&&d.vault&&state.recipient.toLowerCase()===d.vault.toLowerCase();
 const observed=!!state?.block&&state.block!=='0';
 const completed=!!state?.callbackMatches;
 const below=observed&&d.rule&&parseUnits(state.amount,18)<parseUnits(d.rule.threshold,18);
 const status=completed?(state.paused?'回调成功 · 金库已暂停':'回调曾成功 · 金库已恢复'):state?.triggered?'等待目标链执行 · 结果尚无法确认':observed?(below?'已收到事件 · 未达到阈值':'已收到事件 · 尚未请求回调'):binding?'等待事件':d.monitor?(state?'待连接金库':'状态尚未确认'):'尚未部署';
 const stages=[{label:'等待事件',active:binding&&!observed},{label:'已收到事件',active:observed},{label:'未达到阈值',active:below&&!state?.triggered},{label:'已请求回调',active:!!state?.triggered},{label:'等待目标链执行',active:!!state?.triggered&&!completed},{label:'回调成功',active:completed},{label:'失败或暂无法确认',active:(!!state?.triggered&&!completed)||(readFailed&&!!d.monitor)}];
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><span className="brandmark">r<span>.</span></span><div><b>ruleline</b><small>链上规则翻译官</small></div></div><div className="side-caption">你的控制台</div><div className="nav active"><span>◈</span> 规则工作台 <i>↗</i></div><a className="nav" href="#evidence"><span>◎</span> 执行记录</a><a className="nav" href="#guide"><span>▧</span> 工作原理</a><div className="side-bottom"><div className="tiny-dot"/> TESTNET ONLY <p>基于 Reactive Network<br/>让链上规则清楚可见。</p></div></aside>
  <main><header className="top"><div className="crumb">WORKSPACE <span>/</span> 规则工作台</div><div className="top-right"><span className="network"><i/> 测试网</span><button className="wallet" onClick={connect}>{account?short(account):'连接钱包'} <span>↗</span></button></div></header>
   <section className="intro"><div><div className="eyebrow"><span>●</span> MAKE ONCHAIN MAKE SENSE</div><h1>说出规则，<br/><em>看见执行。</em></h1><p>把想法变成一条可核对的链上规则。<br/>发生什么、为什么发生，都有迹可循。</p></div><div className="intro-stamp"><div className="orbit o1"></div><div className="orbit o2"></div><div className="orbit o3"></div><div className="orbit-core">R<span>↗</span></div><span className="stamp-label">LISTEN · REACT · PROTECT</span></div></section>
   <div className="section-head"><div><span className="kicker">YOUR RULE</span><h2>创建第一条规则</h2></div><span className="badge">单规则测试版</span></div>
   <section className="workspace"><div className="editor"><div className="panel-title"><span className="step">01</span><div><b>用你的话描述</b><p>目前支持「转账达到阈值 → 暂停测试金库」</p></div></div>
     <label>规则内容<textarea value={d.text} disabled={busy||agentBusy||!!d.monitor} onChange={e=>{setConfirmed(false);setExplanation('');update({text:e.target.value,rule:null})}}/></label>
     <div className="field-grid"><label>监控代币地址<input value={d.token} disabled={busy||agentBusy||!!d.monitor} onChange={e=>{setConfirmed(false);update({token:e.target.value,rule:null})}}/></label><label>监控哪个账户<input placeholder="连接钱包后自动填入" value={d.sender} disabled={busy||agentBusy||!!d.monitor} onChange={e=>{setConfirmed(false);update({sender:e.target.value,rule:null})}}/></label></div>
     <div className="editor-foot"><span><i className="small-dot"/> {agent?.configured?'AI 已配置，连接需实际调用验证':agent?.unavailable?'AI 服务不可用，请先启动本地服务':'AI 尚未配置 · 本地规则匹配可用'}</span><div><button className="secondary" disabled={busy||agentBusy||!!d.monitor} onClick={translate}>本地解析 <b>↗</b></button><button className="secondary ai" disabled={busy||agentBusy||!!d.monitor||!agent?.configured} onClick={aiTranslate}>{agentBusy?'AI 处理中…':'AI 翻译 ✳'}</button></div></div>
     <p className="ai-privacy">{agent?.configured?`AI 服务商：${agent.provider||'未填写'}${agent.endpoint?' · '+agent.endpoint:''}。`:'配置 AI 后可使用真实模型；当前本地解析不是 AI。'}点击 AI 翻译会发送规则文本及其中的地址；解释时发送基于链上状态生成的事实，服务商可能收费。<button className="text-btn" type="button" onClick={checkAgent}>检查 AI 配置 ↻</button></p>
     {err&&<p className="ai-error" role="alert">{err}</p>}
    </div><div className="blueprint"><div className="panel-title"><span className="step light">02</span><div><b>核对执行路径</b><p>确认后才会进入部署步骤</p></div></div>
     <div className="flow"><div className="flow-row"><div className="flow-icon peach">↗</div><div><small>当这件事发生 · SEPOLIA</small><strong>{d.rule?'指定账户转出 RCAMP':'等待翻译规则'}</strong><span>{d.rule?short(d.rule.sender)+' · '+short(d.rule.token):'在左侧写下你的条件'}</span></div></div><div className="flow-line"/><div className="flow-row"><div className="flow-icon purple">⌁</div><div><small>REACTIVE 网络判断</small><strong>{d.rule?'转账数量 ≥ '+d.rule.threshold+' RCAMP':'检查是否达到阈值'}</strong><span>Lasna 测试网监听事件</span></div></div><div className="flow-line"/><div className="flow-row"><div className="flow-icon aqua">Ⅱ</div><div><small>自动请求执行 · SEPOLIA</small><strong>暂停测试金库的提款</strong><span>仅限本演示金库，不影响钱包资产</span></div></div></div>
     <div className="rule-note">✳ <span>规则部署后不可修改。请在钱包确认前核对全部条件。</span></div>
     {d.rule?.source&&<p className="ai-privacy">候选来源：{d.rule.source}。账户和代币地址来自你的填写，请继续核对。</p>}
    </div></section>
   {d.rule&&<section className="review" aria-label="部署前核对清单"><div className="review-heading"><div><span className="kicker">REVIEW BEFORE DEPLOYMENT</span><h2>部署前，请确认这一条规则</h2></div><span className="badge">仅测试网</span></div><dl><div><dt>监听账户</dt><dd>{d.rule.sender}</dd></div><div><dt>监听代币</dt><dd>RCAMP · {d.rule.token}</dd></div><div><dt>单笔触发阈值</dt><dd>≥ {d.rule.threshold} RCAMP</dd></div><div><dt>目标金库</dt><dd>{d.vault||'将在 Sepolia 新部署本项目测试金库'}</dd></div><div><dt>网络与动作</dt><dd>Sepolia 转账 → Lasna 判断 → Sepolia 暂停提款</dd></div><div><dt>预计预存与费用</dt><dd>监听合约 0.1 lREACT，金库 0.01 Sepolia ETH；另需部署、绑定和转账 Gas，具体以钱包为准。预存不保证费用充足。</dd></div></dl><p>规则只处理发生后的事件，首次达标请求回调后退订；回调可能延迟或失败，不会自动重试或重新启用。</p>{!d.monitor&&<label className="confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 我已核对账户、代币、阈值、网络、金库和测试网费用，理解这是一次性规则。</label>}</section>}
   <div className="section-head run-head" id="evidence"><div><span className="kicker">LIVE EXECUTION</span><h2>让规则开始工作</h2></div><button className="text-btn" onClick={refresh} disabled={busy}>↻ 刷新链上状态</button></div>
   <section className="execution"><div className="run-summary"><div><span className="summary-label">当前状态</span><h3><i className={'status-dot '+(completed?'danger':'')}/>{status}</h3><p>{completed?(state.paused?'金库记录了同一笔源交易，当前提款已暂停。':'金库曾处理该源交易，当前已恢复提款；监听不会重启。'):state?.triggered?'监听合约已请求回调，尚不能确认目标链执行。':'依次完成部署、绑定，再发送测试转账。'}</p></div><div className="balance"><span>金库代币余额</span><b>{state?.balance??'—'} <small>RCAMP</small></b></div></div>
    <div className="timeline" aria-label="跨链执行阶段">{stages.map((step,index)=><div key={step.label} className={'timeline-step'+(step.active?' active':'')}><span>{String(index+1).padStart(2,'0')}</span><b>{step.label}</b></div>)}</div>
    <div className="actions"><div className="action"><div className="number">1</div><div><b>部署监听合约</b><p>Lasna · 预存 0.1 lREACT + Gas</p></div><button disabled={busy||!d.rule||!confirmed||!!d.monitor} onClick={deployMonitor}>{d.monitor?'已部署':'部署 ↗'}</button></div><div className="action"><div className="number">2</div><div><b>部署测试金库</b><p>Sepolia · 预存 0.01 ETH + Gas</p></div><button disabled={busy||!d.monitor||!!d.vault} onClick={deployVault}>{d.vault?'已部署':'部署 ↗'}</button></div><div className="action"><div className="number">3</div><div><b>连接监听与金库</b><p>Lasna · 绑定金库地址 + Gas</p></div><button disabled={busy||!d.vault||!!d.hashes.bind} onClick={bind}>{d.hashes.bind?'已绑定':'连接 ↗'}</button></div><div className="action"><div className="number">4</div><div><b>发送测试转账</b><p>Sepolia · 向自己转 RCAMP，需 Gas</p></div><button disabled={busy||!d.hashes.bind||!!state?.triggered} onClick={transfer}>测试触发 ↗</button></div></div>
    <div className="vault-extra"><div><b>金库操作</b><p>存入也是转账，达到阈值会触发。规则触发一次后退订；恢复提款不会重新启用监听。</p></div><div className="vault-controls"><input aria-label="存入数量" value={deposit} onChange={e=>setDeposit(e.target.value)}/><button disabled={busy||!d.vault} onClick={fundVault}>存入测试币</button><button disabled={busy||!state?.paused} onClick={resume}>恢复提款</button></div></div>
    <div className="notice" role="status">{err?<><b>需要处理：</b> {err}</>:message}</div>
    <div className="notice"><b>状态解释：</b>{!state?'尚未读取本项目的链上状态，执行结果尚未确认。':completed?(state.paused?'已核对源交易，金库当前暂停提款。':'相同源交易曾触发金库暂停，目前金库已恢复。'):state.triggered?'监听合约已请求回调，但目标链结果尚未确认。':observed?'已收到事件，最近一次数量为 '+state.amount+' RCAMP。':'尚未观察到本规则的链上执行。'} {state?.checkedAt&&<span>最近读取：{state.checkedAt}。 </span>}{state?.logError&&<span>部分日志查询失败，交易证据暂不可用。 </span>}<button className="text-btn" disabled={agentBusy||!agent?.configured} onClick={aiExplain}>让 AI 解释 ↗</button>{!agent?.configured&&<span>（AI 尚未配置或不可用）</span>}{explanation&&<p>{state&&(d.monitor||d.vault)?'AI：':'状态提示：'}{explanation}</p>}</div>
    {state&&(d.monitor||d.vault)&&<div className="funding"><b>费用与欠费（只读）</b><p>Lasna 监听合约余额：{state.monitorBalance??'未查询'} lREACT；系统欠费：{state.monitorDebt??'无法确认'} lREACT。Sepolia 金库余额：{state.vaultBalance??'未查询'} ETH；代理欠费：{state.vaultDebt??'无法确认'} ETH；代理储备：{state.vaultReserves??'无法确认'} ETH。</p><p>欠费可能阻止回调；余额不代表费用一定充足。直接给金库转账不会自动清除已有代理欠费，请参考官方费用文档。回调失败或长期等待需要人工排查，规则不会自动重试。</p></div>}
    <div className="evidence"><div><small>监听合约 · LASNA</small>{d.monitor?<a href={explorer(LASNA,'address',d.monitor)} target="_blank" rel="noreferrer">{short(d.monitor)} ↗</a>:<span>等待部署</span>}</div><div><small>测试金库 · SEPOLIA</small>{d.vault?<a href={explorer(SEPOLIA,'address',d.vault)} target="_blank" rel="noreferrer">{short(d.vault)} ↗</a>:<span>等待部署</span>}</div><div><small>已观察到的源链转账</small>{observed?<a href={explorer(SEPOLIA,'tx',state.source)} target="_blank" rel="noreferrer">{short(state.source)} ↗</a>:d.hashes.source?<a href={explorer(SEPOLIA,'tx',d.hashes.source)} target="_blank" rel="noreferrer">{short(d.hashes.source)} ↗</a>:<span>等待事件</span>}</div><div><small>REACTIVE 执行</small>{state?.reactTx?<a href={explorer(LASNA,'tx',state.reactTx)} target="_blank" rel="noreferrer">{short(state.reactTx)} ↗</a>:<span>尚无证据</span>}</div><div><small>目标链回调</small>{state?.callbackTx?<a href={explorer(SEPOLIA,'tx',state.callbackTx)} target="_blank" rel="noreferrer">{short(state.callbackTx)} ↗</a>:<span>尚无证据</span>}</div></div>
   </section>
   <section className="learn" id="guide"><div><span className="kicker">HOW IT WORKS</span><h2>就像给金库<br/>配了一位守门员。</h2></div><p>Sepolia 上的代币发生转账，就像门口传来消息；Reactive 合约检查数量是否达到你设定的值。达到后，它请求 Sepolia 上的测试金库暂停提款。整个过程需要各合约有足够的测试网费用，回调也可能失败或延迟。</p><div className="learn-mark">✳</div></section>
   <footer>RULELINE <span>为清楚理解每一次链上执行而做。</span><a href="https://dev.reactive.network/reactive-contracts" target="_blank">Reactive 官方文档 ↗</a></footer>
  </main></div>
}
createRoot(document.getElementById('root')).render(<App/>);
