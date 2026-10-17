import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCode2,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Github,
  Monitor,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { TextRoll } from '../registry/skiper/TextRoll';
import { GitHubConnectCard } from '../auth/GitHubConnectCard';
import { BranchBloom } from '../registry/animmaster/BranchBloom';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import './onboarding.css';

const stages = ['Welcome', 'Connect', 'Try it', 'Your project'];
const titles = [
  'A good place to start.',
  'Your GitHub. One connection.',
  'Three moves. You’ve got this.',
  'Make it your own.',
];
const descriptions = [
  'A little guidance for your first commit. No terminal experience needed.',
  'Sign in once to create repositories and share your code. You can also work locally.',
  'Try a practice round. No real files or repositories will change.',
  'Open something you’re working on, or give a local folder a home on GitHub.',
];

export function FirstRunGuide({
  open,
  onOpenChange,
  initialStep = 0,
  onOpenRepository,
  onPublish,
  onExploreWorkspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep?: number;
  onOpenRepository: () => void;
  onPublish: () => void;
  onExploreWorkspace?: () => void;
}) {
  const [step, setStep] = useState(initialStep);
  const launcher = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(true);
  const { connected, account, desktop } = useGitHubAuth();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (open) setStep(Math.max(0, Math.min(3, initialStep)));
  }, [open, initialStep]);
  const choose = (action: () => void) => {
    restoreFocus.current = false;
    onOpenChange(false);
    action();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="onboarding-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              aria-describedby="onboarding-description"
              onOpenAutoFocus={() => {
                launcher.current =
                  document.activeElement instanceof HTMLElement ? document.activeElement : null;
                restoreFocus.current = true;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (!restoreFocus.current) return;
                const target =
                  launcher.current?.isConnected && launcher.current !== document.body
                    ? launcher.current
                    : document.querySelector<HTMLButtonElement>('[aria-label="GitHub account"]');
                target?.focus({ preventScroll: true });
              }}
            >
              <motion.section
                className="onboarding-dialog"
                initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduced ? 1 : 0.99 }}
                transition={{ duration: reduced ? 0 : 0.25 }}
              >
                <aside className="onboarding-illustration" aria-hidden="true">
                  <div className="onboarding-illustration-caption">
                    <span>Make a little progress.</span>
                    <strong>
                      {
                        [
                          'Grow something good.',
                          'Good work travels.',
                          'A little practice. A big start.',
                          'Your next branch starts here.',
                        ][step]
                      }
                    </strong>
                  </div>
                  <BranchBloom
                    phase={step === 0 ? 'edit' : step === 2 ? 'commit' : 'share'}
                    className="onboarding-bloom"
                  />
                  <div className="onboarding-illustration-bottom">
                    <GitCommitHorizontal size={16} />
                    <span>One checkpoint at a time.</span>
                  </div>
                </aside>
                <div className="onboarding-main">
                  <header className="onboarding-header">
                    <div className="onboarding-brand">
                      <img src="/branchline.svg" alt="" />
                      <span>Welcome to branchline.</span>
                    </div>
                    <Dialog.Close className="icon-button" aria-label="Close getting started guide">
                      <X size={18} />
                    </Dialog.Close>
                  </header>
                  <nav className="onboarding-progress" aria-label="Getting started steps">
                    {stages.map((stage, index) => (
                      <button
                        key={stage}
                        aria-current={index === step ? 'step' : undefined}
                        aria-label={`Step ${index + 1}: ${stage}`}
                        onClick={() => setStep(index)}
                        className={`${index === step ? 'active' : ''} ${index < step ? 'visited' : ''}`}
                      >
                        <span>{index < step ? <Check size={12} /> : index + 1}</span>
                        {stage}
                      </button>
                    ))}
                  </nav>
                  <div className="onboarding-title">
                    <Dialog.Title>
                      <TextRoll wrap>{titles[step]}</TextRoll>
                    </Dialog.Title>
                    <Dialog.Description id="onboarding-description">
                      {descriptions[step]}
                    </Dialog.Description>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={step}
                      className="onboarding-content"
                      initial={{ opacity: 0, x: reduced ? 0 : 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.18 }}
                    >
                      {step === 0 && (
                        <>
                          <div className="onboarding-path" aria-hidden="true">
                            <div>
                              <FolderOpen size={28} />
                              <span>Your project</span>
                            </div>
                            <span className="onboarding-wire" />
                            <div>
                              <GitCommitHorizontal size={30} />
                              <span>A saved checkpoint</span>
                            </div>
                            <span className="onboarding-wire" />
                            <div>
                              <Github size={30} />
                              <span>Shared when ready</span>
                            </div>
                          </div>
                          <div className="onboarding-promise">
                            <ShieldCheck size={20} />
                            <div>
                              <strong>Your next step will always be clear.</strong>
                              <p>
                                Choose your files, save a checkpoint, then share it. Branchline
                                shows you what happens along the way.
                              </p>
                            </div>
                          </div>
                          <div className="onboarding-local">
                            <Monitor size={15} />
                            <span>
                              {desktop
                                ? 'Your files stay on your computer until you choose to push.'
                                : 'You’re in the browser preview. Real folders and sign-in are available in the desktop app.'}
                            </span>
                          </div>
                        </>
                      )}
                      {step === 1 && (
                        <>
                          <GitHubConnectCard />
                          <p className="onboarding-optional">
                            <ShieldCheck size={14} />
                            GitHub is optional for local work. Connect later from your account menu.
                          </p>
                        </>
                      )}
                      {step === 2 && <PracticeCommit />}
                      {step === 3 && (
                        <div className="onboarding-start">
                          <div className={`onboarding-connection ${connected ? 'connected' : ''}`}>
                            <Github size={18} />
                            <span>
                              {connected
                                ? `Connected as @${account?.login}`
                                : 'Working locally for now'}
                            </span>
                            {connected && <Check size={15} />}
                          </div>
                          <button
                            className="onboarding-project-option"
                            onClick={() => choose(onOpenRepository)}
                          >
                            <span className="onboarding-option-icon">
                              <FolderOpen size={24} />
                            </span>
                            <span>
                              <strong>Open an existing repository</strong>
                              <span>Your history and changes, ready to review.</span>
                            </span>
                            <ArrowRight size={17} />
                          </button>
                          <button
                            className="onboarding-project-option publish-option"
                            onClick={() => choose(onPublish)}
                          >
                            <span className="onboarding-option-icon">
                              <Upload size={24} />
                            </span>
                            <span>
                              <strong>Publish a local folder</strong>
                              <span>We’ll create its history and first push for you.</span>
                            </span>
                            <ArrowRight size={17} />
                          </button>
                          <p className="onboarding-return">
                            <Sparkles size={14} />
                            You can replay this guide any time from A little help.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <footer className="onboarding-footer">
                    <button
                      className="button button-ghost"
                      onClick={() => (step ? setStep(step - 1) : onOpenChange(false))}
                    >
                      {step ? (
                        <>
                          <ArrowLeft size={14} />
                          Back
                        </>
                      ) : (
                        'Skip for now'
                      )}
                    </button>
                    <span className="onboarding-page-count">
                      {step + 1} / {stages.length}
                    </span>
                    <Button
                      onClick={() => {
                        if (step === 3) {
                          if (onExploreWorkspace) choose(onExploreWorkspace);
                          else onOpenChange(false);
                        } else setStep(step + 1);
                      }}
                    >
                      {step === 0
                        ? 'Get started'
                        : step === 1 && !connected
                          ? 'Continue locally'
                          : step === 2
                            ? 'Choose my project'
                            : step === 3
                              ? 'Explore the workspace'
                              : 'Continue'}
                      <ArrowRight size={15} />
                    </Button>
                  </footer>
                </div>
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function PracticeCommit() {
  const [lesson, setLesson] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [pushed, setPushed] = useState(false);
  const sampleFiles = ['README.md', 'welcome.tsx'];
  return (
    <div className="practice-commit">
      <div className="practice-heading">
        <span className="practice-label">Practice preview</span>
        <span>No real files changed</span>
      </div>
      <div className="practice-tabs" role="tablist" aria-label="Practice lesson">
        {['Pick files', 'Save a commit', 'Push to share'].map((label, index) => (
          <button
            role="tab"
            aria-selected={lesson === index}
            key={label}
            onClick={() => setLesson(index)}
          >
            {index < lesson ? <Check size={13} /> : <span>{index + 1}</span>}
            {label}
          </button>
        ))}
      </div>
      {lesson === 0 ? (
        <div className="practice-lesson">
          <h3>Pick what belongs together.</h3>
          <p>
            Tick the files you want to save. Git calls this <strong>staging</strong>.
          </p>
          <div className="practice-files">
            {sampleFiles.map((file, index) => (
              <button
                key={file}
                role="checkbox"
                aria-checked={files.includes(file)}
                aria-label={`Choose practice file ${file}`}
                onClick={() =>
                  setFiles((prev) =>
                    prev.includes(file) ? prev.filter((item) => item !== file) : [...prev, file],
                  )
                }
              >
                <span className={`practice-check ${files.includes(file) ? 'checked' : ''}`}>
                  {files.includes(file) && <Check size={11} />}
                </span>
                {index ? <FileCode2 size={16} /> : <FileText size={16} />}
                <span>{file}</span>
                <span className="practice-file-status">Modified</span>
              </button>
            ))}
          </div>
          <Button size="sm" disabled={!files.length} onClick={() => setLesson(1)}>
            Continue with {files.length || 'your'} {files.length === 1 ? 'file' : 'files'}
            <ArrowRight size={13} />
          </Button>
        </div>
      ) : lesson === 1 ? (
        <div className="practice-lesson">
          <h3>Save a checkpoint.</h3>
          <p>
            A <strong>commit</strong> saves your chosen changes on this computer.
          </p>
          <label className="practice-message">
            What changed?
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Add a welcome message"
              maxLength={120}
            />
          </label>
          <Button size="sm" disabled={!message.trim()} onClick={() => setLesson(2)}>
            <GitCommitHorizontal size={15} />
            Save practice commit
          </Button>
        </div>
      ) : (
        <div className="practice-lesson">
          <h3>{pushed ? 'That’s the whole flow.' : 'Share when you’re ready.'}</h3>
          <p>
            <strong>Push</strong> uploads saved commits to GitHub. Other local edits stay local.
          </p>
          <div className={`practice-push ${pushed ? 'pushed' : ''}`}>
            <span>
              <GitCommitHorizontal size={21} />
              <strong>{message || 'Your saved commit'}</strong>
            </span>
            <ArrowRight size={21} />
            <span>
              {pushed ? <Check size={25} /> : <Github size={25} />}
              <strong>{pushed ? 'Preview complete' : 'GitHub'}</strong>
            </span>
          </div>
          <Button size="sm" onClick={() => setPushed(!pushed)}>
            {pushed ? (
              <>
                <Check size={14} />
                Try it again
              </>
            ) : (
              <>
                <Upload size={14} />
                Preview a push
              </>
            )}
          </Button>
          <p className="practice-note">This is a practice animation. Nothing is uploaded.</p>
        </div>
      )}
    </div>
  );
}
