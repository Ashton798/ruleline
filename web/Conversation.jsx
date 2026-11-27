import React, {useEffect, useRef, useState} from 'react';
import {isAddress, parseUnits} from 'ethers';
import './conversation.css';
import {englishNotice} from './englishNotice';
import {englishRuleToChinese} from './parser';

const RCAMP = '0x96E9530cc78599b115a0e5e5873a2E88F661a977';

function amountError(value) {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return '请输入大于零的有效数量，例如 10 或 0.5。';
  try {
    const amount = parseUnits(value, 18);
    if (amount <= 0n || amount >= 2n ** 256n) return '数量必须大于零，且不能超出支持范围。';
  } catch {
    return '数量无效，最多支持 18 位小数。';
  }
  return '';
}

function addressError(value) {
  return !value ? '请输入要监听的账户地址。' : !isAddress(value) ? '账户地址无效，请输入完整的以 0x 开头的钱包地址。' : '';
}

function tokenError(value) {
  return !value || !isAddress(value) || value.toLowerCase() !== RCAMP.toLowerCase()
    ? 'RCAMP 测试代币地址无效，请检查配置。' : '';
}

function textAmountError(text) {
  const matches = [...text.matchAll(/(?:^|[^\d.])(-?\d+(?:\.\d+)?)\s*RCAMP\b/gi)];
  if (matches.length !== 1) return '请在规则中明确填写一个 RCAMP 数量，例如“达到 10 RCAMP”。';
  return amountError(matches[0][1]);
}

