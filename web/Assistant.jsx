import React, { useState } from 'react';
import assistantImage from './assets/ruleline-assistant.png';
import './assistant.css';

const stateLabels = {
  idle: '助手待机，欢迎提问',
  thinking: '助手正在接收输入或处理请求',
  confirm: '等待你的确认',
  waiting: '正在等待链上结果',
  success: '操作已完成',
  error: '操作失败或暂时无法确认',
};

export default function Assistant({ state = 'idle' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const currentState = Object.hasOwn(stateLabels, state) ? state : 'idle';

  return (
    <div
      className={`assistant-stage assistant-${currentState}`}
      role="img"
      aria-label={stateLabels[currentState]}
    >
      <div className="assistant-atmosphere" aria-hidden="true" />
      <div className="assistant-orbit assistant-orbit-outer" aria-hidden="true" />
      <div className="assistant-orbit assistant-orbit-inner" aria-hidden="true" />
      <div className="assistant-portrait" aria-hidden="true">
        {imageFailed ? (
          <div className="assistant-fallback">
            <div className="assistant-fallback-shoulders" />
            <div className="assistant-fallback-neck" />
            <div className="assistant-fallback-head"><span /></div>
          </div>
        ) : (
          <img src={assistantImage} alt="" onError={() => setImageFailed(true)} />
        )}
        <div className="assistant-face-light" />
        <div className="assistant-shoulder-light assistant-shoulder-left" />
        <div className="assistant-shoulder-light assistant-shoulder-right" />
        <div className="assistant-core"><span /></div>
      </div>
      <div className="assistant-particles" aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </div>
      <div className="assistant-ground" aria-hidden="true" />
    </div>
  );
}
