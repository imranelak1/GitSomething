/**
 * Adapted from Vengeance UI's AnimatedButton, by Ashutoshx7 (MIT).
 * https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-button.tsx
 * Preserves the spring press, text mask, and border shine composition.
 * Adaptations: event-driven shine, project classes, strict types, reduced motion.
 */
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import './button.css';

export type AnimatedButtonProps = HTMLMotionProps<'button'>;

export function AnimatedButton({ children, className, disabled, ...props }: AnimatedButtonProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.button
      {...props}
      disabled={disabled}
      initial="initial"
      whileHover={disabled || reducedMotion ? undefined : 'hovered'}
      whileFocus={disabled || reducedMotion ? undefined : 'hovered'}
      whileTap={disabled || reducedMotion ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, mass: 0.5 }}
      className={cn('vengeance-animated-button', className)}
      data-ui-source="vengeance-ui"
    >
      <motion.span
        className="vengeance-button-content"
        style={
          reducedMotion
            ? undefined
            : {
                WebkitMaskImage:
                  'linear-gradient(-75deg, white calc(var(--mask-x) + 20%), transparent calc(var(--mask-x) + 30%), white calc(var(--mask-x) + 100%))',
                maskImage:
                  'linear-gradient(-75deg, white calc(var(--mask-x) + 20%), transparent calc(var(--mask-x) + 30%), white calc(var(--mask-x) + 100%))',
              }
        }
        variants={
          reducedMotion
            ? undefined
            : {
                initial: { '--mask-x': '100%' },
                hovered: { '--mask-x': '-100%' },
              }
        }
        transition={{ duration: 0.9, ease: 'linear' }}
      >
        {children}
      </motion.span>
      {!reducedMotion && (
        <motion.span
          aria-hidden="true"
          className="vengeance-button-border"
          variants={{
            initial: { backgroundPosition: '100% 0', opacity: 0 },
            hovered: { backgroundPosition: '0% 0', opacity: [0, 1, 0] },
          }}
          transition={{ duration: 0.9, ease: 'linear' }}
        />
      )}
    </motion.button>
  );
}
