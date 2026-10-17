import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useActivity } from './useActivity';

export interface GitHubAccount {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
}

interface GitHubAuthStatus {
  configured: boolean;
  connected: boolean;
  account: GitHubAccount | null;
  scopes: string[];
  error?: string | null;
}

interface DeviceAuthorization {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface AuthPoll {
  status: 'pending' | 'slow_down' | 'connected' | 'expired' | 'denied';
  account?: GitHubAccount | null;
  retryAfter?: number;
}

export interface PendingGitHubAuthorization {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

interface GitHubAuthContextValue extends GitHubAuthStatus {
  desktop: boolean;
  revision: number;
  stage: 'idle' | 'starting' | 'waiting' | 'connected' | 'error';
  pending: PendingGitHubAuthorization | null;
  connect: () => Promise<void>;
  cancel: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  openBrowser: () => Promise<void>;
}

interface AuthAttemptActivity {
  id: string;
  settled: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextValue | null>(null);
const emptyStatus: GitHubAuthStatus = {
  configured: false,
  connected: false,
  account: null,
  scopes: [],
};

function messageFrom(reason: unknown, fallback: string) {
  return typeof reason === 'string'
    ? reason.slice(0, 800)
    : reason instanceof Error
      ? reason.message.slice(0, 800)
      : fallback;
}

/** Credentials and the private device code stay in Rust and the OS credential store. */
export function GitHubAuthProvider({ children }: { children: ReactNode }) {
  const { record, settle } = useActivity();
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const [status, setStatus] = useState<GitHubAuthStatus>(emptyStatus);
  const [stage, setStage] = useState<GitHubAuthContextValue['stage']>('idle');
  const [pending, setPending] = useState<PendingGitHubAuthorization | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const identity = useRef('');
  const mounted = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSession = useRef<PendingGitHubAuthorization | null>(null);
  const starting = useRef(false);
  const authActivity = useRef<AuthAttemptActivity | null>(null);

  const finishAuthActivity = useCallback(
    (attempt: AuthAttemptActivity | null, status: 'success' | 'error', output: string) => {
      if (!attempt || attempt.settled) return;
      attempt.settled = true;
      if (authActivity.current === attempt) authActivity.current = null;
      settle(attempt.id, { status, output });
    },
    [settle],
  );

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    const currentGeneration = generation.current;
    try {
      const current = await invoke<GitHubAuthStatus>('github_auth_status');
      if (!mounted.current || currentGeneration !== generation.current) return;
      const nextIdentity = current.connected ? (current.account?.login.toLowerCase() ?? '') : '';
      if (identity.current !== nextIdentity) {
        identity.current = nextIdentity;
        setRevision((value) => value + 1);
      }
      setStatus(current);
      setError(current.error ?? null);
      if (!pendingSession.current && !starting.current) {
        setStage(current.connected ? 'connected' : 'idle');
      }
    } catch (reason) {
      if (!mounted.current || currentGeneration !== generation.current) return;
      setError(messageFrom(reason, 'Could not check GitHub sign-in. Try again.'));
    }
  }, [desktop]);

  const cancel = useCallback(async () => {
    const attempt = authActivity.current;
    authActivity.current = null;
    generation.current += 1;
    starting.current = false;
    clearTimer();
    const session = pendingSession.current;
    pendingSession.current = null;
    setPending(null);
    setStage(status.connected ? 'connected' : 'idle');
    setError(null);
    if (desktop && session) {
      try {
        await invoke('github_auth_cancel', { sessionId: session.sessionId });
      } catch (reason) {
        finishAuthActivity(
          attempt,
          'error',
          'GitHub sign-in stopped locally. The pending authorization could not be cancelled at GitHub and will expire.',
        );
        if (mounted.current) {
          setError(messageFrom(reason, 'Could not cancel sign-in. The code will expire shortly.'));
        }
      }
    }
    finishAuthActivity(
      attempt,
      'success',
      'GitHub sign-in cancelled. No new account was connected.',
    );
  }, [clearTimer, desktop, finishAuthActivity, status.connected]);

  const openBrowser = useCallback(async () => {
    const session = pendingSession.current;
    if (!desktop || !session) return;
    try {
      await invoke('github_auth_open_browser', { sessionId: session.sessionId });
      if (mounted.current && pendingSession.current?.sessionId === session.sessionId) {
        setError(null);
      }
    } catch {
      if (mounted.current && pendingSession.current?.sessionId === session.sessionId) {
        setError(
          'Your browser could not open. Visit github.com/login/device and enter the code below.',
        );
      }
    }
  }, [desktop]);

