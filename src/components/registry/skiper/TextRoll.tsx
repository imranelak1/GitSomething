/**
 * Skiper UI — Text roll navigation (skiper58), by gxuri.
 * Source: https://skiper-ui.com/r/skiper58.json
 * Free use/modification with attribution. See PROVENANCE.md.
 * Adapted for semantic inline markup, keyboard focus, and reduced motion.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface TextRollProps {
  children: string;
  className?: string;
  center?: boolean;
  /** Inherit a parent motion element's initial/hovered animation variants. */
  inherit?: boolean;
  /** Allow long dialog titles to wrap at word boundaries. */
  wrap?: boolean;
}

const STAGGER = 0.022;

export function TextRoll({
  children,
  className,
  center = false,
  inherit = false,
  wrap = false,
}: TextRollProps) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion)
    return (
      <span className={className} data-ui-source="skiper-ui">
        {children}
      </span>
    );

  if (wrap)
    return (
      <motion.span
        className={className}
        aria-label={children}
        data-ui-source="skiper-ui"
        initial="initial"
        whileHover="hovered"
        whileFocus="hovered"
        style={{ lineHeight: 1.25 }}
      >
        <span aria-hidden="true">
          {children.split(' ').map((word, index) => (
            <span key={index}>
              <TextRoll inherit>{word}</TextRoll>{' '}
            </span>
          ))}
        </span>
      </motion.span>
    );
  const characters = Array.from(children);
  const characterDelay = (index: number) =>
    STAGGER * (center ? Math.abs(index - (characters.length - 1) / 2) : index);

  return (
    <motion.span
      initial={inherit ? undefined : 'initial'}
      whileHover={inherit ? undefined : 'hovered'}
      whileFocus={inherit ? undefined : 'hovered'}
      className={cn('skiper-text-roll', className)}
      aria-label={children}
      data-ui-source="skiper-ui"
      style={{
        position: 'relative',
        display: 'inline-block',
        overflow: 'hidden',
        verticalAlign: 'bottom',
        lineHeight: 1.25,
      }}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', whiteSpace: 'pre' }}>
        {characters.map((character, index) => (
          <motion.span
            key={index}
            style={{ display: 'inline-block' }}
            variants={{ initial: { y: 0 }, hovered: { y: '-100%' } }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.42, delay: characterDelay(index) }}
          >
            {character}
          </motion.span>
        ))}
      </span>
      <span
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, display: 'inline-flex', whiteSpace: 'pre' }}
      >
        {characters.map((character, index) => (
          <motion.span
            key={index}
            style={{ display: 'inline-block' }}
            variants={{ initial: { y: '100%' }, hovered: { y: 0 } }}
            transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.42, delay: characterDelay(index) }}
          >
            {character}
          </motion.span>
        ))}
      </span>
    </motion.span>
  );
}
