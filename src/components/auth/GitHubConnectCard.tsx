import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Github,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { useGitHubAuth } from '../../hooks/useGitHubAuth';
import { TextRoll } from '../registry/skiper/TextRoll';
import { AnimatedTooltip } from '../registry/vengeance/AnimatedTooltip';
import { Button } from '../ui/button';
import './github-auth.css';

export function GitHubConnectCard({ compact = false }: { compact?: boolean }) {
  const auth = useGitHubAuth();
  const reducedMotion = useReducedMotion();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const waiting = auth.stage === 'waiting' && auth.pending;

  useEffect(() => {
    setCopyStatus('idle');
    if (!auth.pending) return;
    const expiresAt = auth.pending.expiresAt;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [auth.pending]);

  async function copyCode() {
    if (!auth.pending) return;
    try {
      await navigator.clipboard.writeText(auth.pending.userCode);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  return (
    <section
      className={`github-connect ${compact ? 'is-compact' : ''} ${auth.connected ? 'is-connected' : ''}`}
      aria-label="GitHub connection"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={auth.connected ? 'connected' : waiting ? 'waiting' : 'signin'}
          className="github-connect-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.16 }}
        >
          <div className="github-connect-heading">
            <Github size={24} aria-hidden="true" />
            <div>
              <strong>
                <TextRoll>
                  {auth.connected
                    ? 'GitHub, connected.'
                    : waiting
                      ? 'One quick approval.'
                      : 'Connect your GitHub.'}
                </TextRoll>
              </strong>
              <p>
                {auth.connected
                  ? `Signed in as @${auth.account?.login ?? 'your GitHub account'}`
                  : waiting
                    ? 'Copy this code, then approve GitSomething in your browser.'
                    : 'Sign in through your browser. No access token to find or paste.'}
              </p>
            </div>
            {auth.connected && (
              <Check size={18} className="github-connected-check" aria-label="Connected" />
            )}
          </div>

          {!auth.desktop ? (
            <div className="github-auth-local-note">
              <Monitor size={16} />
              <p>
                GitHub sign-in is available in the desktop app. This browser preview stays local.
              </p>
            </div>
          ) : auth.connected ? (
            <div className="github-account-row">
              <span className="github-account-avatar" aria-hidden="true">
                {(auth.account?.name ?? auth.account?.login ?? 'G').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{auth.account?.name || auth.account?.login || 'GitHub account'}</strong>
                <span>Ready to create repositories and push your work.</span>
              </div>
              <AnimatedTooltip content="Remove GitSomething’s saved GitHub credentials from this computer. To revoke access at GitHub, visit your GitHub application settings.">
                <button
                  type="button"
                  className="github-auth-text-button"
                  onClick={() => void auth.disconnect()}
                  disabled={auth.stage === 'starting'}
                >
                  {auth.stage === 'starting' ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </AnimatedTooltip>
            </div>
          ) : waiting ? (
            <div className="github-device-flow">
              <div className="github-device-code-row">
                <code aria-label="GitHub verification code">{auth.pending?.userCode}</code>
                <button type="button" className="github-code-copy" onClick={() => void copyCode()}>
                  {copyStatus === 'copied' ? <Check size={15} /> : <Copy size={15} />}
                  {copyStatus === 'copied' ? 'Copied' : 'Copy code'}
                </button>
              </div>
              {copyStatus === 'error' && (
                <p className="github-auth-copy-help" role="status">
                  Select and copy the code above, then enter it on GitHub.
                </p>
              )}
              <div className="github-device-actions">
                <Button
                  type="button"
                  className="github-signin-button"
                  onClick={() => void auth.openBrowser()}
                >
                  Open GitHub <ArrowUpRight size={15} />
                </Button>
                <button
                  type="button"
                  className="github-auth-text-button"
                  onClick={() => void auth.cancel()}
                >
                  Cancel
                </button>
              </div>
              <div className="github-device-wait" role="status">
                <LoaderCircle size={14} className="github-auth-spinner" />
                <span>
                  {secondsLeft > 0
                    ? 'Waiting for your approval on GitHub'
                    : 'Checking whether your code expired…'}
                </span>
                {secondsLeft > 0 && (
                  <time>
                    {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                  </time>
                )}
              </div>
            </div>
          ) : (
            <div className="github-signin-actions">
              <Button
                type="button"
                className="github-signin-button"
                onClick={() => void auth.connect()}
                disabled={!auth.configured || auth.stage === 'starting'}
              >
                {auth.stage === 'starting' ? (
                  <LoaderCircle size={16} className="github-auth-spinner" />
                ) : (
                  <Github size={16} />
                )}
                {auth.stage === 'starting' ? 'Opening GitHub…' : 'Sign in with GitHub'}
                <ArrowUpRight size={15} />
              </Button>
              <span>
                <LockKeyhole size={12} /> Saved in your OS credential store
              </span>
            </div>
          )}

          {auth.desktop && !auth.configured && (
            <p className="github-auth-build-note" role="status">
              GitHub sign-in is unavailable in this development build.
            </p>
          )}

          {auth.error && (
            <div className="github-auth-error" role="alert">
              <CircleAlert size={15} />
              <p>{auth.error}</p>
            </div>
          )}

          {auth.desktop && (auth.configured || auth.connected) && (
            <details className="github-permissions">
              <summary>
                <ShieldCheck size={13} /> What am I allowing?
                <ChevronDown size={13} />
              </summary>
              <div>
                <p>
                  GitSomething requests access to your public and private repositories, including
                  creating repositories and pushing code (<code>repo</code>), and updating workflow
                  files (<code>workflow</code>).
                </p>
                <p>
                  Your profile and email set the author of your commits. Organization repositories
                  may need an administrator’s approval. You can disconnect here or revoke
                  authorization in GitHub settings at any time.
                </p>
              </div>
            </details>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
