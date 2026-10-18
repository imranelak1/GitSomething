import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as chooseDirectory } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Play,
} from 'lucide-react';
import { KineticModal } from '../registry/skiper/KineticModal';
import { AnimatedTooltip } from '../registry/vengeance/AnimatedTooltip';
import { GitHubConnectCard } from '../auth/GitHubConnectCard';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { useActivity } from '../../hooks/useActivity';
import { trackEvent } from '@/lib/analytics';
import { Button } from '../ui/button';
import { SlideToConfirm } from '../SlideToConfirm';
import './publish.css';

type Provider = 'github' | 'gitlab';
type PublishStep = 'validate' | 'init' | 'commit' | 'remote' | 'push' | 'done';
type StepStatus = 'running' | 'success' | 'error';
interface PublishProgress {
  operationId: string;
  step: PublishStep;
  status: StepStatus;
  message?: string;
  url?: string;
}
interface PublishedRepository {
  url: string;
  path: string;
  branch: string;
}
interface DropzoneToGitHubProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished: (result: PublishedRepository) => void;
  initialPath?: string;
}

const steps: { key: PublishStep; title: string; description: string }[] = [
  {
    key: 'validate',
    title: 'Check your folder',
    description: 'Validate the folder and your account',
  },
  { key: 'init', title: 'Set up version history', description: 'Initialize the local repository' },
  {
    key: 'commit',
    title: 'Save your first commit',
    description: 'Create a snapshot of your files',
  },
  {
    key: 'remote',
    title: 'Create the cloud repository',
    description: 'Connect your local and remote repositories',
  },
  { key: 'push', title: 'Push your files', description: 'Upload your commit and track the branch' },
];

const folderName = (path: string) =>
  path
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1)
    ?.replace(/[^a-zA-Z0-9._-]/g, '-') ?? '';
const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const safeRepositoryUrl = (url: string): string | undefined => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      ['github.com', 'gitlab.com'].includes(parsed.hostname)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
};

