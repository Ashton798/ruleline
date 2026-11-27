import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserProvider,JsonRpcProvider,Contract,ContractFactory,formatUnits,parseUnits,isAddress} from 'ethers';
import {parseRule,englishRuleToChinese} from './parser';
import monitorArtifact from './contract-artifacts/RuleMonitor.json';
import vaultArtifact from './contract-artifacts/TestVault.json';
import './style.css';
import RuleBuilder from './RuleBuilder';
import './experience.css';
import './landing.css';
import './light-theme.css';
import {SignalScene,useStudioFeedback} from './Studio';
import './studio.css';
import Immersive from './Immersive';
import './immersive.css';
import AssistantChat from './AssistantChat';
import TreeBackdrop from './TreeBackdrop';
import ReviewEnglish from './ReviewEnglish';
import {englishNotice} from './englishNotice';
import ExecutionPath from './ExecutionPath';
import FundingHealth from './FundingHealth.jsx';
import {summarizeCallback} from './callbackReceipt';

const SEPOLIA=11155111, LASNA=5318007;
const TOKEN='0x96E9530cc78599b115a0e5e5873a2E88F661a977';
const PROXY='0xAa14d9Cd0f788Ca23d11805986C1d8bd035D23b4';
const SYSTEM='0x8888888888888888888888888888888888888888';
const payerABI=['function debt(address) view returns(uint256)','function reserves(address) view returns(uint256)'];
const callbackRegistryABI=['function getCallbacks(uint256) view returns ((uint256 blockNumber,address sender,uint256 index,uint256 chainId,uint256 txHash,bytes err)[])'];
const tokenABI=['function transfer(address,uint256) returns (bool)','function balanceOf(address) view returns(uint256)','function symbol() view returns(string)','function decimals() view returns(uint8)'];
const defaults={text:'',token:TOKEN,sender:'',threshold:'',monitor:'',vault:'',hashes:{},rule:null};
const short=(v)=>v? v.slice(0,6)+'…'+v.slice(-4):'尚未设置';
const explorer=(chain,type,value)=> (chain===LASNA?'https://lasna.reactscan.net/':'https://sepolia.etherscan.io/')+type+'/'+value;
function DemoWalkthrough({language='zh'}){
 const [step,setStep]=useState(-1);
 const [amount,setAmount]=useState(10);
 const matched=amount>=10;
 const demoSteps=language==='en'?[
  {title:'A transfer occurs',detail:`The example account transferred ${amount} RCAMP. The token contract records the event after the transfer.`,stage:'Simulated transfer event'},
  {title:'Check the threshold',detail:matched?'The amount reaches the threshold, so the rule requests a vault pause.':'The amount is below the threshold, so the rule keeps waiting.',stage:`${amount} RCAMP ${matched?'≥':'<'} 10 RCAMP`},
  {title:matched?'Request a test vault pause':'Test vault remains open',detail:matched?'In this example, the vault pauses when the callback arrives. Real callbacks may be delayed or fail.':'This transfer does not reach the threshold, so the vault remains unchanged.',stage:matched?'Simulation · vault paused':'Simulation · vault open'},
 ]:[
  {title:'账户发生转账',detail:`示例账户转出了 ${amount} RCAMP。转账完成后，代币合约产生一条记录。`,stage:'模拟转账事件'},
  {title:'检查是否达到条件',detail:matched?'数量达到设定的阈值，规则会请求暂停测试金库。':'数量未达到阈值，规则继续等待，不会请求暂停。',stage:`${amount} RCAMP ${matched?'≥':'<'} 10 RCAMP`},
  {title:matched?'请求暂停测试金库':'测试金库保持可提款',detail:matched?'在这个示例中，回调送达后金库暂停提款。真实回调可能延迟或失败，需要查看链上结果。':'本次转账未达到条件，金库状态没有改变。',stage:matched?'模拟结果 · 金库暂停':'模拟结果 · 金库可提款'},
 ];
 const current=demoSteps[step];
 if(language==='en') return <section className="demo" id="demo" aria-label="Rule simulation"><div className="demo-heading"><div><span className="demo-eyebrow">INTERACTIVE DEMO · NO WALLET NEEDED</span><h2>See how a rule responds.</h2><p>Choose an amount and explore the result.</p></div><span className="demo-badge">Simulation</span></div><div className="demo-layout"><div className="demo-rule"><span>Example rule</span><p>When a specified account transfers at least <strong>10 RCAMP</strong> in one transaction, pause withdrawals from the test vault.</p><small>This is a simulation, not live onchain data.</small></div><div className="demo-interaction"><fieldset className="demo-amount"><legend>Choose a simulated transfer amount</legend><div>{[5,10,20].map(value=><button type="button" key={value} aria-pressed={amount===value} onClick={()=>{setAmount(value);setStep(-1)}}>{value} <span>RCAMP</span></button>)}</div></fieldset><ol className="demo-steps">{['Transfer','Check rule','Vault result'].map((title,index)=><li key={title} className={index===step?'active':index<step?'done':''}><span>{index===2?'◈':index===1?'⌁':'↗'}</span><b>{title}</b></li>)}</ol><div className={'demo-signal'+(step>=0?' demo-signal--running':'')} key={`${step}-${amount}`} aria-hidden="true"><span/></div><div className="demo-result" aria-live="polite">{current?<><span className="demo-status">{current.stage}</span><h3>{current.title}</h3><p>{current.detail}</p></>:<><h3>See what happens</h3><p>Choose an amount and start the simulation.</p></>}</div><div className="demo-controls">{step>0&&<button type="button" className="demo-back" onClick={()=>setStep(step-1)}>Previous</button>}<button type="button" className="demo-next" onClick={()=>setStep(step===demoSteps.length-1?0:step+1)}>{step<0?'Start demo':step===demoSteps.length-1?'Replay':'Next'} ↗</button>{step===demoSteps.length-1&&<a href="#rule-editor">Create your own rule →</a>}</div></div></div></section>;
 return <section className="demo" id="demo" aria-label="规则演示">
  <div className="demo-heading"><div><span className="demo-eyebrow">交互演示 · 无需钱包</span><h2>试一试，规则如何反应。</h2><p>选择转账数量，看看不同条件下会发生什么。</p></div><span className="demo-badge">模拟演示</span></div>
  <div className="demo-layout"><div className="demo-rule"><span>示例规则</span><p>当指定账户单笔转出达到 <strong>10 RCAMP</strong> 时，暂停测试金库提款。</p><small>以下画面为模拟，不代表真实链上状态。</small></div>
   <div className="demo-interaction"><fieldset className="demo-amount"><legend>选择模拟转账数量</legend><div>{[5,10,20].map(value=><button type="button" key={value} aria-pressed={amount===value} onClick={()=>{setAmount(value);setStep(-1)}}>{value} <span>RCAMP</span></button>)}</div></fieldset>
    <ol className="demo-steps">{['账户转账','规则判断','金库结果'].map((title,index)=><li key={title} className={index===step?'active':index<step?'done':''}><span>{index===2?'◈':index===1?'⌁':'↗'}</span><b>{title}</b></li>)}</ol>
    <div className={'demo-signal'+(step>=0?' demo-signal--running':'')} key={`${step}-${amount}`} aria-hidden="true"><span/></div>
    <div className="demo-result" aria-live="polite">{current?<><span className="demo-status">{current.stage}</span><h3>{current.title}</h3><p>{current.detail}</p></>:<><h3>看看会发生什么</h3><p>选择数量后开始演示，观察规则如何判断。</p></>}</div>
    <div className="demo-controls">{step>0&&<button type="button" className="demo-back" onClick={()=>setStep(step-1)}>上一步</button>}<button type="button" className="demo-next" onClick={()=>setStep(step===demoSteps.length-1?0:step+1)}>{step<0?'开始演示':step===demoSteps.length-1?'重新演示':'下一步'} <span aria-hidden="true">↗</span></button>{step===demoSteps.length-1&&<a href="#rule-editor">创建自己的规则 →</a>}</div>
   </div></div>
 </section>;
}
const chapters=[
 {page:'home',hash:'#top',label:'首页'},
 {page:'demo',hash:'#demo',label:'互动演示'},
 {page:'create',hash:'#rule-editor',label:'创建规则'},
 {page:'review',hash:'#evidence',label:'核对与执行'},
 {page:'guide',hash:'#guide',label:'工作原理'},
 {page:'assistant',hash:'#assistant',label:'AI 助手'},
];
const pageFromHash=()=>(window.location.hash==='#rule-review'?'review':chapters.find(chapter=>chapter.hash===window.location.hash)?.page || 'home');
function App(){
 const [page,setPage]=useState(pageFromHash);
 const [language,setLanguage]=useState(()=>{try{return localStorage.getItem('ruleline-language')==='en'?'en':'zh'}catch{return 'zh'}});
 useEffect(()=>{document.documentElement.lang=language==='en'?'en':'zh-CN';try{localStorage.setItem('ruleline-language',language)}catch{}},[language]);
 const shell=useRef(null), main=useRef(null), menu=useRef(null), intro=useRef(null), introTimer=useRef(null), creation=useRef(null);
 const lastPage=useRef(page);
 const {sound,changeSound,play,feedback}=useStudioFeedback(shell);
 const [opening,setOpening]=useState(()=>{
  if(window.location.hash && window.location.hash!=='#top')return false;
  try{return sessionStorage.getItem('ruleline-intro-seen')!=='1'}catch{return true}
 });
 const [introLeaving,setIntroLeaving]=useState(false);
 const [introFading,setIntroFading]=useState(false);
 const [introRevealing,setIntroRevealing]=useState(false);
 useEffect(()=>{
  const sync=()=>setPage(pageFromHash());
  window.addEventListener('popstate',sync);
  window.addEventListener('hashchange',sync);
  return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync)};
 },[]);
 useEffect(()=>{
  if(lastPage.current===page)return;
  lastPage.current=page;
  menu.current?.close();
  window.scrollTo({top:0,behavior:'instant'});
  main.current.focus({preventScroll:true});
 },[page]);
 useEffect(()=>{if(opening)intro.current?.showModal()},[opening]);
 useEffect(()=>()=>window.clearTimeout(introTimer.current),[]);
 function finishIntro(){
  window.clearTimeout(introTimer.current);
  try{sessionStorage.setItem('ruleline-intro-seen','1')}catch{}
  intro.current?.close();
  setOpening(false);
  setIntroRevealing(true);
  main.current?.focus({preventScroll:true});
 }
 function fadeIntro(){
  window.clearTimeout(introTimer.current);
  setIntroFading(true);
  introTimer.current=window.setTimeout(finishIntro,650);
 }
 function enter(withSound,skip=false){
  if(introLeaving&&!skip)return;
  if(!skip&&(withSound||sound))changeSound(withSound);
  if(skip||window.matchMedia('(prefers-reduced-motion: reduce)').matches){finishIntro();return}
  setIntroLeaving(true);
  introTimer.current=window.setTimeout(fadeIntro,1500);
 }
 function navigate(hash){
  if(window.location.hash!==hash)history.pushState(null,'',hash);
  const next=pageFromHash();
  menu.current?.close();
  if(next!==page)play('page',true);
  if(next===page&&hash==='#top')window.scrollTo({top:0,behavior:'smooth'});
  setPage(next);
 }
 function handleNavigation(event){
  feedback(event);
  const link=event.target.closest('a[href^="#"]');
  if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const hash=link.getAttribute('href');
  if(hash==='#rule-review'||chapters.some(chapter=>chapter.hash===hash)){
   event.preventDefault();
   navigate(hash);
  }
 }
 const [d,setD]=useState(()=>{try{return {...defaults,...JSON.parse(localStorage.getItem('ruleline-v1')||'{}')}}catch{return defaults}});
 const [archives,setArchives]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('ruleline-archive-v1')||'[]');return Array.isArray(saved)?saved:[]}catch{return []}});
 const [account,setAccount]=useState(''); const [chain,setChain]=useState(null); const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('先把一句规则翻译成可以核对的条件。'); const [err,setErr]=useState('');
 const [walletError,setWalletError]=useState('');
 const [state,setState]=useState(null); const [agent,setAgent]=useState(null); const [agentBusy,setAgentBusy]=useState(false);
 const [deposit,setDeposit]=useState('1'); const [vaultFunding,setVaultFunding]=useState('0.01'); const [explanation,setExplanation]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [readFailed,setReadFailed]=useState(false);
 const [amountTouched,setAmountTouched]=useState(false);
 useEffect(()=>{localStorage.setItem('ruleline-v1',JSON.stringify(d));},[d]);
 useEffect(()=>{
  checkAgent();
  const interval=setInterval(checkAgent,10000);
  const onVisible=()=>{if(document.visibilityState==='visible')checkAgent();};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',onVisible)};
 },[]);
 useEffect(()=>{if(!window.ethereum)return;let active=true;const onAccounts=(a)=>{if(active){setAccount(a[0]||'');setConfirmed(false)}};const onChain=(c)=>setChain(Number(c));window.ethereum.request({method:'eth_accounts'}).then(onAccounts).catch(()=>{});window.ethereum.on('accountsChanged',onAccounts);window.ethereum.on('chainChanged',onChain);return()=>{active=false;window.ethereum.removeListener('accountsChanged',onAccounts);window.ethereum.removeListener('chainChanged',onChain)}},[]);
 const update=(part)=>setD(old=>({...old,...part}));
 async function checkAgent(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();const result=await r.json();setAgent({configured:result.configured===true,provider:result.provider||'',endpoint:result.endpoint||''});}catch{setAgent({configured:false,unavailable:true});}}
 async function connect(showInHeader=false){
  try{setWalletError('');setErr('');if(!window.ethereum)throw Error('请先安装或打开 MetaMask。');const p=new BrowserProvider(window.ethereum);const accounts=await p.send('eth_requestAccounts',[]);if(!accounts.length)throw Error('钱包未提供账户，请重新连接。');setAccount(accounts[0]);setChain(Number((await p.getNetwork()).chainId));if(!d.sender)update({sender:accounts[0]});setMessage('钱包已连接。请检查监控账户与规则后再确认。');}catch(e){if(showInHeader===true)setWalletError(e.shortMessage||e.message);else setErr(e.shortMessage||e.message)}
 }
 function checkRule(threshold,draft=d){
  if(!isAddress(draft.token)||!isAddress(draft.sender))throw Error('请输入有效的代币和监控账户地址。');
  if(draft.token.toLowerCase()!==TOKEN.toLowerCase())throw Error('当前版本只支持已部署的 RCAMP 测试代币。');
  const units=parseUnits(String(threshold),18);if(units<=0n)throw Error('阈值必须大于零。');
  return {token:draft.token,sender:draft.sender,threshold:String(threshold)};
 }
 function translate(input){const draft={...d,...input};try{setErr('');setConfirmed(false);setExplanation('');const p=parseRule(draft.text);const rule={...checkRule(p.threshold,draft),source:'本地规则匹配'};update({text:draft.text,sender:draft.sender,token:draft.token,threshold:p.threshold,rule});setMessage('本地规则匹配完成。请核对清单后确认；这不是 AI 模型。');}catch(e){update({rule:null});setErr(e.shortMessage||e.message)}}
 async function aiTranslate(input){const draft={...d,...input};try{setAgentBusy(true);setErr('');setConfirmed(false);setExplanation('');update({rule:null});if(!isAddress(draft.token)||!isAddress(draft.sender))throw Error('请先填写有效的监控账户和代币地址，再请求 AI 翻译。');const r=await fetch('/api/interpret',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:englishRuleToChinese(draft.text)||draft.text,sender:draft.sender,token:draft.token})});const p=await r.json();if(!r.ok)throw Error(p.error||'AI 翻译未完成。');const candidate=p.rule;if(p.source!=='AI'||!candidate||candidate.sender?.toLowerCase()!==draft.sender.toLowerCase()||candidate.token?.toLowerCase()!==draft.token.toLowerCase()||candidate.action!=='pause_vault'||candidate.originChainId!==SEPOLIA||candidate.reactiveChainId!==LASNA)throw Error('AI 返回的候选规则与页面条件不一致，请检查后重试。');const rule={...checkRule(candidate.threshold,draft),source:'AI'};update({text:draft.text,sender:draft.sender,token:draft.token,threshold:rule.threshold,rule});setMessage('AI 已生成候选规则；请自行核对，系统不会自动签名。');}catch(e){setErr(e.message||'AI 服务暂时不可用，请稍后重试。')}finally{setAgentBusy(false)}}
 async function aiExplain(){if(!state||(!d.monitor&&!d.vault)){setExplanation('尚未读取到本项目的链上证据，无法确认是否发生转账、回调或暂停。');return}try{setAgentBusy(true);setErr('');setExplanation('');const facts=JSON.stringify({threshold:d.rule?.threshold,latestObservedAmount:state?.block&&state.block!=='0'?state.amount:undefined,callbackRequested:state?.triggered,callbackFailed:state?.callbackReceipt==='failed'?true:undefined,vaultPaused:state?.paused,callbackMatchesSource:state?.callbackMatches});const r=await fetch('/api/explain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:facts})});const p=await r.json();if(!r.ok)throw Error(p.error||'AI 解释未完成。');setExplanation(p.explanation)}catch(e){setErr(e.message||'AI 服务暂时不可用，请稍后重试。')}finally{setAgentBusy(false)}}
 async function signerFor(expected){
  if(!window.ethereum)throw Error('请打开 MetaMask。');
  const p=new BrowserProvider(window.ethereum); const accounts=await p.send('eth_accounts',[]);
  if(!accounts.length)throw Error('请先点击“连接钱包”。');
  if(!account||accounts[0].toLowerCase()!==account.toLowerCase())throw Error('钱包账户已改变，请重新核对后再操作。');
  const current=Number((await p.getNetwork()).chainId);setChain(current);
  if(current!==expected){await p.send('wallet_switchEthereumChain',[{chainId:'0x'+expected.toString(16)}]);throw Error('网络已切换，请核对网络后再点击一次操作。');}
  return p.getSigner();
 }
 async function action(name,network,fn){
  setBusy(true);setErr('');
  try{const s=await signerFor(network);setState(null);setReadFailed(false);setExplanation('');setMessage('请在 MetaMask 中核对交易并自行确认。');const tx=await fn(s);setMessage('钱包已提交，等待链上确认：'+tx.hash);const receipt=await tx.wait();if(receipt.status!==1)throw Error('交易已失败，请在浏览器查看详情。');update({hashes:{...d.hashes,[name]:tx.hash}});setMessage('交易已确认。请刷新链上状态，再查看最新结果。');return receipt;}
  catch(e){setErr(e.shortMessage||e.reason||e.message||'操作未完成');return null}finally{setBusy(false)}
 }
 async function deployMonitor(){if(!d.rule||!confirmed)return setErr('请先翻译规则，并勾选确认完整部署清单。');if(d.monitor)return setErr('当前规则已有监听合约。');
  const receipt=await action('deployMonitor',LASNA,async s=>(await new ContractFactory(monitorArtifact.abi,monitorArtifact.bytecode.object,s).deploy(d.rule.token,d.rule.sender,parseUnits(d.rule.threshold,18),{value:parseUnits('0.1',18)})).deploymentTransaction());
  if(receipt?.contractAddress)update({monitor:receipt.contractAddress,hashes:{...d.hashes,deployMonitor:receipt.hash}});
 }
 async function deployVault(){if(!d.monitor)return setErr('请先部署监听合约。');if(d.vault)return setErr('当前已有测试金库。');
  let funding;try{funding=parseUnits(vaultFunding,18);if(funding<=0n)throw Error()}catch{return setErr('请输入大于零、最多 18 位小数的金库预存 ETH。')}
  const receipt=await action('deployVault',SEPOLIA,async s=>(await new ContractFactory(vaultArtifact.abi,vaultArtifact.bytecode.object,s).deploy(PROXY,d.monitor,d.rule.token,{value:funding})).deploymentTransaction());
  if(receipt?.contractAddress)update({vault:receipt.contractAddress,vaultDeployBlock:receipt.blockNumber,hashes:{...d.hashes,deployVault:receipt.hash}});
 }
 async function bind(){if(!d.vault)return setErr('请先部署测试金库。');await action('bind',LASNA,s=>new Contract(d.monitor,monitorArtifact.abi,s).setRecipient(d.vault));}
 async function transfer(){if(!d.rule||!d.vault)return setErr('请先完成部署和绑定。');if(!state||!binding||state.triggered)return setErr('请先刷新链上状态，确认金库已绑定且规则尚未触发。');if(account.toLowerCase()!==d.rule.sender.toLowerCase())return setErr('请切换到规则中指定的监控账户。');
  const check=new JsonRpcProvider('https://lasna-rpc.rnk.dev/',LASNA,{staticNetwork:true});
  try{const m=new Contract(d.monitor,monitorArtifact.abi,check);const [triggered,recipient]=await Promise.all([m.triggered(),m.recipient()]);if(triggered)return setErr('规则已触发并退订，请保存记录后创建新规则。');if(recipient.toLowerCase()!==d.vault.toLowerCase())return setErr('链上绑定与当前金库不一致，请刷新并检查。')}catch{return setErr('无法核实监听状态，请检查网络后重试。')}finally{check.destroy()}
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
    if(block>0n){try{const filter=triggered?m.filters.PauseRequested(out.source):m.filters.TransferChecked(out.source);const logs=await m.queryFilter(filter,Number(block),Number(block));out.reactTx=logs.at(-1)?.transactionHash}catch{out.logError=true}}
    if(triggered&&out.reactTx){try{const records=await new Contract(SYSTEM,callbackRegistryABI,lasna).getCallbacks(BigInt(out.reactTx));const callback=summarizeCallback(records,d.monitor,SEPOLIA);out.callbackReceipt=callback.status;out.reportedCallbackTx=callback.tx||null}catch{out.callbackReceipt='unknown'}}
    try{out.monitorDebt=formatUnits(await new Contract(SYSTEM,payerABI,lasna).debt(d.monitor),18)}catch{out.monitorDebt=null}
   }
   if(d.vault){
    const v=new Contract(d.vault,vaultArtifact.abi,sepolia);const t=new Contract(d.rule.token,tokenABI,sepolia);
    const [paused,amount,balance,source,nativeBalance]=await Promise.all([v.paused(),v.lastAmount(),t.balanceOf(d.vault),v.lastSourceTx(),sepolia.getBalance(d.vault)]);
    Object.assign(out,{paused,vaultAmount:formatUnits(amount,18),balance:formatUnits(balance,18),vaultBalance:formatUnits(nativeBalance,18),callbackMatches:!!out.triggered&&out.source==='0x'+source.toString(16).padStart(64,'0')&&out.amount===formatUnits(amount,18)});
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
 const status=completed?(state.paused?'回调成功 · 金库已暂停':'回调曾成功 · 金库已恢复'):state?.callbackReceipt==='failed'?'回调记录失败 · 金库未确认':state?.triggered?'等待目标链执行 · 结果尚无法确认':observed?(below?'已收到事件 · 未达到阈值':'已收到事件 · 尚未请求回调'):binding?'等待事件':d.monitor?(state?'待连接金库':'状态尚未确认'):'尚未部署';
 const changeDraft=(part)=>{setConfirmed(false);setErr('');setExplanation('');if(Object.hasOwn(part,'threshold'))setAmountTouched(true);update({...part,rule:null});};
 const goToReview=()=>navigate('#rule-review');
 function saveAndStartNew(){
  try{
   const raw=localStorage.getItem('ruleline-archive-v1');const saved=raw?JSON.parse(raw):[];
   if(!Array.isArray(saved))throw Error('invalid archive');
   const next=[{savedAt:new Date().toISOString(),draft:d,lastRead:state},...saved];
   localStorage.setItem('ruleline-archive-v1',JSON.stringify(next));
   setArchives(next);setD({...defaults,sender:account||'',hashes:{}});setState(null);setReadFailed(false);setConfirmed(false);setErr('');setExplanation('');setMessage('已保留旧规则记录，可以创建新规则。');navigate('#rule-editor');
  }catch{setErr('无法保存旧规则记录，未创建新规则。请检查浏览器存储空间。')}
 }
 function restoreArchivedRule(entry){
  if(d.rule||d.monitor){try{const raw=localStorage.getItem('ruleline-archive-v1');const saved=raw?JSON.parse(raw):[];if(!Array.isArray(saved))throw Error();const next=[{savedAt:new Date().toISOString(),draft:d,lastRead:state},...saved];localStorage.setItem('ruleline-archive-v1',JSON.stringify(next));setArchives(next)}catch{setErr('无法保存当前规则，未恢复历史记录。');return}}
  if(!entry?.draft?.rule||!entry.draft.monitor){setErr('该历史记录缺少规则或监听合约，无法恢复。');return}
  setD({...defaults,...entry.draft,hashes:entry.draft.hashes||{}});setState(null);setReadFailed(false);setConfirmed(false);setErr('');setExplanation('');setMessage('已恢复历史规则。请刷新链上状态后继续操作。');navigate('#rule-review');
 }
 return <div ref={shell} className="experience-shell studio" data-page={page} data-intro-reveal={introRevealing} onClick={handleNavigation}>
  <div className="studio-pointer" aria-hidden="true"><i/></div>
  {opening&&<dialog ref={intro} className={'studio-intro'+(introLeaving?' is-leaving':'')+(introFading?' is-fading':'')} aria-labelledby="intro-title" onCancel={event=>{event.preventDefault();enter(false,true)}} data-silent>
   <div className="studio-intro-layout"><div className="opening-world" aria-hidden="true"/><div className="studio-intro-copy"><p>RULELINE / REACTIVE NETWORK</p>
    <h2 id="intro-title" aria-label={language==='en'?'Make rules visible.':'让规则，看得见。'}>
     {(language==='en'?['Make rules','visible.']:['让规则，','看得见。']).map((line,lineIndex)=><span className="intro-line" key={lineIndex} aria-hidden="true">{Array.from(line).map((character,index)=><span className="intro-letter" key={index} style={{'--letter':index+lineIndex*5,'--drift':`${(index%5-2)*20}px`,'--turn':`${(index%3-1)*14}deg`}}>{character===' '?'\u00a0':character}</span>)}</span>)}
    </h2><p className="intro-description">{language==='en'?'A clearer way to understand onchain automation.':'让每一个链上想法，都有迹可循。'}</p><div className="studio-intro-actions">
     <button type="button" disabled={introLeaving} onClick={()=>enter(true)}>{language==='en'?'Enter with sound':'开启音效并进入'} <span aria-hidden="true">↗</span></button>
     <button type="button" disabled={introLeaving} onClick={()=>enter(false)}>{language==='en'?'Enter muted':'静音进入'} <span aria-hidden="true">→</span></button>
    </div></div><button type="button" className="intro-skip" onClick={()=>enter(false,true)}>{language==='en'?'Skip intro':'跳过开场'} ↗</button></div>
  </dialog>}
  <a className="skip-link" href="#rule-editor">{language==='en'?'Skip to rule assistant':'跳到规则对话'}</a>
  <header className="experience-header">
   <a className="experience-brand" href="#top" aria-label={language==='en'?'Ruleline home':'Ruleline 首页'}><span className="studio-brand-icon" aria-hidden="true"><i/></span><span>Ruleline<small>{language==='en'?'Onchain rule interpreter':'链上规则翻译官'}</small></span></a>
   <div className="experience-header-actions">
    <button className="studio-sound" type="button" aria-label={language==='en'?'Interaction sound':'交互音效'} aria-pressed={sound} onClick={()=>changeSound(!sound)} data-silent><i aria-hidden="true"/><span>{language==='en'?'Sound':'音效'} <b>{language==='en'?(sound?'on':'off'):(sound?'开':'关')}</b></span></button>
    <button className="studio-language" type="button" onClick={()=>setLanguage(language==='zh'?'en':'zh')} aria-label={language==='zh'?'Switch to English':'切换到中文'}>{language==='zh'?'EN':'中文'}</button>
    <button className="studio-menu" type="button" aria-haspopup="dialog" onClick={()=>menu.current.showModal()}>{language==='en'?'Menu':'菜单'} <span aria-hidden="true">☰</span></button>
    <button className="wallet" onClick={()=>connect(true)}>{account?short(account):language==='en'?'Connect wallet':'连接钱包'} <span aria-hidden="true">↗</span></button>
   </div>
  </header>
  <dialog ref={menu} className="studio-chapters" aria-labelledby="chapter-title">
   <div className="studio-chapters-head"><h2 id="chapter-title">{language==='en'?'Menu':'菜单'}</h2><button type="button" onClick={()=>menu.current.close()}>{language==='en'?'Close':'关闭'} <span aria-hidden="true">×</span></button></div>
   <nav aria-label={language==='en'?'Page navigation':'页面导航'}>{chapters.map((chapter,index)=><a key={chapter.page} href={chapter.hash} aria-current={page===chapter.page?'page':undefined}>{language==='en'?['Home','Simulation','Create a rule','Review and execution','How it works','AI assistant'][index]:chapter.label}<span aria-hidden="true">↗</span></a>)}</nav>
  </dialog>
  <main id="top" ref={main} tabIndex={-1}>
   {walletError&&<p className="studio-wallet-error" role="status">{language==='en'?englishNotice(walletError):walletError}</p>}
   <div className="page-screen" hidden={page!=='home'}>{page==='home'&&<Immersive language={language}/>}
   </div>
   <div className="page-screen" hidden={page!=='demo'}><div className="page-navigation"><a href="#top">{language==='en'?'← Home':'← 返回首页'}</a><span>{language==='en'?'DEMO / SIMULATION':'互动演示 / 模拟'}</span></div><DemoWalkthrough language={language}/></div>
   <div className="page-screen creation-screen" hidden={page!=='create'&&page!=='home'} ref={creation}><figure className="rule-tree" aria-hidden="true"><div className="tree-viewport">{(page==='create'||page==='home')&&<TreeBackdrop container={creation} editor/>}</div></figure><div className="page-navigation"><a href="#top">{language==='en'?'← Home':'← 返回首页'}</a><span>{language==='en'?'CREATE A RULE / TESTNET':'创建规则 / 测试网'}</span></div>
   {!account&&<div className="wallet-gate" role="region" aria-label={language==='en'?'Wallet connection required':'请连接钱包'}><span>RULELINE / TESTNET</span><h2>{language==='en'?'Connect your wallet to create a rule.':'连接钱包，开始创建规则。'}</h2><p>{language==='en'?'Connect to use rule creation and execution. You can explore the site and simulation without a wallet.':'连接钱包后可创建规则并查看执行操作。你仍可在未连接时浏览网站和体验模拟。'}</p><button type="button" onClick={()=>connect(true)}>{language==='en'?'Connect wallet ↗':'连接钱包 ↗'}</button>{walletError&&<p className="wallet-gate-error" role="alert">{language==='en'?englishNotice(walletError):walletError}</p>}<small>{language==='en'?'This is a browser-side connection, not server-verified login. Rules saved in this browser are shared across wallet accounts.':'这是浏览器端的钱包连接，并非服务端身份认证。本机保存的规则会在不同钱包账户间共用。'}</small></div>}
   <div hidden={!account}>{language==='en'&&<p className="language-note" role="note">English rules currently support the example sentence below; adjust its amount to fit your rule.</p>}
   <section className="experience-stage" id="rule-editor" aria-label={language==='en'?'Ruleline rule assistant':'Ruleline 规则助手'}>
    <div className="experience-chat"><RuleBuilder language={language} draft={d} account={account} agent={agent} busy={busy||agentBusy} error={err} onChange={changeDraft} onConnect={connect} onTranslate={translate} onAITranslate={aiTranslate} onReview={goToReview} onCheckAgent={checkAgent}/></div>
    <aside className="experience-path" aria-label={language==='en'?'Rule execution path':'规则执行路径'}><span className="experience-path-label">{language==='en'?'Your rule path':'你的规则路径'}</span><ol><li className={isAddress(d.sender)?'known':''}><b>{language==='en'?'Monitor account':'监听账户'}</b><small>{isAddress(d.sender)?short(d.sender):language==='en'?'Awaiting input':'等待填写'}</small></li><li className={d.rule?'known':''}><b>{language==='en'?'Check amount':'判断金额'}</b><small>{d.rule?'≥ '+d.rule.threshold+' RCAMP':amountTouched&&d.threshold?'≥ '+d.threshold+(language==='en'?' RCAMP (to review)':' RCAMP（待核对）'):language==='en'?'Awaiting review':'等待确认'}</small></li><li className={state?.triggered?'known':''}><b>{language==='en'?'Request callback':'请求回调'}</b><small>{d.monitor&&!state?(language==='en'?'Not checked':'尚未查询'):state?.triggered?(language==='en'?'Requested':'已请求'):(language==='en'?'Not requested':'尚未请求')}</small></li><li className={completed?'known':''}><b>{language==='en'?'Pause test vault':'暂停测试金库'}</b><small>{completed?(language==='en'?'Callback confirmed':'回调已确认'):(language==='en'?'Not confirmed':'尚未确认')}</small></li></ol><p>{language==='en'?'The rule reacts after an event and only affects this project’s test vault.':'事件发生后才会触发，只作用于本项目测试金库。'}</p></aside>
   </section></div>
   </div>
   <div className="page-screen" hidden={page!=='review'}>{!account?<div className="wallet-gate wallet-gate-review"><h2>{language==='en'?'Connect your wallet to review and execute.':'连接钱包后查看核对与执行。'}</h2><button type="button" onClick={()=>connect(true)}>{language==='en'?'Connect wallet ↗':'连接钱包 ↗'}</button><a href="#top">{language==='en'?'← Home':'← 返回首页'}</a></div>:language==='en'?<ReviewEnglish {...{d,state,confirmed,setConfirmed,busy,agentBusy,agent,completed,observed,below,binding,readFailed,deposit,setDeposit,vaultFunding,setVaultFunding,err,message,explanation,refresh,deployMonitor,deployVault,bind,transfer,fundVault,resume,aiExplain,explorer,short,LASNA,SEPOLIA}}/>:<><div className="page-navigation"><a href="#top">← 返回首页</a><span>04 / 核对与执行</span><a href="#rule-editor">返回编辑规则 ↗</a></div>
   {!d.rule&&!d.monitor&&<div className="page-empty"><h2>还没有可执行的规则</h2><p>先创建并核对规则，再回到这里查看执行状态。</p><a href="#rule-editor">开始创建规则 ↗</a></div>}
   <div className="experience-after" hidden={!d.rule&&!d.monitor}>
   <div id="rule-review" tabIndex={-1}>
   {d.rule&&<section className="review" aria-label="部署前核对清单"><div className="review-heading"><div><span className="kicker">REVIEW BEFORE DEPLOYMENT</span><h2>部署前，请确认这一条规则</h2></div><span className="badge">仅测试网</span></div><dl><div><dt>监听账户</dt><dd>{d.rule.sender}</dd></div><div><dt>监听代币</dt><dd>RCAMP · {d.rule.token}</dd></div><div><dt>单笔触发阈值</dt><dd>≥ {d.rule.threshold} RCAMP</dd></div><div><dt>目标金库</dt><dd>{d.vault||'将在 Sepolia 新部署本项目测试金库'}</dd></div><div><dt>网络与动作</dt><dd>Sepolia 转账 → Lasna 判断 → Sepolia 暂停提款</dd></div><div><dt>预计预存与费用</dt><dd>监听合约 0.1 lREACT；金库预存金额可在下方调整。另需部署、绑定和转账 Gas，具体以钱包为准。预存过少可能导致回调失败。</dd></div></dl><p>规则只处理发生后的事件，首次达标请求回调后退订；回调可能延迟或失败，不会自动重试或重新启用。</p>{!d.monitor&&<label className="confirmation"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 我已核对账户、代币、阈值、网络、金库和测试网费用，理解这是一次性规则。</label>}</section>}
   </div>
   <div className="section-head run-head" id="evidence"><div><span className="kicker">链上执行</span><h2>让规则开始工作</h2></div><button className="text-btn" onClick={refresh} disabled={busy}>↻ 刷新链上状态</button></div>
   <section className="execution"><div className="run-summary"><div><span className="summary-label">当前状态</span><h3><i className={'status-dot '+(completed?'danger':'')}/>{status}</h3><p>{completed?(state.paused?'金库记录了同一笔源交易，当前提款已暂停。':'金库曾处理该源交易，当前已恢复提款；监听不会重启。'):state?.callbackReceipt==='failed'?'系统回执记录了回调错误，请查看交易并排查；当前不会自动重试。':state?.triggered?'监听合约已请求回调，尚不能确认目标链执行。':'依次完成部署、绑定，再发送测试转账。'}</p></div><div className="balance"><span>金库代币余额</span><b>{state?.balance??'—'} <small>RCAMP</small></b></div></div>
    <ExecutionPath {...{d,state,observed,completed,below,binding,readFailed}}/>
    <div className="actions"><div className="action"><div className="number">1</div><div><b>部署监听合约</b><p>Lasna · 预存 0.1 lREACT + Gas</p></div><button disabled={busy||!d.rule||!confirmed||!!d.monitor} onClick={deployMonitor}>{d.monitor?'已部署':'部署 ↗'}</button></div><div className="action"><div className="number">2</div><div><b>部署测试金库</b><p>Sepolia · 预存 ETH + Gas</p><label>金库预存（测试 ETH） <input aria-label="金库预存测试 ETH" inputMode="decimal" value={vaultFunding} onChange={e=>setVaultFunding(e.target.value)} disabled={busy||!!d.vault}/></label><p>预存过少可能无法支付回调费用；部署 Gas 和后续转账另算。</p></div><button disabled={busy||!d.monitor||!!d.vault} onClick={deployVault}>{d.vault?'已部署':'部署 ↗'}</button></div><div className="action"><div className="number">3</div><div><b>连接监听与金库</b><p>Lasna · 绑定金库地址 + Gas</p></div><button disabled={busy||!d.vault||!!d.hashes.bind} onClick={bind}>{d.hashes.bind?'已绑定':'连接 ↗'}</button></div><div className="action"><div className="number">4</div><div><b>发送测试转账</b><p>Sepolia · 向自己转 RCAMP，需 Gas；先刷新状态</p></div><button disabled={busy||!state||!binding||!!state?.triggered} onClick={transfer}>测试触发 ↗</button></div></div>
    <div className="vault-extra"><div><b>金库操作</b><p>存入也是转账，达到阈值会触发。规则触发一次后退订；恢复提款不会重新启用监听。</p></div><div className="vault-controls"><input aria-label="存入数量" value={deposit} onChange={e=>setDeposit(e.target.value)}/><button disabled={busy||!d.vault} onClick={fundVault}>存入测试币</button><button disabled={busy||!state?.paused} onClick={resume}>恢复提款</button></div></div>
    <div className="notice" role="status">{err?<><b>需要处理：</b> {err}</>:message}</div>
    <div className="notice"><b>状态解释：</b>{!state?'尚未读取本项目的链上状态，执行结果尚未确认。':completed?(state.paused?'已核对源交易，金库当前暂停提款。':'相同源交易曾触发金库暂停，目前金库已恢复。'):state.callbackReceipt==='failed'?'系统回执记录了回调错误；请查看目标链交易。':state.triggered?'监听合约已请求回调，但目标链结果尚未确认。':observed?'已收到事件，最近一次数量为 '+state.amount+' RCAMP。':'尚未观察到本规则的链上执行。'} {state?.checkedAt&&<span>最近读取：{state.checkedAt}。 </span>}{state?.logError&&<span>部分日志查询失败，交易证据暂不可用。 </span>}<button className="text-btn" disabled={agentBusy||!agent?.configured} onClick={aiExplain}>让 AI 解释 ↗</button>{!agent?.configured&&<span>（AI 尚未配置或不可用）</span>}{explanation&&<p>{state&&(d.monitor||d.vault)?'AI：':'状态提示：'}{explanation}</p>}</div>
    <FundingHealth {...{state,d}}/>
    <div className="evidence"><div><small>监听合约 · LASNA</small>{d.monitor?<a href={explorer(LASNA,'address',d.monitor)} target="_blank" rel="noreferrer">{short(d.monitor)} ↗</a>:<span>等待部署</span>}</div><div><small>测试金库 · SEPOLIA</small>{d.vault?<a href={explorer(SEPOLIA,'address',d.vault)} target="_blank" rel="noreferrer">{short(d.vault)} ↗</a>:<span>等待部署</span>}</div><div><small>已观察到的源链转账</small>{observed?<a href={explorer(SEPOLIA,'tx',state.source)} target="_blank" rel="noreferrer">{short(state.source)} ↗</a>:d.hashes.source?<a href={explorer(SEPOLIA,'tx',d.hashes.source)} target="_blank" rel="noreferrer">{short(d.hashes.source)} ↗</a>:<span>等待事件</span>}</div><div><small>REACTIVE 执行</small>{state?.reactTx?<a href={explorer(LASNA,'tx',state.reactTx)} target="_blank" rel="noreferrer">{short(state.reactTx)} ↗</a>:<span>尚无证据</span>}</div><div><small>目标链回调</small>{state?.callbackTx?<a href={explorer(SEPOLIA,'tx',state.callbackTx)} target="_blank" rel="noreferrer">{short(state.callbackTx)} ↗</a>:<span>尚无证据</span>}</div></div>
   </section>
   </div>
   </>}{account&&d.monitor&&<div className="rule-archive-actions"><p>{language==='en'?'A rule fires once. Save this local record before creating a new one.':'规则触发一次后退订。创建新规则前，可先保存本机历史记录。'}</p><button type="button" disabled={busy} onClick={saveAndStartNew}>{language==='en'?'Save record and create another rule ↗':'保存记录并创建新规则 ↗'}</button></div>}{account&&archives.length>0&&<details className="rule-archive-actions"><summary>{language==='en'?`Saved records (${archives.length})`:`本机历史记录（${archives.length}）`}</summary>{archives.map((entry,index)=><div className="rule-archive-entry" key={`${entry.savedAt}-${index}`}><b>{entry.draft?.rule?.threshold??'—'} RCAMP</b><span>{new Date(entry.savedAt).toLocaleString()}</span>{entry.draft?.rule&&entry.draft?.monitor&&<button type="button" disabled={busy} onClick={()=>restoreArchivedRule(entry)}>{language==='en'?'Restore rule':'恢复规则'}</button>}{entry.draft?.monitor&&<a href={explorer(LASNA,'address',entry.draft.monitor)} target="_blank" rel="noreferrer">{language==='en'?'Monitor ↗':'监听合约 ↗'}</a>}{entry.draft?.vault&&<a href={explorer(SEPOLIA,'address',entry.draft.vault)} target="_blank" rel="noreferrer">{language==='en'?'Test vault ↗':'测试金库 ↗'}</a>}{entry.lastRead?.source&&<a href={explorer(SEPOLIA,'tx',entry.lastRead.source)} target="_blank" rel="noreferrer">{language==='en'?'Source event ↗':'源交易 ↗'}</a>}</div>)}</details>}</div>
   <div className="page-screen" hidden={page!=='guide'}>{language==='en'?<><div className="page-navigation"><a href="#top">← Home</a><span>HOW IT WORKS</span></div><section className="rule-story" id="guide"><header className="rule-story-hero"><span>A RULE'S JOURNEY / TESTNET</span><h2>From an idea<br/><em>to an onchain response.</em></h2><p>Turn an idea into reviewable conditions, then follow its cross-chain execution.</p></header><div className="rule-story-list"><article><span>01 / SEPOLIA</span><h3>The transfer happens.</h3><p>After the specified account sends RCAMP, the token contract emits an event. The rule reacts after the transfer and cannot prevent it.</p></article><article><span>02 / LASNA</span><h3>Listen and check.</h3><p>The Reactive contract checks the sender and the amount of each transfer. If it meets the confirmed threshold, a cross-chain callback is requested.</p></article><article><span>03 / SEPOLIA</span><h3>Request a pause.</h3><p>If the destination processes the callback successfully, this project's test vault pauses withdrawals. Callbacks can be delayed or fail; the user's wallet and other protocols are not paused.</p></article><article><span>04 / EVIDENCE</span><h3>Verify the outcome.</h3><p>Refresh the onchain state and inspect transaction links. AI can explain retrieved facts; missing evidence is shown as waiting or unconfirmed.</p></article></div><div className="rule-story-end"><p>Try the simulation, then create your own rule.</p><a href="#demo">Open simulation ↗</a><a href="#rule-editor">Create a rule ↗</a></div></section><footer>RULELINE <span>Understand every onchain response.</span><a href="https://dev.reactive.network/reactive-contracts" target="_blank" rel="noreferrer">Reactive documentation ↗</a></footer></>:<><div className="page-navigation"><a href="#top">← 返回首页</a><span>工作原理</span></div><section className="rule-story" id="guide">
    <header className="rule-story-hero"><span>一条规则的旅程 / 测试网</span><h2>从一句话，<br/><em>到链上响应。</em></h2><p>把想法整理成可核对的条件，再追踪它如何跨链执行。</p></header>
    <div className="rule-story-list">
     <article><span>01 / SEPOLIA</span><h3>转账已经发生。</h3><p>指定账户转出 RCAMP 后，代币合约产生转账事件。规则对已经发生的事件作出反应，无法阻止这笔转账。</p></article>
     <article><span>02 / LASNA</span><h3>监听，判断。</h3><p>Reactive 合约接收事件，检查转出账户和单笔金额。达到你核对的阈值时，请求跨链回调。</p></article>
     <article><span>03 / SEPOLIA</span><h3>请求暂停提款。</h3><p>目标链成功处理回调后，本项目的测试金库暂停提款。回调可能延迟或失败，账户和其他协议不会因此被暂停。</p></article>
     <article><span>04 / 证据</span><h3>用证据看结果。</h3><p>刷新链上状态并查看交易链接。AI 可以解释已读取的事实，缺少证据时，页面会显示等待或无法确认。</p></article>
    </div><div className="rule-story-end"><p>先试一遍，再创建自己的规则。</p><a href="#demo">打开互动演示 ↗</a><a href="#rule-editor">创建规则 ↗</a></div></section>
   <footer>RULELINE <span>为清楚理解每一次链上执行而做。</span><a href="https://dev.reactive.network/reactive-contracts" target="_blank" rel="noreferrer">Reactive 官方文档 ↗</a></footer></>}</div>
   <div className="page-screen" hidden={page!=='assistant'}><AssistantChat language={language} agent={agent} onBack={()=>navigate('#top')} onCheckAgent={checkAgent}/></div>
  </main>{page!=='assistant'&&<a className="assistant-orb" href="#assistant" aria-label={language==='en'?'Open AI assistant':'打开 AI 助手'}><span>✦</span><small>{language==='en'?'AI assistant':'AI 助手'}</small></a>}</div>
}
createRoot(document.getElementById('root')).render(<App/>);
