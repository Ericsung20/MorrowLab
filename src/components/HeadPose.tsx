import { useEffect, useRef, useState } from 'react';
import type { HeadTracking } from '../contracts/faceTracking';
import { createMascotRenderer } from './mascot3d';

/** A round, bespectacled sprout with a pencil tucked behind its head with live 3D head and facial tracking. */
export function HeadPose({ pose }: { pose: HeadTracking | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createMascotRenderer>>(null);
  const latest = useRef(pose);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { latest.current = pose; renderer.current?.draw(pose); }, [pose]);
  useEffect(() => {
    const surface = canvas.current!;
    const initialize = () => {
      try {
        renderer.current = createMascotRenderer(surface);
        setUnavailable(!renderer.current);
        renderer.current?.draw(latest.current);
      } catch { setUnavailable(true); }
    };
    const lost = (event: Event) => { event.preventDefault(); renderer.current = null; setUnavailable(true); };
    surface.addEventListener('webglcontextlost', lost);
    surface.addEventListener('webglcontextrestored', initialize);
    initialize();
    return () => {
      surface.removeEventListener('webglcontextlost', lost);
      surface.removeEventListener('webglcontextrestored', initialize);
      renderer.current?.dispose(); renderer.current = null;
    };
  }, []);
  const label = pose ? 'Sprout mascot with glasses and a pencil following your head, eyes, and mouth' : 'Sprout mascot with glasses and a pencil waiting for a visible face';
  return <div className={`head-pose ${pose ? 'is-tracking' : ''}`} title={label}>
    <canvas ref={canvas} className="mascot-face" width={336} height={288} role="img" aria-label={unavailable ? '3D character unavailable on this browser' : label} />
    {unavailable && <span className="mascot-fallback" role="status">3D unavailable</span>}
    <span className="mascot-tracking-dot" aria-hidden="true" />
  </div>;
}
