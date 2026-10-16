import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import type { MotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AnimatedButton } from '../registry/vengeance/AnimatedButton';

// Source-owned shadcn/ui Button composition (MIT); tokens match Branchline.
const buttonVariants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      outline: 'button-outline',
      ghost: 'button-ghost',
      danger: 'button-danger',
    },
    size: { default: '', sm: 'button-sm', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };
export function Button({ className, variant, size, asChild = false, ...props }: Props) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) return <Slot className={classes} {...props} />;
  if (!variant || variant === 'default') {
    return (
      <AnimatedButton
        className={classes}
        {...(props as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MotionProps>)}
      />
    );
  }
  return <button className={classes} {...props} />;
}
