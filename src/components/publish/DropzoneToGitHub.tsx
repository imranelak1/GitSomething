import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as chooseDirectory } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  Upload,
} from 'lucide-react';
import { KineticModal } from '../registry/skiper/KineticModal';
import { AnimatedTooltip } from '../registry/vengeance/AnimatedTooltip';
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
  const reducedMotion = useReducedMotion();
  const desktop = isDesktop();
  const hasProgress = Object.keys(progress).length > 0;

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

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!desktop || busy) return;
    if (!path.trim()) {
      setError('Choose the folder you want to publish.');
      return;
    }
    const operationId = crypto.randomUUID();
    activeOperation.current = operationId;
    setBusy(true);
    setPreview(false);
    setError('');
    setProgress({ validate: 'running' });
    setMessage('Checking the folder and your account…');
    let unlisten: UnlistenFn | null = null;
    let listenerDisposed = false;
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
      const published = await invoke<PublishedRepository>('publish_repository', {
        request: {
          path: path.trim(),
          name: name.trim(),
          private: privateRepo,
          provider,
          token,
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim(),
          operationId,
        },
      });
      if (!mounted.current || activeOperation.current !== operationId) return;
      setProgress(Object.fromEntries(steps.map((step) => [step.key, 'success'])));
      setResult(published);
      setMessage('Your first push is complete.');
    } catch (reason) {
      if (mounted.current && activeOperation.current === operationId) {
        setError(
          typeof reason === 'string'
            ? reason
            : reason instanceof Error
              ? reason.message
              : 'Publishing could not finish. Your local files are still available.',
        );
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
                  <li key={step.key} className={`publish-step ${status ?? 'waiting'}`}>
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
                  </li>
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
                  <button
                    className="publish-primary-button"
                    onClick={() => {
                      onPublished(result);
                      onOpenChange(false);
                    }}
                  >
                    Open repository
                    <ArrowRight size={15} />
                  </button>
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
                  <button className="publish-primary-button" onClick={() => onOpenChange(false)}>
                    Done
                    <Check size={15} />
                  </button>
                </>
              )}
            </footer>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={publish}
            className="publish-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15 }}
          >
            <div className="publish-folder-flow" aria-hidden="true">
              <div className="publish-flow-node">
                <Folder size={25} />
              </div>
              <div className="publish-flow-connection">
                <span />
                <GitCommitHorizontal size={16} />
                <span />
              </div>
              <div className="publish-flow-node publish-flow-cloud">
                {provider === 'github' ? <Github size={26} /> : <GitBranch size={26} />}
              </div>
            </div>
            <button
              type="button"
              className={`publish-drop-target ${path ? 'has-folder' : ''}`}
              onClick={pickFolder}
              disabled={!desktop}
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
            </button>
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
            {desktop ? (
              <div className="publish-auth-fields">
                <label className="publish-label">
                  <span className="publish-field-label">
                    <span>{provider === 'github' ? 'GitHub' : 'GitLab'} access token</span>
                    <AnimatedTooltip
                      content={
                        provider === 'github'
                          ? 'Use a token that can create repositories and push contents. Your token is sent only to the Rust backend and GitHub, and is cleared after publishing.'
                          : 'Use a GitLab token with api and write_repository access. Your token is used for this publish only and is never saved.'
                      }
                    >
                      <KeyRound size={12} />
                    </AnimatedTooltip>
                  </span>
                  <input
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    required
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={provider === 'github' ? 'github_pat_…' : 'glpat-…'}
                  />
                  <span className="publish-field-hint">
                    <LockKeyhole size={10} />
                    Used once. Never stored.
                  </span>
                </label>
                <div className="publish-author-row">
                  <label className="publish-label">
                    Commit author
                    <input
                      value={authorName}
                      onChange={(event) => setAuthorName(event.target.value)}
                      placeholder="Your name"
                      required
                      autoComplete="name"
                    />
                  </label>
                  <label className="publish-label">
                    Commit email
                    <input
                      type="email"
                      value={authorEmail}
                      onChange={(event) => setAuthorEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                    />
                  </label>
                </div>
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
            {error && (
              <div className="publish-error" role="alert">
                <CircleAlert size={16} />
                <span>{error}</span>
              </div>
            )}
            <footer className="publish-form-footer">
              <span className="publish-footer-note">
                <GitCommitHorizontal size={13} />
                One folder. First commit. First push.
              </span>
              {desktop ? (
                <motion.button
                  type="submit"
                  className="publish-primary-button"
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                >
                  Create & push
                  <Upload size={15} />
                </motion.button>
              ) : (
                <button type="button" className="publish-primary-button" onClick={runPreview}>
                  <Play size={14} />
                  Preview flow
                </button>
              )}
            </footer>
          </motion.form>
        )}
      </AnimatePresence>
    </KineticModal>
  );
}
