/**
 * Adapted from VengeanceUI's MIT-licensed tooltip and animated-tooltip.
 * Copyright (c) 2025-2026 Ashutoshx7. See LICENSE and PROVENANCE.md.
 * Adaptations: accessible Radix positioning/focus handling, compact command-token
 * geometry, Framer Motion transitions, reduced-motion support, project tokens.
 */
import { useState, type ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import './tooltip.css';

interface AnimatedTooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function AnimatedTooltip({
  children,
  content,
  className = '',
  side = 'top',
}: AnimatedTooltipProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <TooltipPrimitive.Provider delayDuration={260} skipDelayDuration={80}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger asChild>
          <span className={`vengeance-tooltip-trigger ${className}`} tabIndex={0}>
            {children}
          </span>
        </TooltipPrimitive.Trigger>
        <AnimatePresence>
          {open && (
            <TooltipPrimitive.Portal forceMount>
              <TooltipPrimitive.Content
                forceMount
                side={side}
                sideOffset={9}
                collisionPadding={12}
                asChild
              >
                <motion.div
                  className="vengeance-tooltip"
                  initial={{
                    opacity: 0,
                    y: reducedMotion ? 0 : 4,
                    scale: reducedMotion ? 1 : 0.97,
                  }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: reducedMotion ? 0 : 2, scale: reducedMotion ? 1 : 0.98 }}
                  transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  {content}
                  <TooltipPrimitive.Arrow
                    className="vengeance-tooltip-arrow"
                    width={10}
                    height={5}
                  />
                </motion.div>
              </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
          )}
        </AnimatePresence>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