export default function Conversation({draft, account, agent, busy, error, onChange, onConnect, onTranslate, onAITranslate, onReview, onCheckAgent, language = 'zh'}) {
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState('welcome');
  // Do not treat a previously populated draft threshold as a new user answer.
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState('');
  const previousRule = useRef(draft.rule);
  const pending = useRef(false);
  const locked = Boolean(draft.monitor);
  const disabled = Boolean(busy) || locked;
  const aiReady = Boolean(agent?.configured && !agent?.unavailable);

  useEffect(() => {
    if (draft.rule && draft.rule !== previousRule.current) {
      pending.current = false;
      setNotice('');
      setStep('candidate');
    }
    previousRule.current = draft.rule;
  }, [draft.rule]);

  useEffect(() => {
    if (pending.current && !busy && error) {
      pending.current = false;
    }
  }, [busy, error]);

  function change(partial) {
    setNotice('');
    onChange({...partial, rule: null});
  }
  function showNotice(message) {
    setNotice(message);
  }

  function choose(nextMode) {
    setMode(nextMode);
    setNotice('');
    setStep(nextMode === 'direct' ? 'direct' : 'account');
  }

  function nextAccount() {
    const message = addressError(draft.sender?.trim());
    if (message) return showNotice(message);
    setNotice('');
    setStep('token');
  }

  function nextToken() {
    const message = tokenError(draft.token?.trim());
    if (message) return showNotice(message);
    setNotice('');
    setStep('amount');
  }

  function makeSentence() {
    const message = amountError(amount.trim());
    if (message) return showNotice(message);
    const text = `当指定账户单笔转出达到 ${amount.trim()} RCAMP 时，暂停测试金库。`;
    onChange({text, threshold: amount.trim(), rule: null});
    setStep('translate');
  }

  function translate(useAI) {
    const sender = draft.sender?.trim() || '';
    const token = draft.token?.trim() || '';
    const text = draft.text?.trim() || '';
    const message = addressError(sender) || tokenError(token) || (!text ? '请输入完整的中文规则。' : textAmountError(text));
    if (message) return showNotice(message);
    if (!englishRuleToChinese(text) && (!/(暂停|停止)/.test(text) || !/测试金库/.test(text))) {
      return showNotice('还缺少触发后的动作。请写明“暂停测试金库”，也可以点击下方的“填写完整示例”。');
    }
    if (useAI && !aiReady) return showNotice('AI 服务当前不可用，请选择本地规则匹配。');
    setNotice('');
    pending.current = true;
    const payload = {text, sender, token};
    if (useAI) onAITranslate(payload);
    else onTranslate(payload);
  }

  const candidate = draft.rule;
  const showCandidate = Boolean(candidate && (step === 'candidate' || locked || (step === 'welcome' && candidate)));
  const aiReason = !agent ? '正在检查 AI 服务状态。' : agent.unavailable ? 'AI 服务未运行。请打开项目文件夹中的“启动AI配置.cmd”，输入 API Key 后保持窗口打开。页面会自动重新检查。' : !agent.configured ? 'AI 服务已启动，尚未配置 API Key 和模型。请使用项目文件夹中的“启动AI配置.cmd”。' : '';
  const back = (target) => { setNotice(''); setStep(target); };

  if (language === 'en') return <section className="conversation" aria-label="Rule assistant">
    <div className="conversation-heading"><div><span className="conversation-eyebrow">RULE ASSISTANT · TESTNET</span><h2>Turn an idea into a rule.</h2><p>Review each condition before deploying to the testnet.</p></div><span className="conversation-network">Testnet</span></div>
    <div className="conversation-thread" aria-live="polite">
      <div className="conversation-message"><span className="conversation-avatar" aria-hidden="true">✦</span><div className="conversation-bubble"><span className="conversation-speaker">Rule assistant</span><p>Enter the monitored account and describe your rule. Start with the supported example below.</p></div></div>
      {showCandidate ? <div className="conversation-card conversation-candidate">
        <div className="conversation-card-label">Candidate rule <span>REVIEW</span></div><h3>Check your rule</h3><p>Reviewing this rule does not deploy a contract or send a transaction.</p>
        <dl className="conversation-details"><div><dt>Account</dt><dd className="conversation-mono">{candidate.sender}</dd></div><div><dt>Token</dt><dd>RCAMP <span className="conversation-mono">{candidate.token}</span></dd></div><div><dt>Threshold</dt><dd>Single outgoing transfer ≥ {candidate.threshold} RCAMP</dd></div><div><dt>Action</dt><dd>Pause the test vault</dd></div><div><dt>Network</dt><dd>Sepolia → Reactive Lasna</dd></div><div><dt>Method</dt><dd>{candidate.source === 'AI' ? 'AI' : 'Local rule matching'}</dd></div></dl>
        <div className="conversation-actions">{!locked&&<button type="button" className="conversation-secondary" onClick={()=>back('direct')} disabled={busy}>Edit</button>}<button type="button" className="conversation-primary" onClick={onReview} disabled={busy}>Review deployment →</button></div>
      </div> : <div className="conversation-card">
        <div className="conversation-card-label">Describe the rule</div><h3>What should trigger the rule?</h3><p>English currently supports the example sentence; you can edit the amount.</p>
        <label htmlFor="conversation-en-text">Rule</label><textarea id="conversation-en-text" value={draft.text || ''} onChange={e=>change({text:e.target.value})} disabled={disabled} rows="3" />
        <div className="conversation-example"><button type="button" className="conversation-link" disabled={disabled} onClick={()=>change({text:'When the specified account transfers at least 10 RCAMP in one transaction, pause withdrawals from the test vault.'})}>Fill example rule</button></div>
        <label htmlFor="conversation-en-account">Monitored account address</label><input id="conversation-en-account" value={draft.sender || ''} onChange={e=>change({sender:e.target.value})} placeholder="0x..." autoComplete="off" spellCheck="false" disabled={disabled}/>
        <div className="conversation-inline"><button type="button" className="conversation-link" onClick={onConnect} disabled={disabled}>Connect wallet</button>{account&&<button type="button" className="conversation-link" onClick={()=>change({sender:account})} disabled={disabled}>Use connected account</button>}</div>
        {(notice || error)&&<div className="conversation-alert conversation-alert--inline" role="alert">{englishNotice(notice || error)}</div>}
        <div className="conversation-translate-options"><button type="button" className="conversation-primary" onClick={()=>translate(false)} disabled={disabled}>Local rule matching →</button><button type="button" className="conversation-ai-button" onClick={()=>translate(true)} disabled={disabled || !aiReady}>✦ AI translation</button></div>
        <p className="conversation-hint">Local matching uses fixed rules. For AI translation, the supported English template is converted to Chinese before the rule and addresses are sent to the provider. Charges may apply. Do not enter private keys or recovery phrases.</p>
        <p className="conversation-ai-status">{!agent?'Checking AI service.':agent.unavailable?'AI service is not running. Start the local AI configuration to use AI translation.':!agent.configured?'AI service is running but not configured.':'AI is configured. A successful model call confirms connectivity.'} {onCheckAgent&&<button type="button" className="conversation-link" onClick={onCheckAgent} disabled={disabled}>Check AI status</button>}</p>
      </div>}
      {busy&&<div className="conversation-working" role="status">Processing…</div>}
    </div><div className="conversation-footer">Review first. You control the transaction · Testnet only</div>
  </section>;

  return (
    <section className="conversation" aria-label="规则对话工作台">
      <div className="conversation-heading">
        <div><span className="conversation-eyebrow"><span className="conversation-status-dot" /> 规则助手 · 测试网</span><h2>让想法，变成规则。</h2><p>用熟悉的语言描述条件，我们一起把它整理成可以核对的测试网规则。</p></div>
        <span className="conversation-network">测试网模式</span>
      </div>

      <div className="conversation-thread" aria-live="polite" aria-relevant="additions text">
        <div className="conversation-message conversation-message--assistant">
          <span className="conversation-avatar" aria-hidden="true">✦</span>
          <div className="conversation-bubble"><span className="conversation-speaker">规则助手</span><p>你好，我可以帮你整理一条监控规则。先选择你喜欢的方式，所有内容都可以在部署前核对。</p></div>
        </div>

        {step === 'welcome' && !showCandidate && <div className="conversation-card conversation-enter">
          <div className="conversation-card-label">选择开始方式</div>
          <div className="conversation-choice-grid">
            <button type="button" className="conversation-choice" onClick={() => choose('direct')} disabled={disabled}><span className="conversation-choice-icon">✎</span><strong>直接描述规则</strong><small>我已经知道想要什么</small><span aria-hidden="true">↗</span></button>
            <button type="button" className="conversation-choice" onClick={() => choose('guided')} disabled={disabled}><span className="conversation-choice-icon">✧</span><strong>一步步引导我</strong><small>从账户和条件开始</small><span aria-hidden="true">↗</span></button>
          </div>
        </div>}

        {step === 'account' && <div className="conversation-card conversation-enter">
          <div className="conversation-card-label">引导设置 <span>01 / 03</span></div><h3>监听哪个账户？</h3><p>当这个账户转出 RCAMP 时，规则才会检查数量。</p>
          <label htmlFor="conversation-account">监听账户地址</label><input id="conversation-account" value={draft.sender || ''} onChange={e => change({sender: e.target.value})} placeholder="0x..." autoComplete="off" spellCheck="false" disabled={disabled} />
          <div className="conversation-inline"><button type="button" className="conversation-link" onClick={onConnect} disabled={disabled}>{account ? '切换或重新连接钱包' : '连接钱包'}</button>{account && <button type="button" className="conversation-link" onClick={() => change({sender: account})} disabled={disabled}>使用已连接账户</button>}</div>
          <p className="conversation-hint">连接钱包由你主动发起；也可以直接粘贴地址。无需提供私钥或助记词。</p>
          <div className="conversation-actions"><button type="button" className="conversation-secondary" onClick={() => back('welcome')} disabled={disabled}>返回</button><button type="button" className="conversation-primary" onClick={nextAccount} disabled={disabled}>下一步 <span aria-hidden="true">→</span></button></div>
        </div>}

        {step === 'token' && <div className="conversation-card conversation-enter">
          <div className="conversation-card-label">引导设置 <span>02 / 03</span></div><h3>确认测试代币</h3><p>目前支持 Sepolia 测试网上的 RCAMP 测试代币。</p>
          <div className="conversation-token"><span className="conversation-token-icon">R</span><div><strong>RCAMP</strong><small>Sepolia 测试网</small></div><span className="conversation-token-tag">测试代币</span></div>
          <div className="conversation-address">合约地址 <span>{draft.token || '未配置'}</span></div>
          <div className="conversation-actions"><button type="button" className="conversation-secondary" onClick={() => back('account')} disabled={disabled}>上一步</button><button type="button" className="conversation-primary" onClick={nextToken} disabled={disabled}>确认并继续 <span aria-hidden="true">→</span></button></div>
        </div>}

        {step === 'amount' && <div className="conversation-card conversation-enter">
          <div className="conversation-card-label">引导设置 <span>03 / 03</span></div><h3>转出多少时触发？</h3><p>输入单笔转出的最低数量，达到或超过这个数量时触发。</p>
          <label htmlFor="conversation-amount">触发阈值</label><div className="conversation-input-unit"><input id="conversation-amount" type="text" inputMode="decimal" value={amount} onChange={e => {setAmount(e.target.value); setNotice(''); change({threshold:e.target.value});}} placeholder="输入数量" disabled={disabled} /><span>RCAMP</span></div>
          <p className="conversation-hint">请输入大于零的数量，最多支持 18 位小数。</p>
          <div className="conversation-actions"><button type="button" className="conversation-secondary" onClick={() => back('token')} disabled={disabled}>上一步</button><button type="button" className="conversation-primary" onClick={makeSentence} disabled={disabled}>生成规则描述 <span aria-hidden="true">→</span></button></div>
        </div>}

        {(step === 'direct' || step === 'translate') && <div className="conversation-card conversation-enter">
          <div className="conversation-card-label">{step === 'direct' ? '直接描述' : '规则描述已准备'} <span>待翻译</span></div><h3>{step === 'direct' ? '写下你的规则' : '看看这是否是你的意思'}</h3><p>{step === 'direct' ? '例如，当你的账户单笔转出 10 RCAMP 或更多时，让本项目的测试金库暂停提款。' : '确认下面的描述，再选择一种翻译方式。'}</p>
          <label htmlFor="conversation-text">中文规则</label><textarea id="conversation-text" rows="3" value={draft.text || ''} onChange={e => change({text: e.target.value})} placeholder="例如：当指定账户单笔转出达到 10 RCAMP 时，暂停测试金库。" disabled={disabled || step === 'translate'} />
          {step === 'direct' && <div className="conversation-example"><span>完整示例：当指定账户单笔转出达到 10 RCAMP 时，暂停测试金库。</span><button type="button" className="conversation-link" disabled={disabled} onClick={() => change({text:'当指定账户单笔转出达到 10 RCAMP 时，暂停测试金库。'})}>填写完整示例</button></div>}
          {(notice || error) && <div className="conversation-alert conversation-alert--inline" role="alert">{notice || error}</div>}
          {step === 'direct' && <><label htmlFor="conversation-direct-account">监听账户地址</label><input id="conversation-direct-account" value={draft.sender || ''} onChange={e => change({sender: e.target.value})} placeholder="0x..." autoComplete="off" spellCheck="false" disabled={disabled} /><div className="conversation-inline"><button type="button" className="conversation-link" onClick={onConnect} disabled={disabled}>{account ? '切换或重新连接钱包' : '连接钱包'}</button>{account && <button type="button" className="conversation-link" onClick={() => change({sender: account})} disabled={disabled}>使用已连接账户</button>}</div></>}
          <div className="conversation-translate-options"><button type="button" className="conversation-primary" onClick={() => translate(false)} disabled={disabled}>本地规则匹配 <span aria-hidden="true">→</span></button><button type="button" className="conversation-ai-button" onClick={() => translate(true)} disabled={disabled || !aiReady}>✦ AI 翻译</button></div>
          <p className="conversation-hint">本地匹配只识别支持的固定规则，不是 AI，不会发送规则内容。AI 翻译会将规则文字及其中的地址发送给所配置的服务商，可能产生费用；请勿输入私钥、助记词或其他敏感信息。</p>
          {aiReady && <p className="conversation-ai-status">AI 服务商：{agent.provider || '已配置'}{agent.endpoint ? ' · ' + agent.endpoint : ''}。模型连接以实际调用结果为准。</p>}
          {aiReason && <p className="conversation-ai-status">{aiReason} {onCheckAgent && <button type="button" className="conversation-link" onClick={onCheckAgent} disabled={disabled}>重新检查 AI 配置</button>}</p>}
          <div className="conversation-actions conversation-actions--start"><button type="button" className="conversation-secondary" onClick={() => back(step === 'direct' ? 'welcome' : 'amount')} disabled={disabled}>上一步</button></div>
        </div>}

        {showCandidate && <div className="conversation-card conversation-candidate conversation-enter">
          <div className="conversation-card-label">候选规则 <span>等待核对</span></div><h3>规则已经整理好了</h3><p>请仔细确认以下内容。进入核对页面不会自动部署或发送交易。</p>
          <dl className="conversation-details"><div><dt>监听账户</dt><dd className="conversation-mono">{candidate.sender || draft.sender}</dd></div><div><dt>代币</dt><dd>RCAMP <span className="conversation-mono">{candidate.token || draft.token}</span></dd></div><div><dt>触发条件</dt><dd>单笔转出达到或超过 {candidate.threshold} RCAMP</dd></div><div><dt>执行动作</dt><dd>暂停测试金库</dd></div><div><dt>网络</dt><dd>Sepolia 测试网 → Reactive Lasna 测试网</dd></div><div><dt>生成方式</dt><dd>{candidate.source || '规则候选'}</dd></div></dl>
          {locked && <p className="conversation-hint">监听合约已部署，规则已锁定，不能在这里修改。</p>}
          <div className="conversation-actions">{!locked && <button type="button" className="conversation-secondary" onClick={() => back(mode === 'guided' ? 'amount' : 'direct')} disabled={busy}>返回修改</button>}<button type="button" className="conversation-primary" onClick={onReview} disabled={busy}>进入部署前核对 <span aria-hidden="true">→</span></button></div>
        </div>}
        {(notice || error) && step !== 'direct' && step !== 'translate' && <div className="conversation-alert" role="alert">{notice || error}</div>}
        {busy && <div className="conversation-working" role="status"><span className="conversation-spinner" /> 正在处理，请稍候…</div>}
      </div>
      <div className="conversation-footer"><span>✧</span> 规则先核对，操作由你决定 <span>·</span> 仅用于测试网</div>
    </section>
  );
}
