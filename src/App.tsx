import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Command,
  FileCode2,
  FileJson2,
  FileText,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  History,
  House,
  Keyboard,
  Layers2,
  LoaderCircle,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
  X,
} from 'lucide-react';
import { open as chooseDirectory } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';
import { useRepository } from './hooks/useRepository';
import { isDesktop, type ChangedFile } from './lib/types';
import { displayError } from './lib/console';
import { Button } from './components/ui/button';
import { GlassBox } from './components/GlassBox';
import { HistoryGraph, type HistoryPlan } from './components/HistoryGraph';
import { CommandPalette } from './components/CommandPalette';
import { DropzoneToGitHub } from './components/publish/DropzoneToGitHub';
import { AnimatedTooltip } from './components/registry/vengeance/AnimatedTooltip';
import { TextRoll } from './components/registry/skiper/TextRoll';
import { BranchJourney } from './components/BranchJourney';
import { FirstRunGuide } from './components/onboarding/FirstRunGuide';
import { GitHubConnectCard } from './components/auth/GitHubConnectCard';
import { useGitHubAuth } from './hooks/useGitHubAuth';
import { useActivity } from './hooks/useActivity';
import { executeGuidedCommand, type TerminalResult } from './lib/guided-commands';
import { getLesson, type LessonId } from './lib/learning';
import { demoDiff } from './lib/demo';
import type { FileDiff } from './lib/types';
import { LearningFlow } from './components/LearningFlow';
import { HomePage } from './components/HomePage';
import {
  forgetRepository,
  readRecentRepositories,
  rememberRepository,
  writeRecentRepositories,
} from './lib/recent-repositories';
import { rememberGuide } from './lib/onboarding';
import { Magnetic } from './components/registry/animmaster/Magnetic';

const DiffViewer = lazy(() => import('./components/DiffViewer'));

