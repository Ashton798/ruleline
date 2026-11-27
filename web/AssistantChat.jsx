import React, {useRef, useState} from 'react';
import './assistant-chat.css';

export default function AssistantChat({agent, onBack, onCheckAgent, language = 'zh'}) {
  const en = language === 'en';
  const zhipu = agent?.endpoint === 'https://open.bigmodel.cn';
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  async function send(event) {
    event.preventDefault();
    if (busy || (!text.trim() && !file)) return;
    setError('');
    if (!agent?.configured) { setError(en?'AI service is not connected. Start the local AI service and try again.':'AI 服务未连接，请启动本机 AI 配置后重试。'); return; }
    const next = [...messages, {role:'user', content:text.trim() || (en?'Please describe this attachment.':'请描述这个附件。'), filename:file?.name}];
    setMessages(next);
    setText('');
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
    setBusy(true);
    try {
      const data = file ? await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=>resolve(reader.result);
        reader.onerror = ()=>reject(new Error(en?'Could not read the attachment.':'附件读取失败。'));
        reader.readAsDataURL(file);
      }) : undefined;
      const response = await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next.slice(-12).map(({role,content})=>({role,content})),...(data?{attachment:{data}}:{})})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (en?'Chat request failed.':'对话请求失败。'));
      setMessages(current=>[...current,{role:'assistant',content:result.answer}]);
    } catch (failure) { setMessages(current=>current.slice(0,-1)); setError(failure.message || (en?'Request failed. Please try again.':'请求失败，请重试。')); setText(next.at(-1).content); if(file)setFile(file); }
    finally { setBusy(false); }
  }

  function choose(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (zhipu && (!['image/jpeg','image/png'].includes(selected.type) || selected.size > 3 * 1024 * 1024)) {
      setError(en?'Zhipu accepts JPG or PNG images up to 3 MB. Local video upload is not yet supported.':'智谱模式目前支持不超过 3 MB 的 JPG、PNG 图片，本地视频上传尚未适配。');
      event.target.value = ''; return;
    }
    if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(selected.type) || selected.size > 3 * 1024 * 1024) {
      setError(en?'Choose a JPG, PNG, WebP, MP4 or WebM file up to 3 MB.':'请选择 3 MB 以内的 JPG、PNG、WebP、MP4 或 WebM 文件。');
      event.target.value = '';
      return;
    }
    setError(''); setFile(selected);
  }

  return <section className="assistant-chat" aria-label={en?'AI assistant':'AI 助手'}>
    <header className="assistant-chat-header"><button type="button" onClick={onBack}>{en?'← Back':'← 返回'}</button><span>{en?'RULELINE / AI ASSISTANT':'RULELINE / AI 助手'}</span><button type="button" onClick={onCheckAgent}>{en?'Check connection':'检查连接'}</button></header>
    <div className="assistant-chat-layout"><div className="assistant-chat-content">
      <div className="assistant-chat-title"><p>{en?'AI ASSISTANT':'AI 助手'}</p><h2>{en?<>Hello,<br/>what's on your mind?</>:<>你好，<br/>想聊些什么？</>}</h2><p>{zhipu?(en?'Ask a question or share an image. Local video upload is not yet supported.':'可以提问或上传图片；智谱模式暂不支持本地视频上传。'):(en?'Ask me anything, or share an image or a video.':'可以问我任何问题，也可以带上一张图片或一段视频。')}</p></div>
      <div className="assistant-messages" aria-live="polite">{messages.map((message,index)=><div key={index} className={'assistant-message '+message.role}><small>{message.role==='user'?(en?'You':'你'):(en?'AI assistant':'AI 助手')}</small><p>{message.content}</p>{message.filename&&<small>{en?'Attachment: ':'附件：'}{message.filename}</small>}</div>)}{busy&&<p className="assistant-chat-wait">{en?'Thinking…':'正在思考…'}</p>}</div>
      {error&&<p className="assistant-chat-error" role="alert">{error}</p>}
      <form className="assistant-chat-form" onSubmit={send}><label className="assistant-attach">＋<span className="sr-only">{zhipu?(en?'Upload an image':'上传图片'):(en?'Upload an image or video':'上传图片或视频')}</span><input ref={fileInput} type="file" accept={zhipu?'image/png,image/jpeg':'image/png,image/jpeg,image/webp,video/mp4,video/webm'} onChange={choose} disabled={busy}/></label><textarea aria-label={en?'Your question':'输入问题'} value={text} onChange={event=>setText(event.target.value)} placeholder={en?'Ask a question…':'输入你的问题…'} rows="2" disabled={busy}/><button type="submit" disabled={busy||(!text.trim()&&!file)}>{en?'Send ↗':'发送 ↗'}</button></form>
      {file&&<p className="assistant-file">{en?'Selected: ':'已选择：'}{file.name} <button type="button" onClick={()=>{setFile(null);if(fileInput.current)fileInput.current.value=''}}>{en?'Remove':'移除'}</button></p>}
      <p className="assistant-chat-note">{zhipu?(en?'Your question, recent conversation and selected image are sent to Zhipu and may incur charges. Images must be JPG or PNG up to 3 MB.':'问题、最近对话和所选图片会发送给智谱，可能产生费用。图片须为不超过 3 MB 的 JPG 或 PNG。'):(en?'Your question, recent conversation text and selected attachment are sent to the configured AI provider and may incur charges. You can upload one file up to 3 MB per message; select it again to ask another question about it. Video frames are analyzed by a vision model.':'发送时会将问题、最近对话文字和本次所选附件发给配置的 AI 服务商，可能产生费用。每次最多上传一个 3 MB 文件；再次提问时如需分析同一附件，请重新选择。视频由视觉模型分析画面。')}</p>
      {!agent?.configured&&<p className="assistant-chat-error">{en?'AI is not connected. Start the local AI service to use it.':'AI 服务当前未连接，启动本机配置后可使用。'}</p>}
    </div><div className="assistant-chat-art" aria-hidden="true"><div className={'assistant-chat-sphere '+(busy?'is-thinking':error?'is-error':text?'is-listening':'is-idle')}><svg className="assistant-face" viewBox="0 0 240 200" fill="none"><g className="assistant-eyes"><ellipse cx="79" cy="78" rx="13" ry="20"/><ellipse cx="161" cy="78" rx="13" ry="20"/></g><path className="assistant-mouth assistant-mouth-smile" d="M78 127 Q120 164 162 127"/><path className="assistant-mouth assistant-mouth-thinking" d="M104 140 Q120 134 136 140"/><path className="assistant-mouth assistant-mouth-error" d="M91 147 Q120 124 149 147"/></svg></div></div></div>
  </section>;
}
