import React, {useEffect, useRef, useState} from 'react';

const reducedMotion = '(prefers-reduced-motion: reduce)';
const tau = Math.PI * 2;

export function SignalScene({active}) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!active) return;
    const surface = canvas.current;
    const ctx = surface.getContext('2d');
    if (!ctx) return;
    const motion = window.matchMedia(reducedMotion);
    const panel = surface.parentElement;
    const target = {x: 0, y: 0};
    let x = 0, y = 0, width = 0, height = 0, frame = 0, impulse = 0;
    const start = performance.now();

    function draw(now = performance.now()) {
      if (width && height) {
        const still = motion.matches;
        const t = still ? 0 : (now - start) / 1000;
        const radius = Math.min(width * .39, height * .43);
        x += (target.x - x) * .07;
        y += (target.y - y) * .07;
        impulse *= .953;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(width * .5, height * .5);
        ctx.rotate(-.30 + Math.sin(t * .37) * .08 + x * .15);
        for (let strand = 0; strand < 47; strand++) {
          const phase = strand / 47 * tau + t * .48;
          ctx.beginPath();
          for (let i = 0; i <= 120; i++) {
            const angle = i / 120 * tau;
            const twist = angle * 3 + phase;
            const tube = .26 + Math.cos(angle * 2 - t * .44) * .045 + impulse * .068;
            const ring = .71 + Math.cos(twist) * tube;
            const z = Math.sin(twist) * tube;
            const px = (Math.cos(angle) * ring + z * x * .31) * radius;
            const py = (Math.sin(angle) * ring * (.7 + y * .14) + z * .8) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineWidth = strand % 9 === 0 ? 1.5 : .8;
          ctx.strokeStyle = strand % 9 === 0 ? '#b54d2c' : 'rgba(41,83,73,.3)';
          ctx.stroke();
        }
        ctx.restore();
      }
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(draw);
    }

    function restart() {
      cancelAnimationFrame(frame);
      draw();
    }
    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = surface.clientWidth;
      height = surface.clientHeight;
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      restart();
    }
    function steer(event) {
      if (motion.matches || event.pointerType === 'touch') return;
      const rect = panel.getBoundingClientRect();
      target.x = (event.clientX - rect.left) / rect.width * 2 - 1;
      target.y = (event.clientY - rect.top) / rect.height * 2 - 1;
    }
    function reset() { target.x = 0; target.y = 0; }
    function press() { impulse = 1; }

    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    panel.addEventListener('pointermove', steer);
    panel.addEventListener('pointerleave', reset);
    panel.addEventListener('pointerdown', press);
    motion.addEventListener('change', restart);
    document.addEventListener('visibilitychange', restart);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel.removeEventListener('pointermove', steer);
      panel.removeEventListener('pointerleave', reset);
      panel.removeEventListener('pointerdown', press);
      motion.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [active]);

  return <figure className="signal-scene" aria-hidden="true" data-signal>
    <canvas ref={canvas}/>
    <span className="signal-scene-cross">+</span>
    <figcaption><span>SEP / EVM</span><i/><span>LASNA</span><i/><span>SEP / VAULT</span></figcaption>
  </figure>;
}

export function useStudioFeedback(shell) {
  const audio = useRef(null);
  const soundEnabled = useRef(false);
  const [sound, setSound] = useState(() => {
    try { return localStorage.getItem('ruleline-sound') === 'on'; } catch { return false; }
  });
  soundEnabled.current = sound;

  function play(kind, unlock = false) {
    if (!soundEnabled.current) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!audio.current && unlock && Audio) audio.current = new Audio();
      const context = audio.current;
      if (!context) return;
      const note = () => {
        if (!soundEnabled.current || context.state !== 'running') return;
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const [from, to, duration, volume] = {
          hover: [660, 520, .055, .024], click: [400, 640, .11, .075], page: [168, 380, .3, .105],
        }[kind];
        oscillator.type = kind === 'hover' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(from, now);
        oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + .013);
        gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + .01);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      };
      if (context.state === 'running') note();
      else if (unlock) context.resume().then(note).catch(() => {});
    } catch { /* Audio is optional on browsers without Web Audio. */ }
  }

  function changeSound(enabled) {
    soundEnabled.current = enabled;
    setSound(enabled);
    try { localStorage.setItem('ruleline-sound', enabled ? 'on' : 'off'); } catch { /* Session only. */ }
    if (enabled) play('page', true);
    else audio.current?.suspend().catch(() => {});
  }

  useEffect(() => {
    const root = shell.current;
    const pointer = root.querySelector('.studio-pointer');
    const media = window.matchMedia(`(pointer: fine) and (hover: hover) and (prefers-reduced-motion: no-preference)`);
    const control = node => node instanceof Element && node.closest('a[href], button:not(:disabled), [data-signal]');
    let frame = 0, x = 0, y = 0, drawX = 0, drawY = 0, visible = false, lastHover = 0, lastRipple = 0;
    function follow() {
      drawX += (x - drawX) * .28;
      drawY += (y - drawY) * .28;
      pointer.style.transform = `translate3d(${drawX}px, ${drawY}px, 0)`;
      frame = Math.hypot(x - drawX, y - drawY) > .35 ? requestAnimationFrame(follow) : 0;
    }
    function move(event) {
      if (!media.matches || event.pointerType === 'touch') return;
      x = event.clientX;
      y = event.clientY;
      if (!visible) { drawX = x; drawY = y; visible = true; }
      pointer.classList.add('is-visible');
      pointer.classList.toggle('is-target', Boolean(control(event.target)));
      const now = performance.now();
      if (now - lastRipple > 125) {
        lastRipple = now;
        const ripple = document.createElement('i');
        ripple.className = 'water-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        root.append(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), {once:true});
      }
      if (!frame) frame = requestAnimationFrame(follow);
    }
    function leave() { visible = false; pointer.classList.remove('is-visible', 'is-target', 'is-down'); }
    function over(event) {
      const next = control(event.target);
      const now = performance.now();
      if (media.matches && event.pointerType !== 'touch' && next && next !== control(event.relatedTarget) && now - lastHover > 85) {
        lastHover = now;
        play('hover');
      }
    }
    function down(event) { if (media.matches && event.pointerType !== 'touch') pointer.classList.add('is-down'); }
    function up() { pointer.classList.remove('is-down'); }
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerdown', down);
    document.addEventListener('pointerleave', leave);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', leave);
    media.addEventListener('change', leave);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerover', over);
      root.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', leave);
      media.removeEventListener('change', leave);
      audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, [shell]);

  function feedback(event) {
    const control = event.target.closest('a[href], button:not(:disabled), [data-signal]');
    if (!control || control.closest('[data-silent]')) return;
    const link = control.getAttribute('href');
    if (!link?.startsWith('#')) play('click', true);
    if (!event.detail || window.matchMedia(reducedMotion).matches) return;
    const ring = document.createElement('i');
    ring.className = 'studio-ripple';
    ring.style.left = `${event.clientX}px`;
    ring.style.top = `${event.clientY}px`;
    shell.current.append(ring);
    const remove = () => ring.remove();
    ring.addEventListener('animationend', remove, {once:true});
    window.setTimeout(remove, 650);
  }

  return {sound, changeSound, play, feedback};
}
