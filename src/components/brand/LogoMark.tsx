import { useEffect, useId, useRef } from 'react';
import { animate } from 'motion/react';
import shapes from './logo-shapes.json';
import './logo-mark.css';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import { useStartup } from '../startup/startup-context';

/** An original prompt-faced cat; its tail is a two-branch commit graph. */
export function LogoMark({
  className = '',
  label,
  intro = true,
  replayOnHover = false,
}: {
  className?: string;
  label?: string;
  intro?: boolean;
  replayOnHover?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const reducedMotion = useReducedMotionPreference();
  const { active: startupActive } = useStartup();
  const suppressIntro = useRef(startupActive);
  const titleId = useId();
  const play = useRef<() => void>(() => {});

  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion) return;
    let active: ReturnType<typeof animate>[] = [];
    let playing = false;
    const stop = () => {
      active.forEach((animation) => animation.cancel());
      active = [];
      playing = false;
      delete root.dataset.animating;
    };
    play.current = () => {
      if (playing || document.hidden) return;
      const head = root.querySelector<SVGGElement>('.logo-head')!;
      const eye = root.querySelector<SVGGElement>('.logo-prompt')!;
      const trace = root.querySelector<SVGPathElement>('.logo-trace')!;
      const node = root.querySelector<SVGCircleElement>('.logo-fork-node')!;
      playing = true;
      root.dataset.animating = 'true';
      const ease = [0.22, 1, 0.36, 1] as const;
      active = [
        animate(head, { rotate: [0, -6, 0] }, { duration: 0.9, times: [0, 0.36, 1], ease }),
        animate(eye, { scaleY: [1, 0.12, 1] }, { duration: 0.23, delay: 0.28, ease }),
        animate(
          trace,
          { pathLength: [0, 0.15, 1, 1], opacity: [0, 1, 1, 0] },
          {
            duration: 0.84,
            delay: 0.12,
            ease,
            times: [0, 0.15, 0.78, 1],
          },
        ),
        animate(node, { scale: [1, 1.26, 1] }, { duration: 0.34, delay: 0.65, ease }),
      ];
      void Promise.all(active.map((animation) => animation.finished)).then(() => {
        playing = false;
        delete root.dataset.animating;
      });
    };
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (intro && !suppressIntro.current) play.current();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      play.current = () => {};
      stop();
    };
  }, [intro, reducedMotion]);

  return (
    <svg
      ref={ref}
      className={`logo-mark ${className}`.trim()}
      data-brand="gitsomething"
      viewBox="0 0 128 128"
      fill="none"
      role={label ? 'img' : undefined}
      aria-labelledby={label ? titleId : undefined}
      aria-hidden={label ? undefined : true}
      onPointerEnter={replayOnHover ? () => play.current() : undefined}
      onFocus={replayOnHover ? () => play.current() : undefined}
    >
      {label && <title id={titleId}>{label}</title>}
      <g stroke="#58a6ff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <path d={shapes.tail} />
        <path d={shapes.fork} />
      </g>
      <path
        className="logo-trace"
        d={shapes.travel}
        stroke="#f0f6fc"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0"
      />
      <circle cx="104" cy="43" r="6" fill="#58a6ff" />
      <circle cx="104" cy="43" r="2.5" fill="#0d1117" />
      <circle className="logo-fork-node" cx="116" cy="57" r="6" fill="#58a6ff" />
      <circle cx="116" cy="57" r="2.5" fill="#0d1117" />
      <path d={shapes.body} fill="#58a6ff" />
      <g className="logo-head">
        <path d={shapes.head} fill="#f0f6fc" />
        <path d={shapes.ear} fill="#58a6ff" />
        <g
          className="logo-prompt"
          stroke="#0d1117"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={shapes.prompt} />
          <path d={shapes.cursor} />
        </g>
      </g>
    </svg>
  );
}
