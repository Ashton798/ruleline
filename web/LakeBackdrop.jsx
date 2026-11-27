import React, {useEffect, useRef} from 'react';

export default function LakeBackdrop({container, editor = false}) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const section = container.current;
    let disposed = false, cleanup;
    function getProgress() {
      const rect = section.getBoundingClientRect();
      const scrolled = Math.max(0, Math.min(1, -rect.top / Math.max(1,rect.height-innerHeight)));
      // The final camera key is the open-water overlook. The editor stays near that bank.
      return editor ? 1 - .06 * scrolled : (1 + Math.cos(2*Math.PI*scrolled)) / 2;
    }
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || disposed) return;
      observer.disconnect();
      try {
        const {openLake} = await import('./lakeside.js');
        if (disposed) return;
        const stop = await openLake({canvas:element, getProgress});
        if (disposed) stop();
        else cleanup = stop;
      } catch (error) {
        console.warn('Lake view unavailable', error);
      }
    });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); cleanup?.(); };
  }, [container,editor]);
  return <canvas className="lake-canvas" ref={canvas} aria-hidden="true"/>;
}
