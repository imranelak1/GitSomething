import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, LoaderCircle, Terminal, Trash2, X } from 'lucide-react';
import { AnimatedTooltip } from './registry/vengeance/AnimatedTooltip';
import type { GitLog } from '@/lib/types';

export function GlassBox({
  logs,
  open,
  onToggle,
  demo,
}: {
  logs: GitLog[];
  open: boolean;
  onToggle: () => void;
  demo: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const visibleLogs = logs.filter((log) => !clearedIds.has(log.id));
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'nearest' });
  }, [logs, open]);
  return (
    <section className={`console ${open ? 'console-open' : ''}`} aria-label="Glass-Box Git console">
      <div className="console-heading">
        <button className="console-toggle" onClick={onToggle} aria-expanded={open}>
          <Terminal size={15} />
          <strong>Glass box</strong>
          <span className="console-subtitle">Understand every move.</span>
          <ChevronDown size={14} className={open ? '' : 'rotated'} />
        </button>
        <div className="console-meta">
          <AnimatedTooltip content="These are equivalent Git commands. Branchline executes Git operations directly through libgit2.">
            <span className="console-equivalent">
              {demo && logs.every((log) => log.operationId === 'demo')
                ? 'Demo commands'
                : 'Equivalent Git commands'}
            </span>
          </AnimatedTooltip>
          <button
            className="icon-button"
            aria-label="Clear visible console"
            onClick={() => setClearedIds(new Set(logs.map((log) => log.id)))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="console-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 92, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {visibleLogs.map((log) => (
              <motion.div
                className="console-line"
                key={log.id}
                initial={{ opacity: 0, x: -9 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
              >
                <span className="console-time">
                  {new Date(
                    log.timestamp < 1e12 ? log.timestamp * 1000 : log.timestamp,
                  ).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
                <span className="console-prompt">❯</span>
                <code>
                  {log.tokens.map((token, i) => (
                    <AnimatedTooltip key={i} content={token.explanation}>
                      <span
                        className={
                          i === 0 ? 'command-git' : token.text.startsWith('-') ? 'command-flag' : ''
                        }
                      >
                        {token.text}
                      </span>
                    </AnimatedTooltip>
                  ))}
                </code>
                <span className={`command-status ${log.status}`}>
                  {log.status === 'running' ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : log.status === 'success' ? (
                    <Check size={12} />
                  ) : (
                    <AnimatedTooltip content={log.message || 'This operation failed.'}>
                      <X size={12} />
                    </AnimatedTooltip>
                  )}
                </span>
              </motion.div>
            ))}
            {!visibleLogs.length && (
              <p className="console-empty">
                Your next action will appear here. Hover a command to see what it means.
              </p>
            )}
            <div ref={end} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