function PublishPipeline({
  provider,
  hasFolder,
  busy = false,
  progress = {},
}: {
  provider: Provider;
  hasFolder: boolean;
  busy?: boolean;
  progress?: Partial<Record<PublishStep, StepStatus>>;
}) {
  const reducedMotion = useReducedMotion();
  const localDone = progress.init === 'success';
  const commitDone = progress.commit === 'success';
  const cloudDone = progress.push === 'success';
  const localRunning =
    busy &&
    ['validate', 'init', 'commit'].some((key) => progress[key as PublishStep] === 'running');
  const cloudRunning =
    busy && ['remote', 'push'].some((key) => progress[key as PublishStep] === 'running');

  return (
    <div className={`publish-pipeline ${busy ? 'is-running' : ''}`} aria-hidden="true">
      <svg className="publish-pipeline-wires" viewBox="0 0 500 112" preserveAspectRatio="none">
        <path
          className={`publish-wire ${commitDone ? 'is-complete' : ''}`}
          d="M109 41 H174 Q184 41 184 51 V57 Q184 67 194 67 H224"
        />
        <path
          className={`publish-wire publish-wire-cloud ${cloudDone ? 'is-complete' : ''}`}
          d="M276 67 H306 Q316 67 316 57 V51 Q316 41 326 41 H391"
        />
        {localRunning &&
          !reducedMotion &&
          [0, 1].map((particle) => (
            <motion.circle
              key={`local-${particle}`}
              r="3"
              cx={109}
              cy={41}
              className="publish-transfer-dot"
              initial={{ cx: 109, cy: 41, opacity: 0 }}
              animate={{
                cx: [109, 174, 184, 194, 224],
                cy: [41, 41, 54, 67, 67],
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{
                duration: 1.45,
                delay: particle * 0.72,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}
        {cloudRunning &&
          !reducedMotion &&
          [0, 1].map((particle) => (
            <motion.circle
              key={`cloud-${particle}`}
              r="3"
              cx={276}
              cy={67}
              className="publish-transfer-dot publish-transfer-cloud"
              initial={{ cx: 276, cy: 67, opacity: 0 }}
              animate={{
                cx: [276, 306, 316, 326, 391],
                cy: [67, 67, 54, 41, 41],
                opacity: [0, 1, 1, 1, 0],
              }}
              transition={{
                duration: 1.45,
                delay: particle * 0.72,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}
      </svg>
      <div
        className={`publish-pipeline-stage publish-stage-local ${hasFolder || localDone ? 'is-ready' : ''} ${localRunning ? 'is-active' : ''}`}
      >
        <motion.div
          className="publish-pipeline-icon"
          whileHover={reducedMotion ? undefined : { rotate: -7, y: -3 }}
        >
          {localDone ? (
            <Check size={23} />
          ) : (
            <motion.svg
              viewBox="0 0 100 78"
              className="publish-folder-drawing"
              initial="rest"
              whileHover={reducedMotion ? undefined : 'open'}
            >
              <path
                d="M9 24a7 7 0 0 1 7-7h22l8 9h38a7 7 0 0 1 7 7v31a7 7 0 0 1-7 7H16a7 7 0 0 1-7-7Z"
                fill="var(--ui-accent-fill)"
                stroke="var(--ui-accent-ink)"
                strokeWidth="1.6"
              />
              <motion.g
                variants={{ rest: { y: 0, rotate: -7 }, open: { y: -8, rotate: 0 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{ transformOrigin: '50% 100%' }}
              >
                <rect
                  x="24"
                  y="9"
                  width="47"
                  height="51"
                  rx="4"
                  fill="var(--ui-raised)"
                  stroke="var(--ui-border-strong)"
                  strokeWidth="1.5"
                />
                <path
                  d="M33 21h26M33 28h18M33 35h23"
                  stroke="var(--ui-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="m39 45 5 5 10-10"
                  fill="none"
                  stroke="var(--ui-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.g>
              <path
                d="M9 38a4 4 0 0 1 4-4h74a4 4 0 0 1 4 5l-7 27a7 7 0 0 1-7 5H20a7 7 0 0 1-7-6Z"
                fill="var(--ui-accent)"
                stroke="var(--ui-accent-ink)"
                strokeWidth="1.6"
              />
              <path
                d="M24 45h18"
                stroke="var(--ui-accent-ink)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </motion.svg>
          )}
        </motion.div>
        <strong>Local folder</strong>
        <span>
          {localDone
            ? 'History initialized'
            : hasFolder
              ? 'Folder selected'
              : 'Start with your files'}
        </span>
      </div>
      <div
        className={`publish-pipeline-stage publish-stage-commit ${commitDone ? 'is-ready' : ''} ${progress.commit === 'running' ? 'is-active' : ''}`}
      >
        <motion.div
          className="publish-pipeline-icon"
          whileHover={reducedMotion ? undefined : { rotate: 7, y: -3 }}
        >
          {commitDone ? <Check size={23} /> : <GitCommitHorizontal size={26} />}
        </motion.div>
        <strong>First commit</strong>
        <span>{commitDone ? 'Snapshot saved' : 'A fresh beginning'}</span>
      </div>
      <div
        className={`publish-pipeline-stage publish-stage-cloud ${cloudDone ? 'is-ready' : ''} ${cloudRunning ? 'is-active' : ''}`}
      >
        <motion.div
          className="publish-pipeline-icon"
          whileHover={reducedMotion ? undefined : { rotate: -7, y: -3 }}
        >
          {cloudDone ? (
            <Check size={23} />
          ) : provider === 'github' ? (
            <Github size={26} />
          ) : (
            <GitBranch size={26} />
          )}
        </motion.div>
        <strong>{provider === 'github' ? 'GitHub' : 'GitLab'}</strong>
        <span>{cloudDone ? 'Your code is up' : 'Ready for the world'}</span>
      </div>
    </div>
  );
}

export function DropzoneToGitHub({
  open,
  onOpenChange,
  onPublished,
  initialPath = '',
}: DropzoneToGitHubProps) {
  const [path, setPath] = useState(initialPath);
  const [name, setName] = useState(folderName(initialPath));
  const [provider, setProvider] = useState<Provider>('github');
  const [privateRepo, setPrivateRepo] = useState(true);
  const [token, setToken] = useState('');
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [manualPath, setManualPath] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<PublishStep, StepStatus>>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<PublishedRepository | null>(null);
  const mounted = useRef(true);
  const activeOperation = useRef<string | null>(null);
  const activeUnlisten = useRef<UnlistenFn | null>(null);
  const lastExternalPath = useRef('');
  const lastGitHubIdentity = useRef({ name: '', email: '' });
  const surface = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const publishing = useRef(false);
  const reducedMotion = useReducedMotion();
  const desktop = isDesktop();
  const github = useGitHubAuth();
  const { record, settle } = useActivity();
  const hasProgress = Object.keys(progress).length > 0;
  const screen = result ? 'complete' : hasProgress ? 'progress' : 'setup';

  useLayoutEffect(() => {
    if (open) surface.current?.closest<HTMLElement>('.publish-dialog')?.scrollTo({ top: 0 });
  }, [open, screen]);

  useEffect(() => {
    if (provider !== 'github' || !github.account) return;
    const previous = lastGitHubIdentity.current;
    const next = {
      name: github.account.name || github.account.login,
      email: github.account.email || '',
    };
    setAuthorName((value) => (!value || value === previous.name ? next.name : value));
    setAuthorEmail((value) => (!value || value === previous.email ? next.email : value));
    lastGitHubIdentity.current = next;
  }, [provider, github.account]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeOperation.current = null;
      activeUnlisten.current?.();
      activeUnlisten.current = null;
    };
  }, []);

  useEffect(() => {
    if (initialPath && open && !busy && initialPath !== lastExternalPath.current) {
      lastExternalPath.current = initialPath;
      setPath(initialPath);
      setName(folderName(initialPath));
      setManualPath(false);
    }
  }, [initialPath, open, busy]);

  useEffect(() => {
    if (!open && !busy) {
      setToken('');
      setError('');
      setResult(null);
      setProgress({});
      setPreview(false);
      setMessage('');
    }
  }, [open, busy]);

  async function pickFolder() {
    if (!desktop || busy) return;
    try {
      const selected = await chooseDirectory({
        directory: true,
        multiple: false,
        title: 'Choose a folder to publish',
      });
      if (selected && typeof selected === 'string' && mounted.current) {
        setPath(selected);
        setName(folderName(selected));
        setError('');
      }
    } catch (reason) {
      if (mounted.current) {
        setError(
          `Could not open the folder picker. Enter the folder path below. ${String(reason)}`,
        );
        setManualPath(true);
      }
    }
  }

  function preventImplicitPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(
      'Slide to the end and release to create & push. With a keyboard, focus the slider, press End, then Enter.',
    );
  }

  async function publish() {
    if (!desktop || busy || publishing.current) return;
    if (!path.trim()) {
      setError('Choose the folder you want to publish.');
      return;
    }
    if (provider === 'github' && !github.connected) {
      setError('Sign in with GitHub before creating your cloud repository.');
      return;
    }
    if (!form.current?.reportValidity()) return;
    publishing.current = true;
    const operationId = crypto.randomUUID();
    const activityId = record({
      kind: 'operation',
      label: provider === 'github' ? 'Publish to GitHub' : 'Publish to GitLab',
      description:
        'Create the cloud repository and push the first commit. Git commands report their own progress.',
      status: 'running',
    });
    activeOperation.current = operationId;
    setBusy(true);
    setPreview(false);
    setError('');
    setProgress({ validate: 'running' });
    setMessage('Checking the folder and your account…');
    let unlisten: UnlistenFn | null = null;
    let listenerDisposed = false;
    let publishStarted = false;
    const disposeListener = () => {
      if (!listenerDisposed && unlisten) {
        listenerDisposed = true;
        unlisten();
      }
    };

    try {
      // Subscribe before invoking: fast libgit2 steps must never outrun the UI.
      unlisten = await listen<PublishProgress>('publish:progress', ({ payload }) => {
        if (!mounted.current || payload.operationId !== activeOperation.current) return;
        setProgress((current) => ({ ...current, [payload.step]: payload.status }));
        if (payload.message) setMessage(payload.message);
      });
      if (!mounted.current || activeOperation.current !== operationId) {
        disposeListener();
        return;
      }
      activeUnlisten.current = disposeListener;
      publishStarted = true;
      const published = await invoke<PublishedRepository>('publish_repository', {
        request: {
          path: path.trim(),
          name: name.trim(),
          private: privateRepo,
          provider,
          token: provider === 'github' ? '' : token,
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim(),
          operationId,
        },
      });
      trackEvent('gitsomething repository published', {
        provider,
        visibility: privateRepo ? 'private' : 'public',
        outcome: 'success',
      });
      if (!mounted.current || activeOperation.current !== operationId) return;
      setProgress(Object.fromEntries(steps.map((step) => [step.key, 'success'])));
      setResult(published);
      setMessage('Your first push is complete.');
      settle(activityId, {
        status: 'success',
        output: 'Cloud repository created and the first push completed.',
      });
    } catch (reason) {
      if (publishStarted) {
        trackEvent('gitsomething repository published', {
          provider,
          visibility: privateRepo ? 'private' : 'public',
          outcome: 'error',
        });
      }
      const failure =
        typeof reason === 'string'
          ? reason
          : reason instanceof Error
            ? reason.message
            : 'Publishing could not finish. Your local files are still available.';
      settle(activityId, {
        status: 'error',
        output: failure.slice(0, 1000),
      });
      if (mounted.current && activeOperation.current === operationId) {
        setError(failure);
        setProgress((current) =>
          Object.fromEntries(
            Object.entries(current).map(([key, status]) => [
              key,
              status === 'running' ? 'error' : status,
            ]),
          ),
        );
      }
    } finally {
      publishing.current = false;
      disposeListener();
      if (activeUnlisten.current === disposeListener) activeUnlisten.current = null;
      if (mounted.current && activeOperation.current === operationId) {
        setBusy(false);
        setToken('');
      }
    }
  }

  async function runPreview() {
    if (busy) return;
    const operationId = `preview-${crypto.randomUUID()}`;
    activeOperation.current = operationId;
    setBusy(true);
    setPreview(true);
    setError('');
    setResult(null);
    setProgress({});
    for (const step of steps) {
      if (!mounted.current || activeOperation.current !== operationId) return;
      setProgress((current) => ({ ...current, [step.key]: 'running' }));
      setMessage(step.description);
      await new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 150 : 700));
      if (!mounted.current || activeOperation.current !== operationId) return;
      setProgress((current) => ({ ...current, [step.key]: 'success' }));
    }
    setMessage('Preview complete. No files or remote repositories were changed.');
    setBusy(false);
  }

  function resetProgress() {
    setProgress({});
    setPreview(false);
    setError('');
    setMessage('');
  }

  const completed = steps.filter((step) => progress[step.key] === 'success').length;
  const repositoryUrl = result ? safeRepositoryUrl(result.url) : undefined;

  return (
    <KineticModal
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={
        result
          ? 'Your project is on the map.'
          : hasProgress
            ? preview
              ? 'A preview of your first push'
              : 'Making it official.'
            : 'From local to launched.'
      }
      description={
        result
          ? 'Repository created. First commit pushed. Ready for what’s next.'
          : hasProgress
            ? 'Every step is visible. Your work stays yours.'
            : 'Your folder. A name. Your first push. We’ll connect the dots.'
      }
    >
      <div ref={surface}>
        <AnimatePresence mode="wait" initial={false}>
          {hasProgress ? (
            <motion.div
              key="progress"
              className="publish-progress-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.15 }}
            >
              {preview && (
                <div className="publish-preview-label">
                  <Play size={13} /> Preview only · no files or repositories are changed
                </div>
              )}
              <PublishPipeline
                provider={provider}
                hasFolder={!!path}
                busy={busy}
                progress={progress}
              />
              <div className="publish-progress-repo">
                <div className="publish-repo-icon">
                  <Folder size={21} />
                </div>
                <div>
                  <strong>{name || 'your-project'}</strong>
                  <span>
                    {provider === 'github' ? 'GitHub' : 'GitLab'} ·{' '}
                    {privateRepo ? 'Private repository' : 'Public repository'}
                  </span>
                </div>
                <GitBranch size={17} />
              </div>
              <div className="publish-progress-track" aria-hidden="true">
                <motion.div
                  animate={{ width: `${(completed / steps.length) * 100}%` }}
                  transition={{ duration: reducedMotion ? 0 : 0.35 }}
                />
              </div>
              <ol className="publish-steps" aria-label="Publishing progress">
                {steps.map((step, index) => {
                  const status = progress[step.key];
                  return (
                    <motion.li
                      key={step.key}
                      className={`publish-step ${status ?? 'waiting'}`}
                      animate={{ x: status === 'running' && !reducedMotion ? 4 : 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    >
                      <span className="publish-step-marker">
                        {status === 'success' ? (
                          <Check size={14} />
                        ) : status === 'running' ? (
                          <LoaderCircle className="publish-spinner" size={15} />
                        ) : status === 'error' ? (
                          <CircleAlert size={15} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <div>
                        <strong>{step.title}</strong>
                        <span>{step.description}</span>
                      </div>
                      {status === 'success' && <span className="publish-step-done">Done</span>}
                    </motion.li>
                  );
                })}
              </ol>
              <p className="publish-progress-message" aria-live="polite">
                {message}
              </p>
              {error && (
                <div className="publish-error" role="alert">
                  <CircleAlert size={16} />
                  <span>{error}</span>
                </div>
              )}
              <footer className="publish-progress-footer">
                {result ? (
                  <>
                    <a
                      className="publish-secondary-button"
                      href={repositoryUrl}
                      aria-disabled={!repositoryUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open on {provider === 'github' ? 'GitHub' : 'GitLab'}
                      <ExternalLink size={14} />
                    </a>
                    <Button
                      className="publish-primary-button"
                      onClick={() => {
                        onPublished(result);
                        onOpenChange(false);
                      }}
                    >
                      Open repository
                      <ArrowRight size={15} />
                    </Button>
                  </>
                ) : busy ? (
                  <span className="publish-running-note">
                    <LoaderCircle className="publish-spinner" size={14} />
                    {preview ? 'Playing preview…' : 'Publishing your repository…'}
                  </span>
                ) : (
                  <>
                    <button className="publish-secondary-button" onClick={resetProgress}>
                      {error ? 'Back to setup' : 'Replay setup'}
                    </button>
                    <Button className="publish-primary-button" onClick={() => onOpenChange(false)}>
                      Done
                      <Check size={15} />
                    </Button>
                  </>
                )}
              </footer>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              ref={form}
              onSubmit={preventImplicitPublish}
              className="publish-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.15 }}
            >
              <PublishPipeline provider={provider} hasFolder={!!path} />
              <motion.button
                type="button"
                className={`publish-drop-target ${path ? 'has-folder' : ''}`}
                onClick={pickFolder}
                disabled={!desktop}
                whileHover={reducedMotion || !desktop ? undefined : { y: -2 }}
                whileTap={reducedMotion || !desktop ? undefined : { scale: 0.99 }}
              >
                <FolderOpen size={20} />
                <span>
                  <strong>
                    {path
                      ? folderName(path)
                      : desktop
                        ? 'Drop a folder here, or choose one'
                        : 'Your local folder goes here'}
                  </strong>
                  <span>
                    {path ||
                      (desktop
                        ? 'We’ll take it from here.'
                        : 'Native folder access is available in the desktop app.')}
                  </span>
                </span>
                {desktop && <ArrowUpRight size={17} />}
              </motion.button>
              {desktop && (
                <button
                  type="button"
                  className="publish-text-button publish-manual-toggle"
                  onClick={() => setManualPath(!manualPath)}
                >
                  {manualPath ? 'Hide folder path' : 'Enter a folder path instead'}
                  <ChevronDown size={12} className={manualPath ? 'is-open' : ''} />
                </button>
              )}
              {manualPath && (
                <label className="publish-label">
                  Folder path
                  <input
                    type="text"
                    value={path}
                    onChange={(event) => {
                      setPath(event.target.value);
                      if (!name) setName(folderName(event.target.value));
                    }}
                    placeholder="C:\Users\you\Projects\my-project"
                    required
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              )}
              <div className="publish-name-provider-row">
                <label className="publish-label">
                  Repository name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="your-next-big-thing"
                    required={desktop}
                    pattern={'[a-zA-Z0-9._\\-]+'}
                    maxLength={100}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label className="publish-label publish-provider-label">
                  Publish to
                  <span className="publish-select-wrap">
                    <select
                      value={provider}
                      onChange={(event) => {
                        setProvider(event.target.value as Provider);
                        setToken('');
                      }}
                      aria-label="Git provider"
                    >
                      <option value="github">GitHub</option>
                      <option value="gitlab">GitLab</option>
                    </select>
                    <ChevronDown size={13} />
                  </span>
                </label>
              </div>
              <div className="publish-visibility-row">
                <div className="publish-visibility-copy">
                  <strong>Who can see your code?</strong>
                  <span>
                    {privateRepo
                      ? 'Only you and people you invite.'
                      : 'Anyone can see your files and history.'}
                  </span>
                </div>
                <div
                  className="publish-visibility-toggle"
                  aria-label="Repository visibility"
                  role="group"
                >
                  {[
                    { value: true, label: 'Private', icon: LockKeyhole },
                    { value: false, label: 'Public', icon: Globe2 },
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={label}
                      aria-pressed={privateRepo === value}
                      onClick={() => setPrivateRepo(value)}
                    >
                      {privateRepo === value && (
                        <motion.span
                          className="publish-visibility-active"
                          layoutId="publish-visibility"
                          transition={{
                            type: 'spring',
                            stiffness: 450,
                            damping: 35,
                            duration: reducedMotion ? 0 : undefined,
                          }}
                        />
                      )}
                      <Icon size={13} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {provider === 'github' ? (
                <GitHubConnectCard compact />
              ) : desktop ? (
                <div className="publish-auth-fields">
                  <label className="publish-label">
                    <span className="publish-field-label">
                      <span>GitLab access token</span>
                      <AnimatedTooltip content="Use a GitLab token with api and write_repository access. Your token is used for this publish only and is never saved.">
                        <KeyRound size={12} />
                      </AnimatedTooltip>
                    </span>
                    <input
                      type="password"
                      value={token}
                      onChange={(event) => {
                        setToken(event.target.value);
                        setCredentialsVersion((value) => value + 1);
                      }}
                      required
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="glpat-…"
                    />
                    <span className="publish-field-hint">
                      <LockKeyhole size={10} />
                      Used once. Never stored.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="publish-desktop-note">
                  <Monitor size={16} />
                  <span>
                    <strong>Desktop app required to publish</strong>
                    <span>Explore the flow below. Your files stay untouched.</span>
                  </span>
                </div>
              )}
              {desktop && (
                <details className="publish-identity" key={provider} open={provider === 'gitlab'}>
                  <summary>
                    <GitCommitHorizontal size={13} />
                    Commit identity
                    <span>
                      {provider === 'github'
                        ? authorName || 'From your GitHub profile'
                        : 'Your name and email'}
                    </span>
                    <ChevronDown size={13} />
                  </summary>
                  <p>Your name and email appear in the first commit. You can change them here.</p>
                  <div className="publish-author-row">
                    <label className="publish-label">
                      Commit author
                      <input
                        value={authorName}
                        onChange={(event) => setAuthorName(event.target.value)}
                        placeholder="Your name"
                        required={provider === 'gitlab'}
                        autoComplete="name"
                      />
                    </label>
                    <label className="publish-label">
                      Commit email
                      <input
                        type="email"
                        value={authorEmail}
                        onChange={(event) => setAuthorEmail(event.target.value)}
                        placeholder={
                          provider === 'github' ? 'Use my GitHub commit email' : 'you@example.com'
                        }
                        required={provider === 'gitlab'}
                        autoComplete="email"
                      />
                    </label>
                  </div>
                </details>
              )}
              {error && (
                <div className="publish-error" role="alert">
                  <CircleAlert size={16} />
                  <span>{error}</span>
                </div>
              )}
              <footer className={`publish-form-footer ${desktop ? 'publish-slide-footer' : ''}`}>
                <span className="publish-footer-note">
                  <GitCommitHorizontal size={13} />
                  {desktop && provider === 'github' && !github.connected
                    ? 'Sign in above to create & push.'
                    : 'One folder. First commit. First push.'}
                </span>
                {desktop ? (
                  <SlideToConfirm
                    className="publish-confirmation"
                    label="Slide to create & push"
                    pendingLabel="Creating & pushing…"
                    description={`Create a ${privateRepo ? 'private' : 'public'} ${provider === 'github' ? 'GitHub' : 'GitLab'} repository, save your first commit, then push your files. ${privateRepo ? 'Only people you grant access can see it.' : 'Anyone can see the published files.'}`}
                    disabled={busy || (provider === 'github' && !github.connected)}
                    busy={busy}
                    resetKey={JSON.stringify([
                      open,
                      path,
                      name,
                      provider,
                      privateRepo,
                      github.connected,
                      github.account?.login,
                      authorName,
                      authorEmail,
                      credentialsVersion,
                    ])}
                    onConfirm={publish}
                  />
                ) : (
                  <Button type="button" className="publish-primary-button" onClick={runPreview}>
                    <Play size={14} />
                    Preview flow
                  </Button>
                )}
              </footer>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </KineticModal>
  );
}
