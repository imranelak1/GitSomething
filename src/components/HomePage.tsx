import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CloudUpload,
  CornerDownLeft,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Github,
  ListChecks,
  LoaderCircle,
  Plus,
  Terminal,
  X,
} from 'lucide-react';
import type { RecentRepository } from '@/lib/recent-repositories';
import type { GitHubRepository } from '@/lib/github-repositories';
import { GitHubRepositories } from './github/GitHubRepositories';
import { TextRoll } from './registry/skiper/TextRoll';
import { AnimatedButton } from './registry/vengeance/AnimatedButton';
import { LogoMark } from './brand/LogoMark';
import './home-page.css';

interface HomePageProps {
  recentRepositories: RecentRepository[];
  activeRepository?: { name: string; demo: boolean };
  accountName?: string;
  busy: boolean;
  onOpenRepository: () => void;
  onCreateRepository: () => void;
  onOpenRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onContinue: () => void;
  onTryDemo: () => void;
  onGuide: () => void;
  onConnectGitHub: () => void;
  onCloneRepository: (repository: GitHubRepository) => Promise<boolean>;
}

function lastOpenedLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'Recently';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
}

const workflow = [
  { name: 'Stage', description: 'Choose the changes to save.', icon: ListChecks },
  { name: 'Commit', description: 'Save a checkpoint on this computer.', icon: GitCommitHorizontal },
  { name: 'Push', description: 'Share your commits with GitHub.', icon: CloudUpload },
];

