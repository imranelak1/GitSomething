import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Expand,
  LoaderCircle,
  Minimize2,
  MousePointer2,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatedTooltip } from './registry/vengeance/AnimatedTooltip';
import { AnimatedButton } from './registry/vengeance/AnimatedButton';
import { TextRoll } from './registry/skiper/TextRoll';
import type { GitLog } from '@/lib/types';
import type { ActivityEvent } from '@/lib/activity';
import type { TerminalResult } from '@/lib/guided-commands';
import { getLesson, LEARNING_LESSONS } from '@/lib/learning';
import './glass-box.css';

type Filter = 'all' | 'commands' | 'actions';
type Entry = { id: string; timestamp: number; log?: GitLog; activity?: ActivityEvent };

const milliseconds = (timestamp: number) => (timestamp < 1e12 ? timestamp * 1000 : timestamp);
const commandWords = (source: string) => source.match(/"[^"\n]*"|'[^'\n]*'|\S+/g) || [];
const tokenMeanings: Record<string, string> = {
  git: 'Git records versions of your project. Branchline performs these equivalent operations through libgit2.',
  status: 'Show changed files and which ones are selected for the next commit.',
  log: 'Read the commits already saved in this repository.',
  branch: 'List the named branches in this repository.',
  diff: 'Compare file contents and read the changed lines.',
  add: 'Stage a file: select its current contents for the next commit.',
  restore: 'Restore a file or change its staging selection. This terminal only supports unstaging.',
  commit: 'Save staged changes as a local checkpoint in your project history.',
  fetch: 'Download remote history without changing your working files.',
  pull: 'Download remote commits and bring your branch up to date.',
  push: 'Upload local commits to the configured remote repository.',
  help: 'List the guided commands this terminal can run.',
  '--short': 'Use a compact status display: one changed file per line.',
  '--oneline': 'Show each saved commit on one line.',
  '--staged': 'Refer to the files selected for the next commit.',
  '--ff-only':
    'Only update when your local branch can move forward without rewriting or merging history.',
  '-m': 'Use the following quoted text as the commit message.',
  '--': 'End command options. Anything after this is a file path, even if it starts with a dash.',
};

function inferredLesson(source: string) {
  if (/\b(add|restore)\b/.test(source)) return 'stage';
  if (/\bcommit\b/.test(source)) return 'commit';
  if (/\b(push|pull|fetch)\b/.test(source)) return 'sync';
  if (/\bbranch\b/.test(source)) return 'branch';
  if (/\bdiff\b/.test(source)) return 'diff';
  return 'safety';
}

function Status({ status }: { status?: 'running' | 'success' | 'error' }) {
  if (!status) return null;
  return (
    <span className={`glass-status glass-status-${status}`} aria-label={status}>
      {status === 'running' ? (
        <LoaderCircle size={12} className="spin" />
      ) : status === 'success' ? (
        <Check size={12} />
      ) : (
        <X size={12} />
      )}
    </span>
  );
}