export default function App() {
  const auth = useGitHubAuth();
  const { activities, record, settle } = useActivity();
  const {
    repository,
    demo,
    logs,
    busy,
    notice,
    setNotice,
    open,
    stage,
    commit,
    sync,
    refresh,
    activateDemo,
  } = useRepository();
  const [screen, setScreen] = useState<'home' | 'workspace'>('home');
  const [workspaceVisited, setWorkspaceVisited] = useState(false);
  const [recentRepositories, setRecentRepositories] = useState(readRecentRepositories);
  const drafts = useRef<Record<string, string>>({});
  const [tab, setTab] = useState<'changes' | 'history'>('changes');
  const [selected, setSelected] = useState('src/components/Dropzone.tsx');
  const [selectedStaged, setSelectedStaged] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);
  const [suggestedCommand, setSuggestedCommand] = useState<{ id: number; text: string }>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [initialPath, setInitialPath] = useState('');
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');
  const [plan, setPlan] = useState<HistoryPlan | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [commitSaved, setCommitSaved] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const selector = screen === 'home' ? '.home-open-repository' : '.workspace-home-button';
      document.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [screen]);
  useEffect(() => {
    writeRecentRepositories(recentRepositories);
  }, [recentRepositories]);
  const enterWorkspace = () => {
    setWorkspaceVisited(true);
    setScreen('workspace');
  };
  const goHome = () => {
    setScreen('home');
    setPaletteOpen(false);
    setFocusMode(false);
  };
  const openPath = async (path: string) => {
    if (!isDesktop()) {
      setNotice(
        'Open the desktop app to access this local repository. Try the demo workspace in this browser.',
      );
      return;
    }
    const result = await open(path);
    if (!result) return;
    drafts.current[repository.path] = message;
    if (result.path !== repository.path) {
      setMessage(drafts.current[result.path] || '');
      setSelected(result.files[0]?.path || '');
      setSelectedStaged(result.files[0]?.staged || false);
      setFilter('');
      setTab('changes');
    }
    setRecentRepositories((previous) => rememberRepository(previous, result));
    enterWorkspace();
  };
  const tryDemo = () => {
    if (!demo) {
      drafts.current[repository.path] = message;
      if (!activateDemo()) return;
      setMessage(drafts.current['~/Projects/orbit'] || '');
      setSelected('src/components/Dropzone.tsx');
      setSelectedStaged(false);
      setTab('changes');
      setFilter('');
    }
    enterWorkspace();
  };
  useEffect(() => {
    if (!commitSaved) return;
    const timer = window.setTimeout(() => setCommitSaved(false), 2600);
    return () => window.clearTimeout(timer);
  }, [commitSaved]);
  const openGettingStarted = (step = 0) => {
    setOnboardingStep(step);
    setOnboardingOpen(true);
  };
  const changeGettingStarted = (value: boolean) => {
    if (!value) rememberGuide();
    setOnboardingOpen(value);
  };
  const changedFileCount = new Set(repository.files.map((file) => file.path)).size;
  const staged = repository.files.filter((file) => file.staged);
  const unstaged = repository.files.filter((file) => !file.staged);
  const selectedFile =
    repository.files.find((file) => file.path === selected && file.staged === selectedStaged) ||
    repository.files.find((file) => file.path === selected) ||
    repository.files[0];
  const totalAdded = repository.files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeleted = repository.files.reduce((sum, file) => sum + file.deletions, 0);
  const visibleFiles = useMemo(
    () => repository.files.filter((file) => file.path.toLowerCase().includes(filter.toLowerCase())),
    [repository.files, filter],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        record({
          kind: 'interface',
          label: 'Command palette shortcut',
          description: 'Find available actions without leaving your keyboard.',
        });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (screen === 'home') {
          if (workspaceVisited) {
            enterWorkspace();
            setConsoleOpen(true);
          } else setNotice('Open a repository or try the demo workspace to use the Glass Box.');
        } else setConsoleOpen((value) => !value);
        record({
          kind: 'interface',
          label: 'Glass box shortcut',
          description: 'Show or hide the terminal. Your action history stays in memory.',
        });
      }
      if ((event.metaKey || event.ctrlKey) && !document.querySelector('[role="dialog"]')) {
        if (screen === 'workspace' && event.shiftKey && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          setFocusMode((value) => !value);
          record({
            kind: 'interface',
            label: 'Focus mode shortcut',
            description: 'Give the current workspace more room. Your repository is unchanged.',
          });
          return;
        }
        if (event.key.toLowerCase() === 'o') {
          event.preventDefault();
          document.querySelector<HTMLButtonElement>('.add-repository')?.click();
        }
        if (screen === 'workspace' && event.key.toLowerCase() === 'f') {
          const filterInput = document.querySelector<HTMLInputElement>('.file-search input');
          if (filterInput) {
            event.preventDefault();
            filterInput.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [record, screen, workspaceVisited, setNotice]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 9000);
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);
  useEffect(() => {
    if (!isDesktop()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') setDragging(true);
        else if (event.payload.type === 'leave') setDragging(false);
        else if (event.payload.type === 'drop') {
          setDragging(false);
          const path = event.payload.paths[0];
          if (path) {
            record({
              kind: 'interface',
              label: 'Drop local folder',
              description:
                'Open the repository setup form for this folder. Review the publishing settings before creating a remote.',
            });
            setInitialPath(path);
            setPublishOpen(true);
          }
        }
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => setNotice(displayError(error)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setNotice, record]);

  const tryCommand = (text: string) => {
    if (!workspaceVisited) {
      setNotice('Open a repository or try the demo workspace to use the Glass Box.');
      return;
    }
    enterWorkspace();
    setConsoleOpen(true);
    setSuggestedCommand({ id: Date.now(), text });
  };
  const learn = (id: LessonId) => {
    if (!workspaceVisited) {
      openGettingStarted(2);
      return;
    }
    enterWorkspace();
    const lesson = getLesson(id);
    setConsoleOpen(true);
    record({
      kind: 'lesson',
      label: `Learn: ${lesson.title}`,
      description: lesson.explanation,
      lessonId: id,
    });
  };
  const runCommand = async (source: string): Promise<TerminalResult> => {
    const id = record({
      kind: 'command',
      label: 'Guided Git command',
      command: source,
      description: 'Requested through the guided command input. No shell is started.',
      status: 'running',
    });
    try {
      if (busy) {
        const result = {
          ok: false,
          output:
            'A repository operation is already running. Wait for it to finish, then try again.',
        };
        settle(id, { status: 'error', output: result.output });
        return result;
      }
      const snapshot = demo ? repository : await refresh();
      if (!snapshot)
        throw new Error('Could not refresh this repository. Reopen it before running a command.');
      const result = await executeGuidedCommand(source, {
        repository: snapshot,
        demo,
        stage,
        commit,
        sync,
        getDiff: (filePath, staged) =>
          demo
            ? Promise.resolve(demoDiff(filePath))
            : invoke<FileDiff>('get_diff', { path: snapshot.path, filePath, staged }),
      });
      settle(id, {
        status: result.ok ? 'success' : 'error',
        output: result.output,
        lessonId: result.lessonId,
      });
      return result;
    } catch (error) {
      const result = { ok: false, output: displayError(error) };
      settle(id, { status: 'error', output: result.output });
      return result;
    }
  };

  const openLocal = async () => {
    if (!isDesktop()) {
      setNotice(
        'Open the Tauri desktop app to connect a real folder. This is an interactive demo workspace.',
      );
      return;
    }
    try {
      const path = await chooseDirectory({
        directory: true,
        multiple: false,
        title: 'Open a Git repository',
      });
      if (typeof path === 'string') await openPath(path);
    } catch (error) {
      setNotice(displayError(error));
    }
  };
  const startPublish = () => {
    setInitialPath('');
    setPublishOpen(true);
  };
  const handleAction = (action: string) => {
    record({
      kind: 'interface',
      label: `Command palette: ${action}`,
      description:
        'Run the selected workspace action. Advanced history tools are previews until their engine milestone.',
    });
    if (action === 'open') void openLocal();
    else if (action === 'home') goHome();
    else if (action === 'resume') enterWorkspace();
    else if (action === 'publish') startPublish();
    else if (action === 'history') {
      if (workspaceVisited) {
        enterWorkspace();
        setTab('history');
      } else setNotice('Open a repository or try the demo workspace to explore history.');
    } else if (action === 'console') {
      if (workspaceVisited) {
        enterWorkspace();
        setConsoleOpen((value) => (screen === 'home' ? true : !value));
      } else setNotice('Open a repository or try the demo workspace to use the Glass Box.');
    } else if (action === 'guide') openGettingStarted();
    else if (action === 'github') openGettingStarted(1);
    else if (action === 'learn') learn('stage');
    else if (action === 'terminal') tryCommand('help');
    else {
      if (action === 'rebase') setTab('history');
      setNotice(
        (
          {
            worktrees:
              'Worktrees are planned for the next engine milestone. See docs/ARCHITECTURE.md for the implementation plan.',
            rebase:
              'Drag commits or branches to explore history previews. Applying rebases is a planned milestone.',
            merge:
              'Conflict detection is available. A 3-way merge editor is planned for the next milestone.',
          } as Record<string, string>
        )[action],
      );
    }
  };
  const submitCommit = async () => {
    if (await commit(message.trim())) {
      setMessage('');
      setCommitSaved(true);
    }
  };
  const rescue = async () => {
    try {
      await invoke('create_rescue_branch', {
        path: repository.path,
        name: `rescue/work-${Date.now().toString(36)}`,
      });
      await refresh();
      setNotice('Your work is safe on a new rescue branch.');
    } catch (error) {
      setNotice(displayError(error));
    }
  };
  return (
    <div
      className={`app ${screen === 'home' ? 'app-home' : ''} ${screen === 'workspace' && focusMode ? 'focus-mode' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDesktop()) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!isDesktop()) {
          startPublish();
          setNotice(
            'Browser previews cannot read local folder paths. Use the desktop app to drop a real project.',
          );
        }
      }}
    >
      <header className="titlebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
          aria-label="Go to home"
        >
          <img src="/branchline.svg" alt="" />
          <span>
            branchline<span className="brand-period">.</span>
          </span>
        </a>
        <div className="titlebar-center">
          <FolderGit2 size={13} />
          <span>{screen === 'home' ? 'Home' : repository.name}</span>
          <span className="titlebar-slash">/</span>
          <span>{screen === 'home' ? 'Your repositories, one place' : 'Your workspace'}</span>
        </div>
        <div className="titlebar-controls">
          <button
            className={`github-account-button ${auth.connected ? 'connected' : ''}`}
            aria-label="GitHub account"
            onClick={() => openGettingStarted(1)}
          >
            <Github size={14} />
            <span>{auth.connected ? `@${auth.account?.login}` : 'Sign in with GitHub'}</span>
            {auth.connected && <Check size={12} />}
          </button>
          <button className="titlebar-shortcut" onClick={() => setPaletteOpen(true)}>
            <Command size={12} />
            <span>Command menu</span>
            <kbd>⌘ K</kbd>
          </button>
        </div>
      </header>
      {screen === 'home' && (
        <HomePage
          recentRepositories={recentRepositories}
          activeRepository={workspaceVisited ? { name: repository.name, demo } : undefined}
          accountName={auth.account?.login}
          busy={busy}
          onOpenRepository={() => void openLocal()}
          onCreateRepository={startPublish}
          onOpenRecent={(path) => void openPath(path)}
          onRemoveRecent={(path) =>
            setRecentRepositories((previous) => forgetRepository(previous, path))
          }
          onContinue={enterWorkspace}
          onTryDemo={tryDemo}
          onGuide={() => openGettingStarted()}
          onConnectGitHub={() => openGettingStarted(1)}
        />
      )}
      {workspaceVisited && (
        <div className="app-body" hidden={screen !== 'workspace'} inert={screen !== 'workspace'}>
          <nav className="activity-rail" aria-label="Quick navigation" inert={focusMode}>
            <div className="rail-primary">
              <AnimatedTooltip side="right" content="Home and recent repositories">
                <button className="rail-button" aria-label="Home" onClick={goHome}>
                  <House size={19} />
                </button>
              </AnimatedTooltip>
              <AnimatedTooltip side="right" content="Working directory">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className={tab === 'changes' ? 'rail-button selected' : 'rail-button'}
                  aria-label="Show working directory"
                  onClick={() => setTab('changes')}
                >
                  <Layers2 size={20} />
                  {tab === 'changes' && (
                    <motion.span layoutId="rail-selection" className="rail-selection" />
                  )}
                </motion.button>
              </AnimatedTooltip>
              <AnimatedTooltip side="right" content="Explore your commit graph">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className={tab === 'history' ? 'rail-button selected' : 'rail-button'}
                  aria-label="Show commit graph"
                  onClick={() => setTab('history')}
                >
                  <GitBranch size={20} />
                  {tab === 'history' && (
                    <motion.span layoutId="rail-selection" className="rail-selection" />
                  )}
                </motion.button>
              </AnimatedTooltip>
              <AnimatedTooltip side="right" content="Create & publish a repository">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className="rail-button"
                  aria-label="Create a new repository"
                  onClick={startPublish}
                >
                  <Plus size={21} />
                </motion.button>
              </AnimatedTooltip>
            </div>
            <div className="rail-bottom">
              <AnimatedTooltip side="right" content="Every action, explained">
                <button
                  className="rail-button"
                  aria-label="Toggle command console"
                  onClick={() => setConsoleOpen((value) => !value)}
                >
                  <Terminal size={19} />
                </button>
              </AnimatedTooltip>
              <button
                className="rail-button"
                aria-label="Open keyboard commands"
                onClick={() => setPaletteOpen(true)}
              >
                <Command size={18} />
              </button>
              <button
                className="rail-button"
                aria-label="App help and credits"
                onClick={() => setGuideOpen(true)}
              >
                <Settings2 size={18} />
              </button>
            </div>
          </nav>
          <aside className="sidebar" inert={focusMode}>
            <div className="workspace-switch">
              <div className="workspace-avatar">
                {auth.account?.login.slice(0, 1).toUpperCase() || (demo ? 'A' : 'Y')}
              </div>
              <div>
                <strong>
                  {auth.account
                    ? `${auth.account.login}’s workspace`
                    : demo
                      ? 'Alex’s workspace'
                      : 'Your workspace'}
                </strong>
                <span>Personal workspace</span>
              </div>
              <button
                className="icon-button"
                aria-label="Workspace information"
                onClick={() => setGuideOpen(true)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button className="sidebar-search" onClick={() => setPaletteOpen(true)}>
              <Search size={15} />
              <span>Jump to anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="sidebar-section-title">
              <span>Repositories</span>
              <button className="icon-button" aria-label="Add repository" onClick={startPublish}>
                <Plus size={14} />
              </button>
            </div>
            <button className="repository-item" onClick={() => setTab('changes')}>
              <FolderGit2 size={17} />
              <span>{repository.name}</span>
              <ChevronDown size={13} />
            </button>
            <nav className="repository-nav" aria-label="Repository views">
              <button
                className={tab === 'changes' ? 'selected' : ''}
                onClick={() => setTab('changes')}
              >
                <Layers2 size={15} />
                <span>Working directory</span>
                <span className="nav-count">{changedFileCount}</span>
              </button>
              <button
                className={tab === 'history' ? 'selected' : ''}
                onClick={() => setTab('history')}
              >
                <History size={15} />
                <span>History</span>
              </button>
            </nav>
            <button className="add-repository" onClick={() => void openLocal()}>
              <Plus size={15} />
              Open repository<span>⌘ O</span>
            </button>
            <div className="sidebar-divider" />
            <button
              className="sidebar-section-title branch-toggle"
              aria-expanded={branchesOpen}
              onClick={() => setBranchesOpen(!branchesOpen)}
            >
              <span>Local branches</span>
              <ChevronDown size={13} className={!branchesOpen ? 'rotated' : ''} />
            </button>
            {branchesOpen && (
              <div className="branch-list">
                {repository.branches.map((branch) => (
                  <button
                    key={branch.name}
                    className={branch.current ? 'current' : ''}
                    onClick={() => {
                      setTab('history');
                      setNotice(
                        `Viewing history. ${branch.current ? 'You are currently on this branch.' : 'Branch checkout is planned for the next milestone.'}`,
                      );
                    }}
                  >
                    <GitBranch size={14} />
                    <span>{branch.name}</span>
                    {branch.current && <CircleDot size={12} />}
                  </button>
                ))}
              </div>
            )}
            <button
              className="sidebar-section-title remote-label"
              onClick={() => void sync('fetch')}
              disabled={busy}
            >
              <span>Remotes</span>
              <RefreshCw size={12} />
            </button>
            <div className="remote-item">
              <Github size={14} />
              <span>origin</span>
              <span className="remote-subtitle">{demo ? 'github.com' : 'remote'}</span>
            </div>
            <div className="sidebar-spacer" />
            <motion.button
              className="publish-prompt"
              onClick={startPublish}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
            >
              <Magnetic strength={5} style={{ width: '100%' }}>
                <span className="publish-prompt-icon">
                  <FolderOpen size={20} strokeWidth={1.5} />
                  <ArrowUpRight size={12} />
                </span>
              </Magnetic>
              <strong>Start something.</strong>
              <span>Local ideas. Global possibilities.</span>
              <span className="publish-prompt-action">
                Create & publish <ArrowRight size={13} />
              </span>
            </motion.button>
            <div className="sidebar-bottom">
              <button onClick={() => openGettingStarted(1)}>
                <span className="profile-avatar">
                  {auth.account?.login.slice(0, 2).toUpperCase() || <Github size={14} />}
                </span>
                <span>{auth.account?.login || 'Connect GitHub'}</span>
                {auth.connected ? <Check size={14} /> : <ArrowUpRight size={14} />}
              </button>
              <button className="sidebar-help" onClick={() => setGuideOpen(true)}>
                <Keyboard size={14} />
                <span>A little help</span>
                <span>?</span>
              </button>
            </div>
          </aside>
          <main className="main">
            <div className="repository-toolbar">
              <div className="breadcrumb">
                <button
                  className="workspace-home-button"
                  aria-label="Back to home"
                  title="Home"
                  onClick={goHome}
                >
                  <House size={14} />
                </button>
                <span>{repository.name}</span>
                <ChevronRight size={13} />
                <strong>{tab === 'changes' ? 'Working directory' : 'History'}</strong>
              </div>
              <div className="toolbar-actions">
                <AnimatedTooltip content="Focus mode · Ctrl / Cmd + Shift + F">
                  <button
                    className="icon-button focus-toggle"
                    aria-label="Focus mode"
                    aria-pressed={focusMode}
                    onClick={() => setFocusMode((value) => !value)}
                  >
                    {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </AnimatedTooltip>
                <AnimatedTooltip content="Download the newest remote references without changing your files.">
                  <button
                    className="toolbar-fetch"
                    onClick={() => void sync('fetch')}
                    disabled={busy}
                  >
                    <RefreshCw size={13} className={busy ? 'spin' : ''} />
                    <span>Fetch</span>
                  </button>
                </AnimatedTooltip>
                <div className="toolbar-divider" />
                <Button size="sm" variant="ghost" onClick={() => void sync('pull')} disabled={busy}>
                  <ArrowDown size={14} />
                  Pull
                </Button>
                <AnimatedTooltip content="Push uploads saved commits to the remote repository. Your uncommitted edits stay on this computer.">
                  <Button
                    className="toolbar-push"
                    size="sm"
                    variant="outline"
                    onClick={() => void sync('push')}
                    disabled={busy}
                  >
                    <ArrowUp size={14} />
                    Push
                  </Button>
                </AnimatedTooltip>
              </div>
            </div>
            <div className="workspace-masthead">
              <div className="page-heading">
                <div>
                  <motion.h1
                    key={tab}
                    initial={{ opacity: 0.3, y: 8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span>{tab === 'changes' ? 'Make a little' : 'See how it'}</span>
                    <TextRoll>{tab === 'changes' ? 'history.' : 'came together.'}</TextRoll>
                  </motion.h1>
                  <p>
                    {tab === 'changes'
                      ? changedFileCount
                        ? `${changedFileCount} changed files. Pick files, then save a commit.`
                        : 'Your working folder matches your last saved commit.'
                      : 'Each commit is a saved checkpoint. Select one to inspect it.'}
                  </p>
                </div>
                <button
                  className="branch-selector"
                  onClick={() => {
                    setTab('history');
                    setNotice(`Current branch: ${repository.branch}`);
                  }}
                >
                  <GitBranch size={14} />
                  <span>{repository.branch}</span>
                  <ChevronDown size={12} />
                </button>
              </div>
              <BranchJourney repository={repository} onViewHistory={() => setTab('history')} />
            </div>
            {demo && (
              <div className="demo-ribbon">
                <span>
                  <Circle size={6} fill="currentColor" />
                  Interactive demo
                  <span className="demo-ribbon-detail">
                    Explore freely. Your local files are untouched.
                  </span>
                </span>
                <button onClick={() => void openLocal()}>
                  Connect a repository
                  <ArrowUpRight size={12} />
                </button>
              </div>
            )}
            {repository.guardian && (
              <div className="guardian-banner" role="status">
                <ShieldCheck size={17} />
                <div>
                  <strong>Git Guardian is here.</strong>
                  <span>{repository.guardian.message}</span>
                </div>
                {repository.guardian.kind.toLowerCase().includes('detached') ? (
                  <Button size="sm" variant="outline" onClick={() => void rescue()}>
                    Save on a new branch
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setNotice(
                        'Resolve conflicted paths and finish the merge or rebase in your existing Git tool. Branchline will refresh automatically.',
                      )
                    }
                  >
                    Show recovery steps
                  </Button>
                )}
              </div>
            )}
            <div className="view-tabs" role="tablist" aria-label="Repository content">
              <button
                role="tab"
                aria-selected={tab === 'changes'}
                className={tab === 'changes' ? 'active' : ''}
                onClick={() => setTab('changes')}
              >
                <Layers2 size={14} />
                <span className="tab-label">Changes</span>
                <span>{changedFileCount}</span>
                {tab === 'changes' && (
                  <motion.div layoutId="workspace-tab-indicator" className="tab-indicator" />
                )}
              </button>
              <button
                role="tab"
                aria-selected={tab === 'history'}
                className={tab === 'history' ? 'active' : ''}
                onClick={() => setTab('history')}
              >
                <GitCommitHorizontal size={15} />
                History
                {tab === 'history' && (
                  <motion.div layoutId="workspace-tab-indicator" className="tab-indicator" />
                )}
              </button>
              <div className="tabs-spacer" />
              {tab === 'changes' && (
                <span className="change-summary">
                  <b>+{totalAdded}</b>
                  <i>−{totalDeleted}</i>
                  <span>across {changedFileCount} files</span>
                </span>
              )}
              <button
                className="view-options icon-button"
                aria-label="More actions"
                onClick={() => setPaletteOpen(true)}
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
            {tab === 'changes' && (
              <LearningFlow
                stagedCount={staged.length}
                changedCount={changedFileCount}
                demo={demo}
                onTryCommand={tryCommand}
                onLesson={learn}
              />
            )}
            <div className="workspace-content">
              {tab === 'changes' ? (
                <div className="changes-view">
                  <section className="changes-panel" aria-label="Changed files">
                    <div className="file-search">
                      <Search size={14} />
                      <input
                        aria-label="Filter changed files"
                        placeholder="Filter files…"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <span>⌘ F</span>
                    </div>
                    <div className="file-list">
                      <div className="file-group-heading">
                        <ChevronDown size={12} />
                        <strong>Changes</strong>
                        <span>{unstaged.length}</span>
                        <AnimatedTooltip content="Click a file’s checkbox to include it in your next commit.">
                          <CheckCheck size={13} />
                        </AnimatedTooltip>
                      </div>
                      {visibleFiles
                        .filter((file) => !file.staged)
                        .map((file) => (
                          <FileRow
                            key={`${file.path}-unstaged`}
                            file={file}
                            active={selectedFile === file}
                            onSelect={() => {
                              setSelected(file.path);
                              setSelectedStaged(file.staged);
                            }}
                            onToggle={() => void stage(file.path, file.staged)}
                            busy={busy}
                          />
                        ))}
                      <div className="file-group-heading staged-heading">
                        <ChevronDown size={12} />
                        <strong>Staged changes</strong>
                        <span>{staged.length}</span>
                        <ShieldCheck size={13} />
                      </div>
                      {visibleFiles
                        .filter((file) => file.staged)
                        .map((file) => (
                          <FileRow
                            key={`${file.path}-staged`}
                            file={file}
                            active={selectedFile === file}
                            onSelect={() => {
                              setSelected(file.path);
                              setSelectedStaged(file.staged);
                            }}
                            onToggle={() => void stage(file.path, file.staged)}
                            busy={busy}
                          />
                        ))}
                      {!visibleFiles.length && (
                        <div className="files-empty">
                          {filter ? 'No files match your search.' : 'All caught up. Nice work.'}
                        </div>
                      )}
                    </div>
                  </section>
                  <Suspense
                    fallback={
                      <div className="editor-loading">
                        <LoaderCircle className="spin" size={18} />
                        Opening Monaco…
                      </div>
                    }
                  >
                    <DiffViewer
                      path={repository.path}
                      file={selectedFile}
                      demo={demo}
                      busy={busy}
                      onStage={() => {
                        if (selectedFile) void stage(selectedFile.path, selectedFile.staged);
                      }}
                    />
                  </Suspense>
                  <div className="commit-composer">
                    <div className="commit-composer-top">
                      <motion.span
                        key={commitSaved ? 'saved' : 'ready'}
                        className={`profile-avatar small commit-avatar ${commitSaved ? 'is-saved' : ''}`}
                        initial={
                          commitSaved && !reducedMotion ? { scale: 0.5, rotate: -25 } : false
                        }
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 330, damping: 16 }}
                        aria-hidden="true"
                      >
                        {commitSaved ? <Check size={17} /> : <GitCommitHorizontal size={18} />}
                      </motion.span>
                      <span>
                        <Zap size={13} />
                        {commitSaved ? 'A little history, saved.' : 'Make it a milestone.'}
                      </span>
                      <AnimatedTooltip content="Only staged changes are saved in a commit. Your other edits stay in your working folder.">
                        <ShieldCheck size={15} />
                      </AnimatedTooltip>
                    </div>
                    <label htmlFor="commit-message" className="sr-only">
                      Commit message
                    </label>
                    <textarea
                      id="commit-message"
                      placeholder="What did you change?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          record({
                            kind: 'interface',
                            label: 'Commit keyboard shortcut',
                            description:
                              'Request a local checkpoint of staged changes. The Git operation reports whether it succeeded.',
                            lessonId: 'commit',
                          });
                          void submitCommit();
                        }
                      }}
                      maxLength={5000}
                    />
                    <div className="commit-composer-detail">
                      <span>
                        {staged.length} {staged.length === 1 ? 'file' : 'files'} staged
                      </span>
                      <span>⌘ ↵</span>
                    </div>
                    <Button
                      className="commit-button"
                      onClick={() => void submitCommit()}
                      disabled={busy || !message.trim() || !staged.length}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={15} />
                      ) : (
                        <GitCommitHorizontal size={16} />
                      )}
                      Commit changes
                      <ArrowRight size={15} />
                    </Button>
                    <p>Commit saves locally. Push shares.</p>
                  </div>
                </div>
              ) : (
                <HistoryGraph
                  repository={repository}
                  onPlan={(next) => {
                    record({
                      kind: 'interface',
                      label: `Preview ${next.kind}`,
                      description:
                        'Explore the consequences of a history edit. This preview leaves all commits unchanged.',
                      lessonId: 'safety',
                    });
                    setPlan(next);
                  }}
                />
              )}
            </div>
            <GlassBox
              logs={logs}
              open={consoleOpen}
              onToggle={() => setConsoleOpen((value) => !value)}
              demo={demo}
              repositoryName={repository.name}
              busy={busy}
              activities={activities}
              onRunCommand={runCommand}
              suggestedCommand={suggestedCommand}
              stageExamplePath={unstaged[0]?.path}
            />
            <footer className="statusbar">
              <div>
                <GitBranch size={12} />
                <span>{repository.branch}</span>
                <span className="status-divider">/</span>
                {busy ? (
                  <>
                    <LoaderCircle size={11} className="spin" />
                    <span>Working…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={12} />
                    <span>{repository.guardian ? 'Needs attention' : 'Your work is safe'}</span>
                  </>
                )}
              </div>
              <div>
                <span>{demo ? 'Demo workspace' : 'Local repository'}</span>
                <span className="status-divider">/</span>
                <button onClick={() => setConsoleOpen((value) => !value)}>
                  <Terminal size={12} />
                  <span>Glass box</span>
                </button>
                <span className="status-divider">/</span>
                <span>libgit2</span>
              </div>
            </footer>
          </main>
        </div>
      )}
      <AnimatePresence>
        {notice && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            <CircleDot size={16} />
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setNotice('')}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dragging && (
          <motion.div
            className="global-drop-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div>
              <FolderOpen size={52} strokeWidth={1} />
              <h2>A new home for your project.</h2>
              <p>Drop your folder to create and publish a repository.</p>
              <span>
                <Github size={17} />
                GitHub & GitLab supported
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <DropzoneToGitHub
        open={publishOpen}
        onOpenChange={setPublishOpen}
        initialPath={initialPath}
        onPublished={(result) => {
          setPublishOpen(false);
          void openPath(result.path);
          setNotice(`Published successfully: ${result.url}`);
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAction={handleAction}
        hasWorkspace={workspaceVisited}
      />
      <FirstRunGuide
        open={onboardingOpen}
        onOpenChange={changeGettingStarted}
        initialStep={onboardingStep}
        onOpenRepository={() => void openLocal()}
        onPublish={startPublish}
        onExploreWorkspace={workspaceVisited ? enterWorkspace : tryDemo}
      />
      <Dialog.Root
        open={!!plan}
        onOpenChange={(value) => {
          if (!value) setPlan(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="plan-dialog">
            <Dialog.Close className="dialog-close icon-button" aria-label="Close preview">
              <X size={17} />
            </Dialog.Close>
            <div className="plan-symbol">
              <GitBranch size={28} strokeWidth={1.5} />
            </div>
            <Dialog.Title>
              {plan?.kind === 'rebase'
                ? 'Move a branch. See the impact.'
                : 'A cleaner story, with a preview.'}
            </Dialog.Title>
            <Dialog.Description>
              This is a history preview. No commits will be changed.
            </Dialog.Description>
            <div className="plan-flow">
              <div>
                <span>{plan?.kind === 'rebase' ? 'Move branch' : 'Combine commit'}</span>
                <strong>{plan?.source}</strong>
              </div>
              <ArrowDown size={18} />
              <div>
                <span>{plan?.kind === 'rebase' ? 'Onto branch' : 'Into commit'}</span>
                <strong>{plan?.target}</strong>
              </div>
            </div>
            <div className="plan-warning">
              <ShieldCheck size={17} />
              <p>
                The full engine will check shared history, working changes, and a recovery reference
                before allowing this action.
              </p>
            </div>
            <Button disabled className="full-width">
              History editing · planned milestone
            </Button>
            <Dialog.Close className="button button-ghost full-width">Keep exploring</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={guideOpen} onOpenChange={setGuideOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="plan-dialog help-dialog">
            <Dialog.Close className="dialog-close icon-button" aria-label="Close help">
              <X size={17} />
            </Dialog.Close>
            <Sparkles size={27} className="mint" />
            <Dialog.Title>A calmer way to Git.</Dialog.Title>
            <Dialog.Description>
              Branchline keeps your next step clear, and the details within reach.
            </Dialog.Description>
            <Button
              className="full-width"
              onClick={() => {
                setGuideOpen(false);
                openGettingStarted();
              }}
            >
              <Sparkles size={15} />
              Getting started guide
              <ArrowRight size={14} />
            </Button>
            <div className="help-github">
              <GitHubConnectCard compact />
            </div>
            <div className="guide-list">
              <p>
                <Check size={15} />
                <span>Stage files, write a message, then commit locally.</span>
              </p>
              <p>
                <ArrowUp size={15} />
                <span>Push when you want to share your commits.</span>
              </p>
              <p>
                <Terminal size={15} />
                <span>Hover console tokens to learn the equivalent Git command.</span>
              </p>
              <p>
                <Command size={15} />
                <span>Press Ctrl / Cmd + K for all available actions.</span>
              </p>
              <p>
                <ArrowDownToLine size={15} />
                <span>Drop a folder into the desktop app to publish it.</span>
              </p>
            </div>
            <p className="component-credits">
              Motion components by{' '}
              <a href="https://skiper-ui.com" target="_blank" rel="noreferrer">
                Skiper UI
              </a>{' '}
              and{' '}
              <a href="https://vengeanceui.com" target="_blank" rel="noreferrer">
                Vengeance UI
              </a>
              . Motion runs on{' '}
              <a href="https://motion.dev" target="_blank" rel="noreferrer">
                Motion for React
              </a>
              , with original illustrations and interactions inspired by{' '}
              <a href="https://animmasterlib.dev" target="_blank" rel="noreferrer">
                AnimMaster
              </a>
              .
            </p>
            <Button
              className="full-width"
              onClick={() => {
                setGuideOpen(false);
                startPublish();
              }}
            >
              <Plus size={15} />
              Create something new
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function FileRow({
  file,
  active,
  onSelect,
  onToggle,
  busy,
}: {
  file: ChangedFile;
  active: boolean;
  onSelect: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  const segments = file.path.split('/');
  const name = segments.pop();
  const Icon = name?.endsWith('.json') ? FileJson2 : name?.endsWith('.md') ? FileText : FileCode2;
  return (
    <motion.div
      className={`file-row ${active ? 'selected' : ''}`}
      layout="position"
      initial={{ opacity: 0, x: -7 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
    >
      {active && (
        <motion.span
          className="file-selection-surface"
          layoutId="file-selection"
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        />
      )}
      <motion.button
        whileTap={{ scale: 0.75 }}
        className={`stage-checkbox ${file.staged ? 'checked' : ''}`}
        aria-label={`${file.staged ? 'Unstage' : 'Stage'} ${file.path}`}
        aria-pressed={file.staged}
        disabled={busy}
        onClick={onToggle}
      >
        {file.staged && <Check size={10} strokeWidth={3} />}
      </motion.button>
      <button
        className="file-select"
        onClick={onSelect}
        title={file.path}
        data-activity-label={`Inspect ${file.path}`}
        data-activity-description={
          file.staged
            ? 'Compare the staged version with the last commit. These are the changes your next commit will save.'
            : 'Compare working changes with the staging area before selecting them for a commit.'
        }
        data-lesson-id="diff"
      >
        <Icon size={15} className={name?.endsWith('.tsx') ? 'file-react' : ''} />
        <span>
          <strong>{name}</strong>
          <small>{segments.join('/') || './'}</small>
        </span>
        <span
          className={`file-status ${file.status.toLowerCase().includes('new') || file.status === 'added' || file.status === '?' ? 'new' : ''}`}
        >
          {file.status.toLowerCase().includes('new') ||
          file.status === 'added' ||
          file.status === '?'
            ? 'U'
            : file.status.toLowerCase().includes('delet')
              ? 'D'
              : 'M'}
        </span>
      </button>
    </motion.div>
  );
}
