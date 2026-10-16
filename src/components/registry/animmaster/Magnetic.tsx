import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion, useSpring } from 'motion/react';

/**
 * Original Branchline interaction, inspired by AnimMaster's mouse/physics demos.
 * Keep the hit target still; only the inner visual follows a precise pointer.
 */
export function Magnetic({
  children,
  strength = 5,
  disabled = false,
  className,
  style,
}: {
  children: ReactNode;
  strength?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const target = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const x = useSpring(0, { stiffness: 420, damping: 30, mass: 0.4 });
  const y = useSpring(0, { stiffness: 420, damping: 30, mass: 0.4 });
  const limit = Math.max(0, Math.min(Number.isFinite(strength) ? strength : 0, 12));

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  useEffect(() => {
    if (disabled || reduced) {
      x.jump(0);
      y.jump(0);
    }
  }, [disabled, reduced, x, y]);

  const follow = (event: PointerEvent<HTMLSpanElement>) => {
    if (
      disabled ||
      reduced ||
      event.pointerType !== 'mouse' ||
      event.buttons !== 0 ||
      target.current?.contains(document.activeElement)
    ) {
      reset();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const horizontal = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
    const vertical = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    x.set(Math.max(-1, Math.min(1, horizontal)) * limit);
    y.set(Math.max(-1, Math.min(1, vertical)) * limit);
  };

  return (
    <span
      ref={target}
      className={className}
      data-motion="magnetic"
      style={{ display: 'inline-grid', verticalAlign: 'middle', ...style }}
      onPointerMove={follow}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerDown={reset}
      onFocusCapture={reset}
      onBlurCapture={reset}
    >
      <motion.span
        style={{
          display: 'inline-flex',
          minWidth: 0,
          width: '100%',
          x: reduced ? 0 : x,
          y: reduced ? 0 : y,
        }}
      >
        {children}
      </motion.span>
    </span>
  );
}
