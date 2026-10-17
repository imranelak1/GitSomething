import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  CloudUpload,
  FolderPen,
  GitCommitHorizontal,
  ListChecks,
  Terminal,
  X,
} from 'lucide-react';
import type { LessonId } from '@/lib/learning';
import './learning-flow.css';

const steps = [
  {
    id: 'diff',
    label: 'Working folder',
    shortLabel: 'Edit',
    icon: FolderPen,
    title: 'Your files are where the work begins.',
    explanation:
      'Edit files in your usual editor. Branchline shows what changed since your last commit so you can review each change before saving it.',
    why: 'Review the diff to catch accidental edits before they enter your history.',
    command: 'git status',
    commandLabel: 'See what changed',
    location: 'On this computer',
  },
  {
    id: 'stage',
    label: 'Stage',
    shortLabel: 'Stage',
    icon: ListChecks,
    title: 'Choose what belongs in your next checkpoint.',
    explanation:
      'Staging selects changes for your next commit. Tick a file to select it; untick it to keep working on it. Your files stay in place.',
    why: 'Select related changes together so each commit tells one clear story.',
    command: 'git diff --staged',
    commandLabel: 'Inspect the selection',
    location: 'On this computer',
  },
  {
    id: 'commit',
    label: 'Commit',
    shortLabel: 'Commit',
    icon: GitCommitHorizontal,
    title: 'Save a checkpoint you can return to.',
    explanation:
      'A commit saves your staged changes with a message in this repository’s history. It stays on this computer until you push it.',
    why: 'A useful message explains the change: “Fix sign-in after a session expires.”',
    command: 'git log --oneline',
    commandLabel: 'Explore saved checkpoints',
    location: 'On this computer',
  },
  {
    id: 'sync',
    label: 'Push',
    shortLabel: 'Push',
    icon: CloudUpload,
    title: 'Share your saved checkpoints.',
    explanation:
      'Push uploads local commits to your remote repository. Fetch checks for remote updates; Pull brings those updates into your current branch.',
    why: 'Review your commits before sharing. Files you have not committed remain local.',
    command: 'git status',
    commandLabel: 'Check before sharing',
    location: 'Local → remote',
  },
] satisfies {
  id: LessonId;
  label: string;
  shortLabel: string;
  icon: typeof BookOpen;
  title: string;
  explanation: string;
  why: string;
  command: string;
  commandLabel: string;
  location: string;
}[];

export function LearningFlow({
  stagedCount,
  changedCount,
  demo,
  onTryCommand,
  onLesson,
}: {
  stagedCount: number;
  changedCount: number;
  demo: boolean;
  onTryCommand: (command: string) => void;
  onLesson: (id: LessonId) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<LessonId>(
    stagedCount > 0 ? 'commit' : changedCount > 0 ? 'stage' : 'diff',
  );
  const reducedMotion = useReducedMotion();
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const lesson = steps.find((step) => step.id === selected) ?? steps[0];
  const context =
    stagedCount > 0
      ? `${stagedCount} ${stagedCount === 1 ? 'file' : 'files'} selected for your next commit`
      : changedCount > 0
        ? `${changedCount} changed ${changedCount === 1 ? 'file' : 'files'} to review`
        : 'Your working folder matches your last commit';

  return (
    <section
      className={`learning-flow${expanded ? ' learning-flow-expanded' : ''}`}
      aria-label="Learn the Git workflow"
    >
      <div className="learning-flow-bar">
        <button
          type="button"
          className="learning-flow-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={panelId}
          data-activity-label={expanded ? 'Close learning tip' : 'Open learning tip'}
          data-activity-description="Explore how editing, staging, committing, and pushing fit together."
        >
          <BookOpen size={15} aria-hidden="true" />
          <span>Learn by doing</span>
          <ChevronDown
            size={13}
            className={expanded ? 'learning-flow-chevron-open' : ''}
            aria-hidden="true"
          />
        </button>
        <div className="learning-flow-steps" aria-label="Git workflow steps">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const active = selected === step.id && expanded;
            return (
              <div className="learning-flow-step-wrap" key={step.id}>
                {index > 0 && (
                  <ArrowRight className="learning-flow-connector" size={12} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={`learning-flow-step${active ? ' learning-flow-step-active' : ''}`}
                  onClick={() => {
                    setSelected(step.id);
                    setExpanded(true);
                  }}
                  aria-expanded={active}
                  aria-controls={panelId}
                  aria-label={`Learn about ${step.label.toLowerCase()}`}
                  data-activity-label={`Explore lesson: ${step.label}`}
                  data-activity-description={step.explanation}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className="learning-flow-step-label">{step.label}</span>
                  <span className="learning-flow-step-short">{step.shortLabel}</span>
                  {step.id === 'stage' && stagedCount > 0 && (
                    <span
                      className="learning-flow-count"
                      aria-label={`${stagedCount} selected files`}
                    >
                      {stagedCount}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <span className="learning-flow-context">{demo ? 'Practice repository' : context}</span>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="learning-panel"
            id={panelId}
            className="learning-flow-panel-clip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="learning-flow-panel" role="region" aria-labelledby={titleId}>
              <div className="learning-flow-copy">
                <div className="learning-flow-title-row">
                  <h2 id={titleId}>{lesson.title}</h2>
                  <span className="learning-flow-location">{lesson.location}</span>
                </div>
                <p>{lesson.explanation}</p>
                <p className="learning-flow-why">{lesson.why}</p>
              </div>
              <div className="learning-flow-actions">
                <button
                  type="button"
                  className="learning-flow-command"
                  onClick={() => {
                    setExpanded(false);
                    onTryCommand(lesson.command);
                  }}
                  data-activity-label={`Prepare ${lesson.command}`}
                  data-activity-description="Put this read-only command in the Glass Box. Review it, then press Enter to run it."
                >
                  <Terminal size={14} aria-hidden="true" />
                  <span>
                    <span>{lesson.commandLabel}</span>
                    <code>{lesson.command}</code>
                  </span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="learning-flow-more"
                  onClick={() => {
                    setExpanded(false);
                    onLesson(lesson.id);
                  }}
                  data-activity-label={`Read the ${lesson.label.toLowerCase()} lesson`}
                  data-activity-description="Open the full explanation in the Glass Box learning panel."
                >
                  Read the lesson <ArrowRight size={12} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className="learning-flow-close"
                onClick={() => setExpanded(false)}
                aria-label="Close learning tip"
                data-activity-label="Close learning tip"
                data-activity-description="Return to the compact Git workflow guide."
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
