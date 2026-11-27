import React, {useEffect, useRef} from 'react';
import LakeBackdrop from './LakeBackdrop';

export default function Immersive({language = 'zh'}) {
  const canvas = useRef(null);
  const container = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element.getContext('2d');
    if (!context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const count = window.matchMedia('(max-width: 700px)').matches ? 1700 : 2400;
    function makeShape(drawShape) {
      const mask = document.createElement('canvas');
      mask.width = 240; mask.height = 240;
      const brush = mask.getContext('2d', {willReadFrequently:true});
      brush.fillStyle = '#fff';
      drawShape(brush);
      const pixels = brush.getImageData(0,0,240,240).data;
      const coordinates = [];
      for (let y=0;y<240;y+=2) for (let x=0;x<240;x+=2) {
        if (pixels[(y*240+x)*4+3] > 128) coordinates.push({x:(x-120)/110,y:(y-120)/110});
      }
      return coordinates;
    }
    const glyph = (character, size=200) => brush => {
      brush.textAlign='center'; brush.textBaseline='middle';
      brush.font=`bold ${size}px "Segoe UI Symbol", "Arial", sans-serif`;
      brush.fillText(character,120,124);
    };
    const diamond = (brush,x,y,size) => {
      brush.beginPath(); brush.moveTo(x,y-size); brush.lineTo(x+size,y); brush.lineTo(x,y+size); brush.lineTo(x-size,y); brush.closePath(); brush.fill();
    };
    const shapes = [
      makeShape(glyph('₿',220)),
      makeShape(brush=>{brush.beginPath();brush.moveTo(120,20);brush.lineTo(55,130);brush.lineTo(120,160);brush.lineTo(185,130);brush.closePath();brush.fill();brush.beginPath();brush.moveTo(55,143);brush.lineTo(120,220);brush.lineTo(185,143);brush.lineTo(120,174);brush.closePath();brush.fill();}),
      makeShape(glyph('Ð',200)),
      makeShape(brush=>{[[120,38,25],[120,202,25],[38,120,25],[202,120,25],[120,120,25],[79,79,22],[161,79,22],[79,161,22],[161,161,22]].forEach(([x,y,size])=>diamond(brush,x,y,size));}),
      makeShape(brush=>{[[48,48],[150,48],[99,99],[48,150],[150,150]].forEach(([x,y])=>brush.fillRect(x,y,42,42));}),
    ];
    const points = Array.from({length: count}, (_, index) => ({
      coordinates:shapes.map((shape,shapeIndex)=>shape[(index*811+shapeIndex*137)%shape.length]),
      depth:Math.sin(index*2.399963)*.13,
      phase:index*.071, size:2.5+(index%7)*.42, offsetX:0, offsetY:0, velocityX:0, velocityY:0,
    }));
    let width = 0, height = 0, frame = 0, time = 0;
    const pointer = {x: -10000, y: -10000};
    function resize() {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = width * ratio;
      element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function draw() {
      frame = 0;
      context.clearRect(0, 0, width, height);
      const bounds = container.current.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height - innerHeight)));
      // Leave the opening overlook clear until the product chapters enter.
      if (progress < .14 || bounds.bottom <= 0) return;
      element.style.opacity = String(Math.min(1,(progress-.14)/.10));
      const scale = Math.min(width, height) * (width < 700 ? .43 : .50);
      const centerX = width * (width < 700 ? .62 : .68 - .22 * progress);
      const centerY = height * (width < 700 ? .32 : .44);
      const position = progress * 4;
      const firstShape = Math.min(3,Math.floor(position));
      const rawBlend = Math.max(0,Math.min(1,(position-firstShape-.3)/.4));
      const blend = rawBlend*rawBlend*(3-2*rawBlend);
      const dots = points.map(point => {
        const first = point.coordinates[firstShape];
        const second = point.coordinates[firstShape+1];
        const drift = reduced.matches ? 0 : Math.sin(point.phase+time*.012)*.008;
        const shapedX = first.x + (second.x-first.x)*blend + drift;
        const shapedY = first.y + (second.y-first.y)*blend + drift;
        const shapedZ = point.depth;
        const perspective = 1 / (1.35 - shapedZ * .25);
        const targetX = centerX + shapedX * scale * perspective;
        const targetY = centerY + shapedY * scale * perspective;
        if (!reduced.matches) {
          const dx = targetX + point.offsetX - pointer.x;
          const dy = targetY + point.offsetY - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 85) {
            const force = (85 - distance) / 85 * 2.2;
            point.velocityX += (dx || Math.cos(point.phase)) / (distance || 1) * force;
            point.velocityY += (dy || Math.sin(point.phase)) / (distance || 1) * force;
          }
          point.velocityX = (point.velocityX - point.offsetX * .012) * .91;
          point.velocityY = (point.velocityY - point.offsetY * .012) * .91;
          point.offsetX += point.velocityX;
          point.offsetY += point.velocityY;
        }
        return {x: targetX + point.offsetX, y: targetY + point.offsetY, z: shapedZ, size: point.size * perspective, phase: point.phase};
      }).sort((a, b) => a.z - b.z);
      for (const dot of dots) {
        const rotation = dot.phase + (reduced.matches ? 0 : Math.sin(time * .018 + dot.phase) * .6);
        context.save();
        context.translate(dot.x, dot.y);
        context.rotate(rotation);
        context.scale(1, .48 + Math.abs(Math.cos(rotation)) * .42);
        context.beginPath();
        context.moveTo(-dot.size, 0);
        context.quadraticCurveTo(0, -dot.size * 1.05, dot.size * 1.25, 0);
        context.quadraticCurveTo(0, dot.size * 1.05, -dot.size, 0);
        context.fillStyle = dot.z > .45 ? '#c6ff4d' : dot.z > 0 ? '#3ce852' : '#008a39';
        context.globalAlpha = .8 + (dot.z + 1) * .09;
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;
      if (!reduced.matches && !document.hidden) { time++; frame = requestAnimationFrame(draw); }
    }
    function update() { cancelAnimationFrame(frame); resize(); draw(); }
    function movePointer(event) {
      if (event.pointerType !== 'mouse' || reduced.matches) return;
      const bounds = element.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left;
      pointer.y = event.clientY - bounds.top;
    }
    function clearPointer() { pointer.x = -10000; pointer.y = -10000; }
    window.addEventListener('resize', update);
    window.addEventListener('pointermove', movePointer, {passive:true});
    window.addEventListener('blur', clearPointer);
    document.addEventListener('pointerleave', clearPointer);
    function onScroll() { if (reduced.matches || !frame) draw(); }
    window.addEventListener('scroll', onScroll, {passive: true});
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', update); window.removeEventListener('pointermove', movePointer); window.removeEventListener('blur', clearPointer); document.removeEventListener('pointerleave', clearPointer); window.removeEventListener('scroll', onScroll); reduced.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div className="world" ref={container}>
    <div className="world-backdrop" aria-hidden="true"><LakeBackdrop container={container}/><canvas className="particle-canvas" ref={canvas}/></div>
    {language === 'en' ? <>
      <section className="world-scene world-hero"><div><p>RULELINE / REACTIVE NETWORK / TESTNET</p><h1>Make rules<br/><em>visible.</em></h1><p className="world-description">Describe a condition in your own words. Follow what happens onchain, from the first transfer to the final response.</p><div className="world-actions"><a href="#rule-editor">Create a rule ↗</a><a className="world-secondary" href="#demo">Try the simulation ↗</a></div><p className="world-scope">TESTNET ONLY · REVIEW BEFORE DEPLOYING</p></div><span className="world-scroll">Explore ↓</span></section>
      <section className="world-scene world-right"><div><p>01 / MONITOR</p><h2>Events begin<br/><em>onchain.</em></h2><p className="world-description">After a transfer on Sepolia, Reactive Network checks the specified account and amount.</p></div></section>
      <section className="world-scene"><div><p>02 / RESPOND</p><h2>Conditions met.<br/><em>Action requested.</em></h2><p className="world-description">When the threshold is met, a callback requests a pause to withdrawals from this project's test vault. The transfer has already happened.</p></div></section>
      <section className="world-scene world-right"><div><p>03 / VERIFY</p><h2>Follow the<br/><em>evidence.</em></h2><p className="world-description">Check onchain status and transaction links. Callbacks can be delayed or fail, so verify the actual evidence.</p><a href="#demo">Try the simulation ↗</a></div></section>
    </> : <>
      <section className="world-scene world-hero"><div><p>RULELINE / REACTIVE NETWORK / 测试网</p><h1>让规则<br/><em>看得见。</em></h1><p className="world-description">用一句话描述条件，从转账发生到链上响应，每一步都有迹可循。</p><div className="world-actions"><a href="#rule-editor">开始创建规则 ↗</a><a className="world-secondary" href="#demo">先体验模拟 ↗</a></div><p className="world-scope">仅限测试网 · 部署前由你核对</p></div><span className="world-scroll">向下探索 ↓</span></section>
      <section className="world-scene world-right"><div><p>01 / 监听</p><h2>链上事件<br/><em>开始流动。</em></h2><p className="world-description">Sepolia 上发生转账后，Reactive Network 监听并判断指定账户和金额。</p></div></section>
      <section className="world-scene"><div><p>02 / 响应</p><h2>条件满足，<br/><em>请求行动。</em></h2><p className="world-description">达到阈值时，请求回调暂停本项目测试金库的提款。已发生的转账不会被阻止。</p></div></section>
      <section className="world-scene world-right"><div><p>03 / 核对</p><h2>每一步，<br/><em>都有证据。</em></h2><p className="world-description">查看链上状态和交易链接。回调可能延迟或失败，请以实际证据为准。</p><a href="#demo">体验规则演示 ↗</a></div></section>
    </>}
  </div>;
}