  const connect = useCallback(async () => {
    if (
      !desktop ||
      !status.configured ||
      starting.current ||
      pendingSession.current ||
      status.connected
    )
      return;
    starting.current = true;
    const attempt: AuthAttemptActivity = {
      id: record({
        kind: 'operation',
        label: 'Sign in with GitHub',
        description:
          'Request GitHub authorization through the browser. Approval is required to connect this account.',
        status: 'running',
      }),
      settled: false,
    };
    authActivity.current = attempt;
    const currentGeneration = ++generation.current;
    clearTimer();
    setError(null);
    setStage('starting');

    try {
      const authorization = await invoke<DeviceAuthorization>('github_auth_start');
      if (!mounted.current || currentGeneration !== generation.current) {
        await invoke('github_auth_cancel', { sessionId: authorization.sessionId }).catch(() => {});
        return;
      }
      const session: PendingGitHubAuthorization = {
        sessionId: authorization.sessionId,
        userCode: authorization.userCode,
        verificationUri: authorization.verificationUri,
        expiresAt: Date.now() + authorization.expiresIn * 1000,
      };
      pendingSession.current = session;
      starting.current = false;
      setPending(session);
      setStage('waiting');
      let interval = Math.max(5, authorization.interval);

      const schedulePoll = () => {
        timer.current = setTimeout(async () => {
          if (!mounted.current || currentGeneration !== generation.current) return;
          try {
            const result = await invoke<AuthPoll>('github_auth_poll', {
              sessionId: session.sessionId,
            });
            if (!mounted.current || currentGeneration !== generation.current) return;
            if (result.status === 'pending' || result.status === 'slow_down') {
              interval = Math.max(
                interval + (result.status === 'slow_down' ? 5 : 0),
                result.retryAfter ?? 0,
              );
              schedulePoll();
              return;
            }
            pendingSession.current = null;
            setPending(null);
            if (result.status === 'connected') {
              identity.current = result.account?.login.toLowerCase() ?? '';
              setRevision((value) => value + 1);
              setStatus((current) => ({
                ...current,
                configured: true,
                connected: true,
                account: result.account ?? null,
              }));
              setStage('connected');
              setError(null);
              finishAuthActivity(
                attempt,
                'success',
                'GitHub account connected. Authorization is saved in the operating system credential store.',
              );
              await refresh();
            } else {
              setStage('error');
              finishAuthActivity(
                attempt,
                'error',
                result.status === 'expired'
                  ? 'GitHub sign-in expired. Request a new authorization to try again.'
                  : 'GitHub sign-in was declined. No account was connected.',
              );
              setError(
                result.status === 'expired'
                  ? 'Your sign-in code expired. Choose Sign in with GitHub to get a new one.'
                  : 'GitHub sign-in was declined. You can try again or continue working locally.',
              );
            }
          } catch (reason) {
            if (!mounted.current || currentGeneration !== generation.current) return;
            pendingSession.current = null;
            setPending(null);
            setStage('error');
            finishAuthActivity(
              attempt,
              'error',
              'GitHub sign-in was interrupted. Try signing in again.',
            );
            setError(messageFrom(reason, 'GitHub sign-in was interrupted. Try again.'));
            await invoke('github_auth_cancel', { sessionId: session.sessionId }).catch(() => {});
          }
        }, interval * 1000);
      };

      schedulePoll();
      await openBrowser();
    } catch (reason) {
      if (!mounted.current || currentGeneration !== generation.current) return;
      starting.current = false;
      setStage('error');
      finishAuthActivity(
        attempt,
        'error',
        'GitHub sign-in could not start. Check the sign-in panel for the next step.',
      );
      setError(messageFrom(reason, 'Could not start GitHub sign-in. Try again.'));
    }
  }, [
    clearTimer,
    desktop,
    finishAuthActivity,
    openBrowser,
    record,
    refresh,
    status.connected,
    status.configured,
  ]);

  const disconnect = useCallback(async () => {
    if (!desktop || starting.current) return;
    await cancel();
    starting.current = true;
    const currentGeneration = generation.current;
    setStage('starting');
    const activityId = record({
      kind: 'operation',
      label: 'Disconnect GitHub',
      description: 'Remove the saved GitHub authorization from this computer.',
      status: 'running',
    });
    try {
      await invoke('github_auth_disconnect');
      if (!mounted.current || currentGeneration !== generation.current) return;
      identity.current = '';
      setRevision((value) => value + 1);
      setStatus((current) => ({ ...current, connected: false, account: null, scopes: [] }));
      setStage('idle');
      setError(null);
      settle(activityId, {
        status: 'success',
        output: 'GitHub disconnected. Saved authorization was removed from this computer.',
      });
    } catch (reason) {
      if (!mounted.current || currentGeneration !== generation.current) return;
      setStage(status.connected ? 'connected' : 'error');
      setError(messageFrom(reason, 'Could not disconnect GitHub. Try again.'));
      settle(activityId, {
        status: 'error',
        output: 'GitHub could not be disconnected. Check the sign-in panel before trying again.',
      });
    } finally {
      if (currentGeneration === generation.current) starting.current = false;
    }
  }, [cancel, desktop, record, settle, status.connected]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      generation.current += 1;
      clearTimer();
      const session = pendingSession.current;
      pendingSession.current = null;
      finishAuthActivity(
        authActivity.current,
        'success',
        'GitHub sign-in cancelled before completion.',
      );
      if (session && desktop) {
        void invoke('github_auth_cancel', { sessionId: session.sessionId }).catch(() => {});
      }
    };
  }, [clearTimer, desktop, finishAuthActivity, refresh]);

  const value = useMemo<GitHubAuthContextValue>(
    () => ({
      ...status,
      error,
      desktop,
      revision,
      stage,
      pending,
      connect,
      cancel,
      disconnect,
      refresh,
      openBrowser,
    }),
    [
      status,
      error,
      desktop,
      revision,
      stage,
      pending,
      connect,
      cancel,
      disconnect,
      refresh,
      openBrowser,
    ],
  );

  return <GitHubAuthContext.Provider value={value}>{children}</GitHubAuthContext.Provider>;
}

export function useGitHubAuth() {
  const auth = useContext(GitHubAuthContext);
  if (!auth) throw new Error('useGitHubAuth must be used within GitHubAuthProvider.');
  return auth;
}
