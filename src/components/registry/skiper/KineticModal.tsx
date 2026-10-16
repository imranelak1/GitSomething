/** Original Radix Dialog composition with Skiper UI's free TextRoll heading.
 * Source attribution and component permissions are in PROVENANCE.md. */
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { TextRoll } from './TextRoll';

interface KineticModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy?: boolean;
  children: ReactNode;
}

export function KineticModal({
  open,
  onOpenChange,
  title,
  description,
  busy = false,
  children,
}: KineticModalProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="publish-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onPointerDownOutside={(event) => {
                if (busy) event.preventDefault();
              }}
              onEscapeKeyDown={(event) => {
                if (busy) event.preventDefault();
              }}
            >
              <motion.section
                className="publish-dialog"
                initial={{
                  opacity: 0,
                  scale: reducedMotion ? 1 : 0.97,
                  filter: reducedMotion ? 'none' : 'blur(3px)',
                }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
                transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <header className="publish-dialog-header">
                  <div>
                    <Dialog.Title className="publish-title">
                      <TextRoll center wrap>
                        {title}
                      </TextRoll>
                    </Dialog.Title>
                    <Dialog.Description className="publish-description">
                      {description}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    className="publish-close"
                    disabled={busy}
                    aria-label="Close publishing dialog"
                  >
                    <X size={18} />
                  </Dialog.Close>
                </header>
                {children}
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
