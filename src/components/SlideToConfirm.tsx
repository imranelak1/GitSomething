import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { ArrowRight, Check, Info, LoaderCircle } from 'lucide-react';
import { useActivity } from '@/hooks/useActivity';
import { AnimatedTooltip } from './registry/vengeance/AnimatedTooltip';
import './slide-to-confirm.css';

interface SlideToConfirmProps {
  label: string;
  pendingLabel?: string;
  description: string;
  onConfirm: () => void | Promise<unknown>;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'default' | 'compact';
  className?: string;
  resetKey?: string;
}

interface Gesture {
  pointerId: number;
  startX: number;
  origin: number;
  top: number;
  bottom: number;
  moved: boolean;
  handle: HTMLDivElement;
}

const clamp = (value: number, maximum: number) => Math.max(0, Math.min(maximum, value));
const KEYBOARD_HELP =
  'Use Right Arrow to advance, Left Arrow to go back, or End to reach the end. Press Enter or Space at the end to confirm. Escape cancels.';

/** A deliberate confirmation gesture, never a track click or an inertial throw. */
export function SlideToConfirm({
  label,
  pendingLabel = 'Pushing…',
  description,
  onConfirm,
  disabled = false,
  busy = false,
  variant = 'default',
  className = '',
  resetKey,
}: SlideToConfirmProps) {
  const { record } = useActivity();
  const reducedMotion = useReducedMotion();
  const descriptionId = useId();
  const keyboardId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const distanceRef = useRef(0);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const [distance, setDistance] = useState(0);
  const [percent, setPercent] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [callbackError, setCallbackError] = useState(false);
  const x = useMotionValue(0);
  const fill = useTransform(x, (value) => (distance > 0 ? clamp(value / distance, 1) : 0));
  const working = busy || pending;
  const unavailable = disabled || working;
  const ready = percent >= 95;
  const action = label.replace(/^slide to\s+/i, '');

  useMotionValueEvent(x, 'change', (value) => {
    const maximum = distanceRef.current;
    setPercent(maximum > 0 ? Math.round(clamp(value / maximum, 1) * 100) : 0);
  });

  const returnToStart = useCallback(
    (instant = false) => {
      x.stop();
      if (instant || reducedMotion) x.set(0);
      else animate(x, 0, { type: 'spring', stiffness: 460, damping: 42, mass: 0.8 });
    },
    [reducedMotion, x],
  );

  const releaseCapture = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDragging(false);
    if (gesture?.handle.hasPointerCapture(gesture.pointerId)) {
      gesture.handle.releasePointerCapture(gesture.pointerId);
    }
    return gesture;
  }, []);

  const cancel = useCallback(
    (explanation?: string, instant = false) => {
      const gesture = releaseCapture();
      if (explanation && !operationRef.current && (gesture?.moved || x.get() > 1)) {
        record({
          kind: 'interface',
          label: `Cancel ${action} confirmation`,
          description: `${explanation} No push was requested.`,
        });
      }
      returnToStart(instant);
    },
    [action, record, releaseCapture, returnToStart, x],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    let previousWidth = -1;
    let previousThumbWidth = -1;
    const measure = () => {
      const width = track.clientWidth;
      const thumbWidth = thumb.offsetWidth;
      const nextDistance = Math.max(0, width - thumbWidth - 8);
      if (width !== previousWidth || thumbWidth !== previousThumbWidth) {
        cancel(undefined, true);
        previousWidth = width;
        previousThumbWidth = thumbWidth;
        distanceRef.current = nextDistance;
        setDistance(nextDistance);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(thumb);
    return () => observer.disconnect();
  }, [cancel, variant]);

  useEffect(() => {
    cancel(undefined, true);
  }, [disabled, busy, resetKey, cancel]);

  useEffect(() => {
    mountedRef.current = true;
    const onWindowBlur = () => cancel('The window lost focus.');
    window.addEventListener('blur', onWindowBlur);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('blur', onWindowBlur);
      x.stop();
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture?.handle.hasPointerCapture(gesture.pointerId)) {
        gesture.handle.releasePointerCapture(gesture.pointerId);
      }
    };
  }, [cancel, x]);

  const confirm = async () => {
    if (unavailable || operationRef.current) return;
    operationRef.current = true;
    releaseCapture();
    setPending(true);
    setCallbackError(false);
    record({
      kind: 'interface',
      label: `Confirm ${action}`,
      description: `Slider confirmation completed. ${description} The Git operation reports its own result.`,
    });
    try {
      await onConfirm();
    } catch {
      // The caller owns the operation result and detailed error in the terminal.
      if (mountedRef.current) setCallbackError(true);
    } finally {
      operationRef.current = false;
      if (mountedRef.current) {
        setPending(false);
        returnToStart();
      }
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      unavailable ||
      operationRef.current ||
      gestureRef.current ||
      !event.isPrimary ||
      event.button !== 0 ||
      distanceRef.current <= 0
    )
      return;
    event.preventDefault();
    x.stop();
    event.currentTarget.focus({ preventScroll: true });
    const bounds = trackRef.current!.getBoundingClientRect();
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      origin: x.get(),
      top: bounds.top,
      bottom: bounds.bottom,
      moved: false,
      handle: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setCallbackError(false);
  };

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || unavailable || operationRef.current)
      return;
    const delta = event.clientX - gesture.startX;
    gesture.moved ||= Math.abs(delta) >= 4;
    x.set(clamp(gesture.origin + delta, distanceRef.current));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    movePointer(event);
    const insideVerticalRange =
      event.clientY >= gesture.top - 80 && event.clientY <= gesture.bottom + 80;
    const completed =
      !unavailable &&
      gesture.moved &&
      insideVerticalRange &&
      distanceRef.current > 0 &&
      x.get() / distanceRef.current >= 0.95;
    if (completed) void confirm();
    else cancel('The slider was released before confirmation.');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (unavailable || operationRef.current) return;
    if (event.key === 'Escape') {
      if (x.get() > 0 || gestureRef.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel('Confirmation was cancelled with Escape.');
      }
      return;
    }
    if (gestureRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (Math.abs(x.get() - distanceRef.current) < 0.01 && distanceRef.current > 0) void confirm();
      return;
    }
    const maximum = distanceRef.current;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = x.get() + maximum / 10;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = x.get() - maximum / 10;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maximum;
    else return;
    event.preventDefault();
    x.stop();
    x.set(clamp(next, maximum));
    setCallbackError(false);
  };

  const valueText = working
    ? pendingLabel
    : percent === 100
      ? 'At the end. Press Enter or Space to confirm.'
      : `${percent}% confirmed. ${percent >= 95 && dragging ? 'Release to confirm.' : 'Slide to the end to confirm.'}`;

  return (
    <div className={`slide-confirm-wrap slide-confirm-${variant} ${className}`}>
      <div
        ref={trackRef}
        className="slide-confirm"
        data-ready={ready && !working}
        data-dragging={dragging}
        data-disabled={disabled}
        data-busy={working}
        aria-busy={working}
      >
        <motion.div className="slide-confirm-fill" style={{ scaleX: fill }} aria-hidden="true" />
        <span className="slide-confirm-label" aria-hidden="true">
          {working
            ? pendingLabel
            : ready
              ? dragging
                ? 'Release to confirm'
                : 'Enter to confirm'
              : label}
        </span>
        <motion.div
          ref={thumbRef}
          className="slide-confirm-thumb"
          role="slider"
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={valueText}
          aria-disabled={unavailable}
          aria-describedby={`${descriptionId} ${keyboardId}`}
          tabIndex={disabled ? -1 : 0}
          style={{ x }}
          onPointerDown={onPointerDown}
          onPointerMove={movePointer}
          onPointerUp={onPointerUp}
          onPointerCancel={(event) => {
            if (gestureRef.current?.pointerId === event.pointerId)
              cancel('The pointer gesture was interrupted.');
          }}
          onLostPointerCapture={(event) => {
            if (gestureRef.current?.pointerId === event.pointerId)
              cancel('The pointer gesture was interrupted.');
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (!operationRef.current) cancel('The confirmation control lost focus.');
          }}
        >
          {working ? (
            <LoaderCircle size={18} className="slide-confirm-spinner" />
          ) : ready ? (
            <Check size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
        </motion.div>
      </div>
      <div className="slide-confirm-guidance">
        <span className="slide-confirm-instruction" aria-live="polite">
          {callbackError
            ? 'Could not complete. Check the terminal, then try again.'
            : working
              ? 'Follow progress in the Glass Box.'
              : 'Drag to the end and release'}
        </span>
        <AnimatedTooltip
          className="slide-confirm-help"
          content={
            <>
              <span>{description}</span>
              <span className="slide-confirm-tooltip-hint">{KEYBOARD_HELP}</span>
            </>
          }
        >
          <span aria-label="How to confirm push">
            <Info size={13} />
            <span className="slide-confirm-help-label">How to confirm</span>
          </span>
        </AnimatedTooltip>
      </div>
      <span id={descriptionId} className="slide-confirm-sr-only">
        {description}
      </span>
      <span id={keyboardId} className="slide-confirm-sr-only">
        {KEYBOARD_HELP}
      </span>
    </div>
  );
}
