import React, {useEffect, useRef} from 'react';

export default function TreeVideo() {
  const video = useRef(null);
  useEffect(() => {
    const element = video.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      if (visible && !document.hidden && !reduced.matches) element.play().catch(() => {});
      else element.pause();
    };
    const observer = new IntersectionObserver(entries => {visible = entries[0].isIntersecting; update();}, {threshold: .01});
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    return () => {observer.disconnect(); document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update); element.pause();};
  }, []);
  return <div className="grove-viewport"><div className="grove-camera">
    <img src="/media/ruleline-grove.jpg" alt="" loading="lazy"/>
    <video ref={video} className="rule-tree-video" muted loop playsInline preload="none" poster="/media/ruleline-grove.jpg" aria-hidden="true">
      <source media="(max-width: 700px)" src="/media/ruleline-grove-mobile.mp4" type="video/mp4"/>
      <source src="/media/ruleline-grove.mp4" type="video/mp4"/>
    </video>
  </div></div>;
}
