import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import {
  FolderOpen,
  Plus,
  Terminal,
  GitBranch,
  GitMerge,
  Layers,
  Search,
  Clock3,
  ArrowUpRight,
  X,
  Sparkles,
  Github,
} from 'lucide-react';

export function CommandPalette({
  open,
  onOpenChange,
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
}) {
  const run = (value: string) => {
    onOpenChange(false);
    onAction(value);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="dialog-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby="command-description">
              <motion.div
                className="command-dialog"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <Dialog.Description id="command-description" className="sr-only">
                  Find repository actions and advanced tools.
                </Dialog.Description>
                <Command label="Repository actions">
                  <div className="command-search">
                    <Search size={18} />
                    <Command.Input placeholder="What would you like to do?" autoFocus />
                    <Dialog.Close className="icon-button" aria-label="Close command palette">
                      <X size={16} />
                    </Dialog.Close>
                  </div>
                  <Command.List>
                    <Command.Empty>No actions found. Try “repository” or “history”.</Command.Empty>
                    <Command.Group heading="Your workspace">
                      <Command.Item
                        value="Getting started guide tutorial help first time"
                        onSelect={() => run('guide')}
                      >
                        <Sparkles size={17} />
                        <span>Getting started guide</span>
                      </Command.Item>
                      <Command.Item
                        value="GitHub account sign in connect authentication"
                        onSelect={() => run('github')}
                      >
                        <Github size={17} />
                        <span>Connect GitHub account</span>
                      </Command.Item>
                      <Command.Item value="Open repository" onSelect={() => run('open')}>
                        <FolderOpen size={17} />
                        <span>Open repository</span>
                        <kbd>O</kbd>
                      </Command.Item>
                      <Command.Item
                        value="Create publish new repository GitHub GitLab"
                        onSelect={() => run('publish')}
                      >
                        <Plus size={17} />
                        <span>Create & publish repository</span>
                        <ArrowUpRight size={14} />
                      </Command.Item>
                      <Command.Item onSelect={() => run('history')}>
                        <Clock3 size={17} />
                        <span>View commit history</span>
                      </Command.Item>
                      <Command.Item onSelect={() => run('console')}>
                        <Terminal size={17} />
                        <span>Toggle Glass box console</span>
                        <kbd>⌘ J</kbd>
                      </Command.Item>
                    </Command.Group>
                    <Command.Group heading="Advanced tools · planned">
                      <Command.Item onSelect={() => run('worktrees')}>
                        <Layers size={17} />
                        <span>Git worktrees</span>
                        <span className="planned-label">Roadmap</span>
                      </Command.Item>
                      <Command.Item onSelect={() => run('rebase')}>
                        <GitBranch size={17} />
                        <span>Interactive rebase</span>
                        <span className="planned-label">Roadmap</span>
                      </Command.Item>
                      <Command.Item onSelect={() => run('merge')}>
                        <GitMerge size={17} />
                        <span>3-way merge resolution</span>
                        <span className="planned-label">Roadmap</span>
                      </Command.Item>
                    </Command.Group>
                  </Command.List>
                  <div className="command-footer">
                    <span>
                      <kbd>↑</kbd>
                      <kbd>↓</kbd> to navigate
                    </span>
                    <span>
                      <kbd>↵</kbd> to select
                    </span>
                  </div>
                </Command>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
