import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimate } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { LogoMark } from '../brand/LogoMark';
import { TextRoll } from '../registry/skiper/TextRoll';
import { AnimatedButton } from '../registry/vengeance/AnimatedButton';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import { StartupContext } from './startup-context';
import './startup.css';

const ease = [0.22, 1, 0.36, 1] as const;

/** A finite brand introduction. App and account restoration mount immediately. */
export function StartupExperience({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotionPreference();
  const [visible, setVisible] = useState(() => !reducedMotion && !document.hidden);
  const [scope, animate] = useAnimate<HTMLElement>();
  const skip = useRef<HTMLButtonElement>(null);
  const wasVisible = useRef(visible);
  const shouldRestoreFocus = useRef(false);
  const dismiss = useCallback(() => setVisible(false), []);

  useLayoutEffect(() => {
    if (visible) {
      skip.current?.focus({ preventScroll: true });
      return;
    }
    if (!wasVisible.current) return;
    wasVisible.current = false;
    if (!shouldRestoreFocus.current) return;
    const frame = requestAnimationFrame(() => {
      // A real dialog opened by a native folder drop owns its own focus.
      if (document.querySelector('[role="dialog"]')) return;
      const current = document.activeElement;
      if (current && current !== document.body && current !== document.documentElement) return;
      document
        .querySelector<HTMLButtonElement>('.home-open-repository')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  useEffect(() => {
    if (reducedMotion && visible) dismiss();
  }, [reducedMotion, visible, dismiss]);

  useEffect(() => {
    if (!visible || reducedMotion) return;
    const screen = scope.current;
    if (!screen) {
      dismiss();
      return;
    }
    let alive = true;
    shouldRestoreFocus.current = true;
    const exit = animate(
      screen,
      {
        clipPath: ['inset(0% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'],
      },
      { delay: 1.22, duration: 0.42, ease },
    );
    const composition = animate(
      '.startup-composition',
      { opacity: [1, 0], y: [0, -14] },
      {
        delay: 1.17,
        duration: 0.3,
        ease,
      },
    );
    void exit.finished.then(() => {
      if (alive) dismiss();
    });
    // Completion never depends on network, fonts, credentials, or a Git read.
    const fallback = window.setTimeout(dismiss, 2300);
    const onHidden = () => {
      if (document.hidden) dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      // The background app's window-level shortcuts must not open a hidden panel.
      event.stopImmediatePropagation();
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        dismiss();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        skip.current?.focus({ preventScroll: true });
      } else if (
        (event.metaKey || event.ctrlKey) &&
        ['k', 'o', 'f', '`'].includes(event.key.toLowerCase())
      ) {
        event.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      alive = false;
      exit.cancel();
      composition.cancel();
      window.clearTimeout(fallback);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [visible, reducedMotion, dismiss, animate, scope]);

  return (
    <>
      <StartupContext.Provider value={{ active: visible, dismiss }}>
        <div
          className="startup-app"
          inert={visible || undefined}
          aria-hidden={visible || undefined}
        >
          {children}
        </div>
      </StartupContext.Provider>
      {visible && !reducedMotion && (
        <section
          ref={scope}
          className="startup-screen"
          role="dialog"
          aria-modal="true"
          aria-labelledby="startup-title"
          aria-describedby="startup-description"
        >
          <div className="startup-composition">
            <div className="startup-illustration" aria-hidden="true">
              <svg className="startup-graph" viewBox="0 0 640 240" fill="none">
                <path
                  d="M24 125H150C206 125 206 70 262 70H616M150 125C206 125 206 184 262 184H478"
                  stroke="var(--ui-border)"
                  strokeWidth="1.5"
                  opacity="0.5"
                />
                <motion.path
                  d="M24 125H150C206 125 206 70 262 70H616"
                  stroke="var(--ui-accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.2 }}
                  animate={{ pathLength: 1, opacity: 0.8 }}
                  transition={{ duration: 0.85, ease }}
                />
                <motion.path
                  d="M150 125C206 125 206 184 262 184H478"
                  stroke="var(--ui-accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.55 }}
                  transition={{ duration: 0.65, delay: 0.24, ease }}
                />
                {[
                  [24, 125],
                  [150, 125],
                  [478, 184],
                  [616, 70],
                ].map(([cx, cy], index) => (
                  <motion.circle
                    key={cx}
                    cx={cx}
                    cy={cy}
                    r="4"
                    fill="var(--ui-canvas)"
                    stroke="var(--ui-accent)"
                    strokeWidth="1.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.8 }}
                    transition={{ duration: 0.18, delay: index * 0.16 }}
                  />
                ))}
              </svg>
              <motion.div
                className="startup-mascot"
                initial={{ scale: 0.94, y: 7 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ duration: 0.55, ease }}
              >
                <LogoMark />
              </motion.div>
            </div>
            <motion.h1
              id="startup-title"
              className="startup-wordmark"
              initial="initial"
              animate="hovered"
            >
              <TextRoll inherit>GitSomething</TextRoll>
              <span className="startup-period" aria-hidden="true">
                .
              </span>
            </motion.h1>
            <motion.p
              id="startup-description"
              className="startup-caption"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.38 }}
            >
              Your next branch starts here.
            </motion.p>
          </div>
          <AnimatedButton
            ref={skip}
            className="startup-skip"
            onClick={dismiss}
            aria-label="Skip startup animation"
          >
            Skip intro <kbd>Esc</kbd>
            <ArrowUpRight size={14} aria-hidden="true" />
          </AnimatedButton>
        </section>
      )}
    </>
  );
}
