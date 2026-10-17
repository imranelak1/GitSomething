import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { GitHubConnectCard } from './GitHubConnectCard';
import './github-account-dialog.css';

interface GitHubAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GitHubAccountDialog({ open, onOpenChange }: GitHubAccountDialogProps) {
  const reducedMotion = useReducedMotion();
  const returnFocus = useRef<HTMLElement | null>(null);
  const transition = { duration: reducedMotion ? 0 : 0.14 };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="github-account-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={() => {
                const activeElement = document.activeElement;
                returnFocus.current =
                  activeElement instanceof HTMLElement && activeElement !== document.body
                    ? activeElement
                    : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const target = returnFocus.current?.isConnected
                  ? returnFocus.current
                  : document.querySelector<HTMLElement>('[aria-label="GitHub account"]');
                target?.focus({ preventScroll: true });
              }}
            >
              <motion.section
                className="github-account-dialog"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              >
                <header className="github-account-dialog-header">
                  <div>
                    <Dialog.Title className="github-account-dialog-title">
                      Your GitHub account
                    </Dialog.Title>
                    <Dialog.Description className="github-account-dialog-description">
                      Approve GitSomething on GitHub to load your repositories and share your work.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    type="button"
                    className="github-account-dialog-close"
                    aria-label="Close GitHub account"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </header>
                <div className="github-account-dialog-body">
                  <GitHubConnectCard />
                </div>
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