export function HomePage({
  recentRepositories,
  activeRepository,
  accountName,
  busy,
  onOpenRepository,
  onCreateRepository,
  onOpenRecent,
  onRemoveRecent,
  onContinue,
  onTryDemo,
  onGuide,
  onConnectGitHub,
  onCloneRepository,
}: HomePageProps) {
  const reducedMotion = useReducedMotion();

  return (
    <main className="home-page" aria-label="GitSomething home">
      <div className="home-page-inner">
        <div className="home-page-topline">
          <span className="home-location">
            <FolderGit2 size={17} aria-hidden="true" /> Home
          </span>
          {activeRepository && (
            <button
              className="home-continue"
              type="button"
              onClick={onContinue}
              disabled={busy}
              aria-label="Continue workspace"
              data-activity-label="Continue current workspace"
              data-activity-description="Return to the repository you already have open."
            >
              <span>Continue {activeRepository.demo ? 'demo' : activeRepository.name}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        <header className="home-intro home-intro-brand">
          <div>
            <h1>A good place to pick up.</h1>
            <p>Open a project, start one, or learn your way around.</p>
          </div>
          <LogoMark replayOnHover />
        </header>

        <div className="home-project-actions">
          <AnimatedButton
            className="add-repository home-open-repository"
            type="button"
            onClick={onOpenRepository}
            disabled={busy}
            data-activity-label="Open a repository from home"
            data-activity-description="Choose a local Git repository and open its working folder."
          >
            {busy ? (
              <LoaderCircle className="home-spinner" size={17} aria-hidden="true" />
            ) : (
              <FolderOpen size={17} aria-hidden="true" />
            )}
            <TextRoll inherit>Open repository</TextRoll>
          </AnimatedButton>
          <button
            className="home-new-project"
            type="button"
            onClick={onCreateRepository}
            disabled={busy}
            aria-label="Publish a local folder"
            data-activity-label="Create a repository from home"
            data-activity-description="Turn a local project folder into a repository and publish it to a remote host."
          >
            <Plus size={17} aria-hidden="true" /> New repository
          </button>
          <span className="home-drop-hint">
            <CornerDownLeft size={14} aria-hidden="true" /> Or drop a folder here.
          </span>
        </div>

        {accountName && (
          <GitHubRepositories onConnect={onConnectGitHub} onClone={onCloneRepository} busy={busy} />
        )}

        <div className="home-content-grid">
          <section className="home-recent-section" aria-labelledby="home-recent-title">
            <div className="home-section-heading">
              <h2 id="home-recent-title">Recent repositories</h2>
              {recentRepositories.length > 0 && <span>Last opened</span>}
            </div>
            {recentRepositories.length > 0 ? (
              <ul className="home-recent-list">
                {recentRepositories.map((repository) => (
                  <li className="home-recent-row" key={repository.path}>
                    <button
                      className="home-recent-open"
                      type="button"
                      disabled={busy}
                      onClick={() => onOpenRecent(repository.path)}
                      aria-label={`Open ${repository.name}`}
                      title={repository.path}
                      data-activity-label={`Open recent repository: ${repository.name}`}
                      data-activity-description="Reopen this local repository and refresh its current Git state."
                    >
                      <FolderGit2 className="home-recent-icon" size={21} aria-hidden="true" />
                      <span className="home-recent-details">
                        <strong>{repository.name}</strong>
                        <span className="home-recent-path">{repository.path}</span>
                        {repository.branch && (
                          <span className="home-recent-branch">
                            <GitBranch size={12} aria-hidden="true" /> {repository.branch}
                          </span>
                        )}
                      </span>
                      <span className="home-recent-time">
                        {lastOpenedLabel(repository.lastOpened)}
                      </span>
                      <ArrowRight className="home-recent-arrow" size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="home-recent-remove"
                      type="button"
                      disabled={busy}
                      onClick={() => onRemoveRecent(repository.path)}
                      aria-label={`Remove ${repository.name} from recent repositories`}
                      title="Remove from recents"
                      data-activity-label={`Remove recent repository: ${repository.name}`}
                      data-activity-description="Remove this shortcut from Home. The repository and its files stay on disk."
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="home-recent-empty">
                <div className="home-empty-folder" aria-hidden="true">
                  <FolderGit2 size={34} strokeWidth={1.35} />
                  <motion.span
                    className="home-empty-check"
                    initial={reducedMotion ? false : { scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 320,
                      damping: 22,
                      delay: reducedMotion ? 0 : 0.15,
                    }}
                  >
                    <Check size={13} />
                  </motion.span>
                </div>
                <h3>Your next project belongs here.</h3>
                <p>
                  Open a local repository to keep it a click away. Your files stay in their folder.
                </p>
              </div>
            )}

            <div className="home-demo-row">
              <Terminal size={20} aria-hidden="true" />
              <div>
                <h3>A safe place to get a feel for it.</h3>
                <p>Try staging, commits, and the Glass Box with sample files.</p>
              </div>
              <button
                className="home-demo-button"
                type="button"
                disabled={busy}
                onClick={onTryDemo}
                aria-label="Try demo workspace"
                data-activity-label="Try the demo workspace"
                data-activity-description="Open the clearly labeled demo to practice without changing local files."
              >
                Try demo <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </section>

          <aside className="home-learning" aria-labelledby="home-learning-title">
            <div className="home-learning-heading">
              <BookOpen size={19} aria-hidden="true" />
              <span>Learn with GitSomething</span>
            </div>
            <h2 id="home-learning-title">
              A little Git.
              <br />A lot more confidence.
            </h2>
            <p className="home-learning-intro">
              Three steps you’ll use every day. Start with the idea, then try it in the workspace.
            </p>
            <ol className="home-learning-steps">
              {workflow.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.name}>
                    <span className="home-learning-step-icon">
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{step.name}</h3>
                      <p>{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <AnimatedButton
              className="home-guide-button"
              type="button"
              onClick={onGuide}
              disabled={busy}
              aria-label="Open getting started guide"
              data-activity-label="Start the first-time user guide"
              data-activity-description="Walk through Git basics, optional GitHub sign-in, and a guided practice."
            >
              <TextRoll inherit>Show me around</TextRoll>
              <ArrowRight size={15} aria-hidden="true" />
            </AnimatedButton>
            <p className="home-learning-footnote">The Glass Box explains your actions as you go.</p>
          </aside>
        </div>

        {!accountName && (
          <GitHubRepositories onConnect={onConnectGitHub} onClone={onCloneRepository} busy={busy} />
        )}

        <footer className="home-footer">
          <div className="home-github-status">
            <Github size={17} aria-hidden="true" />
            <span>
              {accountName ? (
                <>
                  Connected as <strong>{accountName}</strong>
                </>
              ) : (
                'Connect GitHub when you’re ready to share.'
              )}
            </span>
            {accountName && <Check size={14} className="home-account-check" aria-hidden="true" />}
          </div>
          {!accountName && (
            <button
              className="home-connect-button"
              type="button"
              onClick={onConnectGitHub}
              disabled={busy}
              data-activity-label="Connect GitHub from home"
              data-activity-description="Open GitHub sign-in so you can create and sync remote repositories."
            >
              Connect GitHub <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