export function GlassBox({
  logs,
  open,
  onToggle,
  demo,
  repositoryName,
  busy,
  activities,
  onRunCommand,
  suggestedCommand,
  stageExamplePath,
}: {
  logs: GitLog[];
  open: boolean;
  onToggle: () => void;
  demo: boolean;
  repositoryName: string;
  busy: boolean;
  activities: ActivityEvent[];
  onRunCommand: (source: string) => Promise<TerminalResult>;
  suggestedCommand?: { id: number; text: string };
  stageExamplePath?: string;
}) {
  const reducedMotion = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const historyDraft = useRef('');
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [following, setFollowing] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [learningOpen, setLearningOpen] = useState(() => window.innerWidth > 1050);
  const [selectedLesson, setSelectedLesson] = useState<string | undefined>();
  const [source, setSource] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState('');

  const entries = useMemo<Entry[]>(
    () =>
      [
        ...logs.map((log) => ({
          id: `git:${log.id}`,
          timestamp: milliseconds(log.timestamp),
          log,
        })),
        ...activities.map((activity) => ({
          id: `activity:${activity.id}`,
          timestamp: milliseconds(activity.timestamp),
          activity,
        })),
      ].sort((a, b) => a.timestamp - b.timestamp),
    [logs, activities],
  );
  const visibleEntries = entries.filter(
    (entry) =>
      !clearedIds.has(entry.id) &&
      (filter === 'all' ||
        (filter === 'commands'
          ? entry.log || entry.activity?.kind === 'command'
          : !entry.log && entry.activity?.kind !== 'command')),
  );
  const lastCommand = [...entries]
    .reverse()
    .find((entry) => entry.log || entry.activity?.kind === 'command');
  const contextLesson =
    lastCommand?.activity?.lessonId ||
    inferredLesson(
      lastCommand?.log?.tokens.map((token) => token.text).join(' ') ||
        lastCommand?.activity?.command ||
        '',
    );
  const lesson = getLesson(selectedLesson || contextLesson);
  const exampleCommand =
    lesson.id === 'stage' && stageExamplePath
      ? `git add -- ${JSON.stringify(stageExamplePath)}`
      : lesson.command;
  const latestLesson = [...activities]
    .reverse()
    .find((activity) => activity.kind === 'lesson' && activity.lessonId);

  const followLatest = () => {
    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
    setFollowing(true);
  };

  useEffect(() => {
    if (open && following && viewport.current)
      viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [entries, filter, open, following]);

  useEffect(() => {
    if (!suggestedCommand) return;
    setSource(suggestedCommand.text);
    setHistoryIndex(-1);
    if (window.innerWidth <= 700) setLearningOpen(false);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [suggestedCommand]);

  useEffect(() => {
    if (!latestLesson?.lessonId) return;
    setSelectedLesson(latestLesson.lessonId);
    setLearningOpen(true);
  }, [latestLesson?.id, latestLesson?.lessonId]);

  useEffect(() => {
    setSelectedLesson(undefined);
  }, [lastCommand?.id]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(''), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const prefill = (command: string) => {
    setSource(command);
    setHistoryIndex(-1);
    if (window.innerWidth <= 700) setLearningOpen(false);
    requestAnimationFrame(() => input.current?.focus());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const command = source.trim();
    if (!command || busy || running) return;
    setSource('');
    setHistory((previous) => [...previous.filter((item) => item !== command), command].slice(-50));
    setHistoryIndex(-1);
    setRunning(true);
    setSelectedLesson(undefined);
    try {
      const result = await onRunCommand(command);
      if (result.lessonId) setSelectedLesson(result.lessonId);
      setFeedback(
        result.ok
          ? 'Command completed. Output is in the terminal.'
          : 'Command failed. Read the error in the terminal.',
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'The command could not run. Try again.');
    } finally {
      setRunning(false);
      input.current?.focus();
    }
  };

  const recall = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || !history.length) return;
    if (event.key === 'ArrowDown' && historyIndex === -1) return;
    event.preventDefault();
    if (event.key === 'ArrowUp') {
      if (historyIndex === -1) historyDraft.current = source;
      const index = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(index);
      setSource(history[index]);
    } else {
      const index = historyIndex === -1 ? -1 : historyIndex + 1;
      setHistoryIndex(index >= history.length ? -1 : index);
      setSource(index === -1 || index >= history.length ? historyDraft.current : history[index]);
    }
  };

  const copy = async () => {
    const content = visibleEntries
      .map(({ log, activity }) =>
        log
          ? `${log.tokens.map((token) => token.text).join(' ')} [${log.status}]${log.message ? `\n${log.message}` : ''}`
          : `${activity?.command || activity?.label}${activity?.output ? `\n${activity.output}` : ''}`,
      )
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(content);
      setFeedback('Visible terminal entries copied.');
    } catch {
      setFeedback('Clipboard access is unavailable in this window.');
    }
  };

  return (
    <section
      className={`console glass-terminal ${open ? 'console-open' : ''} ${expanded ? 'glass-terminal-expanded' : ''} ${learningOpen ? 'glass-learning-open' : ''}`}
      aria-label="Glass-Box Git console"
    >
      <div className="glass-terminal-heading">
        <button
          className="glass-terminal-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="glass-terminal-content"
          data-activity-label={open ? 'Close Glass Box' : 'Open Glass Box'}
          data-activity-description="Show or hide the live record of actions and equivalent Git commands."
        >
          <Terminal size={15} className="glass-terminal-mark" />
          <strong>
            <TextRoll>Glass box</TextRoll>
          </strong>
          <span className="glass-terminal-subtitle">Every move, explained.</span>
          <ChevronDown size={13} className={open ? '' : 'rotated'} />
        </button>
        <div className="glass-terminal-tools">
          <span className={`glass-environment ${demo ? 'is-demo' : ''}`}>
            <i />
            {demo ? 'Practice' : 'Local'}
          </span>
          {open && (
            <>
              <button
                className={`glass-tool glass-learn-toggle ${learningOpen ? 'is-active' : ''}`}
                onClick={() => setLearningOpen(!learningOpen)}
                aria-label={learningOpen ? 'Hide learning panel' : 'Show learning panel'}
                aria-pressed={learningOpen}
                data-activity-label={
                  learningOpen ? 'Hide the learning panel' : 'Open the learning panel'
                }
                data-activity-description="Read plain-language explanations and try guided Git commands."
              >
                <BookOpen size={14} />
                <span>Learn</span>
              </button>
              <button
                className="glass-tool glass-size-toggle"
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? 'Reduce terminal height' : 'Expand terminal'}
                aria-pressed={expanded}
                data-activity-description="Change the terminal height to make more room for its output."
              >
                {expanded ? <Minimize2 size={14} /> : <Expand size={14} />}
              </button>
            </>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="glass-terminal-content"
            className="glass-terminal-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: expanded ? 350 : 228, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="glass-terminal-main">
              <div className="glass-terminal-toolbar">
                <div
                  className="glass-terminal-filters"
                  role="group"
                  aria-label="Filter terminal entries"
                >
                  {(['all', 'commands', 'actions'] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      data-activity-label={`Show ${value === 'all' ? 'all terminal entries' : value}`}
                      data-activity-description={
                        value === 'commands'
                          ? 'Read equivalent Git commands and commands you typed.'
                          : value === 'actions'
                            ? 'Read the interface actions you have taken.'
                            : 'Read interface actions alongside their equivalent Git commands.'
                      }
                    >
                      {value === 'all'
                        ? 'All activity'
                        : value === 'commands'
                          ? 'Commands'
                          : 'Actions'}
                    </button>
                  ))}
                </div>
                <div className="glass-terminal-utilities">
                  <AnimatedTooltip content="Git actions run through libgit2. The command text is its CLI equivalent. Typed commands use the same engine; no shell is started.">
                    <span className="glass-engine-label">
                      libgit2 <span aria-hidden="true">↔</span> Git
                    </span>
                  </AnimatedTooltip>
                  <button
                    className="glass-tool"
                    aria-label="Copy visible console"
                    onClick={() => void copy()}
                    data-activity-description="Copy the visible action log and command output to your clipboard."
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="glass-tool"
                    aria-label="Clear visible console"
                    onClick={() => {
                      setClearedIds(new Set(entries.map((entry) => entry.id)));
                      setFollowing(true);
                    }}
                    data-activity-description="Hide existing terminal entries. Future actions still appear; repository files and history stay unchanged."
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div
                ref={viewport}
                className="glass-terminal-stream"
                role="log"
                aria-label="Git commands and interface actions"
                aria-live="off"
                onScroll={() => {
                  const element = viewport.current;
                  if (element)
                    setFollowing(
                      element.scrollHeight - element.scrollTop - element.clientHeight < 36,
                    );
                }}
              >
                {visibleEntries.length === 0 && (
                  <div className="glass-terminal-empty">
                    <Terminal size={19} />
                    <p>
                      Your next move starts here.
                      <span>
                        Click an action or try <code>git status</code> below. Commands explain
                        themselves on hover or focus.
                      </span>
                    </p>
                  </div>
                )}
                {visibleEntries.map(({ id, timestamp, log, activity }) => {
                  const isCommand = Boolean(log || activity?.kind === 'command');
                  const tokens =
                    log?.tokens ||
                    (activity?.command
                      ? commandWords(activity.command).map((text, index) => ({
                          text,
                          explanation:
                            tokenMeanings[text] ||
                            (index > 1 && !text.startsWith('-')
                              ? 'A command argument: a file path or the value for the option before it. Quoted text stays together as one argument.'
                              : 'A guided Git command token. Use help to see the supported command forms.'),
                        }))
                      : []);
                  return (
                    <div
                      key={id}
                      className={`glass-entry ${isCommand ? 'glass-entry-command' : 'glass-entry-action'} ${activity?.kind === 'lesson' ? 'glass-entry-lesson' : ''} ${activity?.status === 'error' || log?.status === 'error' ? 'glass-entry-error' : ''}`}
                    >
                      <time
                        className="glass-entry-time"
                        dateTime={new Date(timestamp).toISOString()}
                      >
                        {new Date(timestamp).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                      <span className="glass-entry-symbol" aria-hidden="true">
                        {isCommand ? (
                          '❯'
                        ) : activity?.kind === 'lesson' ? (
                          <BookOpen size={11} />
                        ) : (
                          <MousePointer2 size={10} />
                        )}
                      </span>
                      <div className="glass-entry-content">
                        {isCommand ? (
                          <div className="glass-command-line">
                            <code>
                              {tokens.map((token, index) => (
                                <AnimatedTooltip
                                  key={`${index}:${token.text}`}
                                  content={token.explanation}
                                >
                                  <span
                                    className={
                                      index === 0
                                        ? 'glass-command-git'
                                        : token.text.startsWith('-')
                                          ? 'glass-command-flag'
                                          : ''
                                    }
                                  >
                                    {token.text}
                                  </span>
                                </AnimatedTooltip>
                              ))}
                            </code>
                            <Status status={log?.status || activity?.status} />
                            <span className="glass-entry-origin">
                              {log ? 'equivalent' : 'guided'}
                            </span>
                          </div>
                        ) : (
                          <p className="glass-action-label">
                            <AnimatedTooltip
                              content={activity?.description || 'Interface action recorded.'}
                            >
                              <span>{activity?.label}</span>
                            </AnimatedTooltip>
                            <span className="glass-action-description">
                              {activity?.description}
                            </span>
                          </p>
                        )}
                        {activity?.output && (
                          <pre className="glass-command-output">{activity.output}</pre>
                        )}
                        {log?.message && <p className="glass-command-message">{log.message}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!following && (
                <button
                  className="glass-follow"
                  onClick={followLatest}
                  data-activity-label="Follow the latest terminal output"
                  data-activity-description="Scroll to the newest entry and keep following incoming actions."
                >
                  <ArrowDown size={11} /> Follow latest
                </button>
              )}
              <form className="glass-command-form" onSubmit={(event) => void submit(event)}>
                <label
                  htmlFor="glass-command-input"
                  className="glass-command-context"
                  title={repositoryName}
                >
                  {repositoryName}
                  <span aria-hidden="true">❯</span>
                </label>
                <input
                  ref={input}
                  id="glass-command-input"
                  aria-label="Guided Git command"
                  value={source}
                  placeholder="git status, or help"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setSource(event.target.value);
                    setHistoryIndex(-1);
                  }}
                  onKeyDown={recall}
                  aria-describedby="glass-command-hint"
                />
                <AnimatedButton
                  type="submit"
                  className="glass-run"
                  disabled={!source.trim() || busy || running}
                  aria-label="Run command"
                  data-activity-label="Run a guided Git command"
                  data-activity-description="Check the supported command, then execute it through the same Git engine as the interface."
                >
                  {running ? (
                    <LoaderCircle size={12} className="spin" />
                  ) : (
                    <CornerDownLeft size={13} />
                  )}
                  <span>Run</span>
                </AnimatedButton>
              </form>
              <div className="glass-terminal-footnote">
                <span id="glass-command-hint">
                  {demo
                    ? 'Practice repository · simulated writes'
                    : 'Current repository · real Git operations'}
                  <span className="glass-hint-extra"> · ↑ ↓ command history</span>
                </span>
                <span role="status">
                  {feedback || (running ? 'Running…' : 'Guided commands only')}
                </span>
              </div>
            </div>
            {learningOpen && (
              <aside className="glass-learning" aria-label="Git learning panel">
                <div className="glass-learning-heading">
                  <BookOpen size={13} />
                  <span>LEARN THIS MOVE</span>
                  <span className="glass-learning-count">
                    {LEARNING_LESSONS.findIndex((item) => item.id === lesson.id) + 1} /{' '}
                    {LEARNING_LESSONS.length}
                  </span>
                </div>
                <select
                  className="glass-lesson-select"
                  aria-label="Learning topic"
                  value={lesson.id}
                  onChange={(event) => setSelectedLesson(event.target.value)}
                >
                  {LEARNING_LESSONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <p className="glass-learning-explanation">{lesson.explanation}</p>
                <p className="glass-learning-tip">
                  {lesson.id === 'stage' && !stageExamplePath
                    ? 'The command below contains an example path. Replace it with a changed file before running.'
                    : lesson.tip}
                </p>
                <button
                  className="glass-try-command"
                  onClick={() => prefill(exampleCommand)}
                  data-activity-label={`Try the ${lesson.title.toLowerCase()} lesson`}
                  data-activity-description="Put this lesson’s example in the terminal. Review it, then press Run when you are ready."
                >
                  <code>{exampleCommand}</code>
                  <ArrowRight size={13} />
                  <span className="sr-only">Type example command</span>
                </button>
                <div className="glass-learning-shortcuts">
                  <span>Start with a read</span>
                  <button
                    onClick={() => prefill('git status --short')}
                    data-activity-label="Prepare git status"
                    data-activity-description="Check your changed files without editing them."
                  >
                    status
                  </button>
                  <button
                    onClick={() => prefill('help')}
                    data-activity-label="Prepare terminal help"
                    data-activity-description="List supported commands and their purpose."
                  >
                    help
                  </button>
                </div>
              </aside>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
