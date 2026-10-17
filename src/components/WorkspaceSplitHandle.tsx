import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import './workspace-split-handle.css';

type WorkspaceSplitHandleProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (value: number) => void;
  onResizeEnd?: () => void;
  className?: string;
};

type ResizeGesture = {
  pointerId: number;
  startX: number;
  startValue: number;
  lastValue: number;
  handle: HTMLDivElement;
  cursor: string;
  userSelect: string;
};

const resizeKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

/** Attach to a positioned pane whose width grows from its left edge. */
export function WorkspaceSplitHandle({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  onResizeEnd,
  className = '',
}: WorkspaceSplitHandleProps) {
  const helpId = useId();
  const gesture = useRef<ResizeGesture | null>(null);
  const keyboardStart = useRef<number | null>(null);
  const keyboardValue = useRef(value);
  const [dragging, setDragging] = useState(false);
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max) ? Math.max(lower, max) : lower;
  const clamp = (next: number) =>
    Math.min(upper, Math.max(lower, Number.isFinite(next) ? next : lower));
  const currentValue = clamp(value);
  const settings = useRef({ clamp, currentValue, defaultValue, onChange, onResizeEnd });
  settings.current = { clamp, currentValue, defaultValue, onChange, onResizeEnd };

  const finishPointer = (cancelled: boolean) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    document.body.style.cursor = active.cursor;
    document.body.style.userSelect = active.userSelect;
    if (active.handle.hasPointerCapture(active.pointerId))
      active.handle.releasePointerCapture(active.pointerId);
    setDragging(false);
    if (cancelled) {
      settings.current.onChange(settings.current.clamp(active.startValue));
    } else if (active.lastValue !== active.startValue) {
      settings.current.onResizeEnd?.();
    }
  };

  const finishKeyboard = () => {
    const start = keyboardStart.current;
    keyboardStart.current = null;
    if (start !== null && start !== keyboardValue.current) settings.current.onResizeEnd?.();
  };

  useEffect(() => {
    const cancelOnBlur = () => {
      finishPointer(true);
      finishKeyboard();
    };
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      window.removeEventListener('blur', cancelOnBlur);
      const active = gesture.current;
      if (!active) return;
      gesture.current = null;
      document.body.style.cursor = active.cursor;
      document.body.style.userSelect = active.userSelect;
      if (active.handle.hasPointerCapture(active.pointerId))
        active.handle.releasePointerCapture(active.pointerId);
    };
  }, []);

  const beginPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || lower === upper || gesture.current) return;
    event.preventDefault();
    finishKeyboard();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: currentValue,
      lastValue: currentValue,
      handle: event.currentTarget,
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setDragging(true);
  };

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const next = settings.current.clamp(active.startValue + event.clientX - active.startX);
    if (next === active.lastValue) return;
    active.lastValue = next;
    settings.current.onChange(next);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && gesture.current) {
      event.preventDefault();
      finishPointer(true);
      return;
    }
    if (!resizeKeys.includes(event.key) || gesture.current) return;
    event.preventDefault();
    if (keyboardStart.current === null) {
      keyboardStart.current = settings.current.currentValue;
      keyboardValue.current = settings.current.currentValue;
    }
    const step = event.shiftKey ? 4 : 16;
    const next = settings.current.clamp(
      event.key === 'Home'
        ? lower
        : event.key === 'End'
          ? upper
          : keyboardValue.current + (event.key === 'ArrowRight' ? step : -step),
    );
    keyboardValue.current = next;
    settings.current.onChange(next);
  };

  return (
    <>
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={lower}
        aria-valuemax={upper}
        aria-valuenow={currentValue}
        aria-valuetext={`${Math.round(currentValue)} pixels`}
        aria-describedby={helpId}
        aria-disabled={lower === upper || undefined}
        tabIndex={0}
        title="Drag to resize. Arrow keys adjust width; double-click to reset."
        className={`workspace-split-handle${dragging ? ' is-resizing' : ''}${className ? ` ${className}` : ''}`}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={(event) => {
          if (gesture.current?.pointerId !== event.pointerId) return;
          movePointer(event);
          finishPointer(false);
        }}
        onPointerCancel={(event) => {
          if (gesture.current?.pointerId === event.pointerId) finishPointer(true);
        }}
        onLostPointerCapture={(event) => {
          if (gesture.current?.pointerId === event.pointerId) finishPointer(true);
        }}
        onKeyDown={resizeWithKeyboard}
        onKeyUp={(event) => {
          if (resizeKeys.includes(event.key)) finishKeyboard();
        }}
        onBlur={() => {
          finishPointer(true);
          finishKeyboard();
        }}
        onDoubleClick={() => {
          if (gesture.current) finishPointer(true);
          finishKeyboard();
          const next = settings.current.clamp(settings.current.defaultValue);
          if (next === settings.current.currentValue) return;
          settings.current.onChange(next);
          settings.current.onResizeEnd?.();
        }}
      />
      <span id={helpId} className="sr-only">
        Drag horizontally to resize. Left and Right arrows adjust by 16 pixels; hold Shift for 4
        pixels. Home uses the minimum width, End the maximum. Double-click to reset.
      </span>
    </>
  );
}
