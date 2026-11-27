import React, {useEffect, useRef} from 'react';

export default function TreeBackdrop({container, editor = false}) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const section = container.current;
    const controller = new AbortController();
    let cleanup;
    function getProgress() {
      const rect = section.getBoundingClientRect();
      return Math.max(0, Math.min(1, -rect.top / Math.max(1,rect.height-innerHeight)));
    }
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || controller.signal.aborted) return;
      observer.disconnect();
      try {
        const {openTree} = await import('./treeScene.js');
        if (controller.signal.aborted) return;
        const stop = await openTree({canvas:element, getProgress, editor, signal:controller.signal});
        if (controller.signal.aborted) stop?.();
        else cleanup = stop;
      } catch (error) {
        console.warn('Tree view unavailable', error);
      }
    });
    observer.observe(element);
    return () => { controller.abort(); observer.disconnect(); cleanup?.(); };
  }, [container,editor]);
  return <canvas className="tree-canvas" ref={canvas} aria-hidden="true"/>;
}
