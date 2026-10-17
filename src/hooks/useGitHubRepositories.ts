import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { safeActivityText } from '@/lib/activity';
import {
  mergeGitHubRepositories,
  type GitHubRepository,
  type GitHubRepositoryPage,
} from '@/lib/github-repositories';
import { useActivity } from './useActivity';
import { useGitHubAuth } from './useGitHubAuth';

interface RepositoryState {
  session: string;
  repositories: GitHubRepository[];
  nextPage: number | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

function emptyState(session: string): RepositoryState {
  return { session, repositories: [], nextPage: null, loading: false, loaded: false, error: null };
}

function errorMessage(reason: unknown) {
  const text =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : 'Could not load your GitHub repositories. Check your connection and try again.';
  return safeActivityText(text).slice(0, 800);
}

/** OAuth stays in Rust. This hook only receives repository metadata for the active account. */
export function useGitHubRepositories() {
  const { desktop, connected, account, revision, refresh: refreshAuth } = useGitHubAuth();
  const { record, settle } = useActivity();
  const login = account?.login ?? '';
  const session = desktop && connected && login ? `${login.toLowerCase()}:${revision}` : '';
  const currentSession = useRef(session);
  // Hide the previous account immediately, before passive effects or an IPC response can run.
  currentSession.current = session;
  const generation = useRef(0);
  const mounted = useRef(false);
  const [state, setState] = useState<RepositoryState>(() => emptyState(session));

  const requestPage = useCallback(
    async (page: number, append: boolean) => {
      if (!session || currentSession.current !== session) return;
      const requestGeneration = ++generation.current;
      setState((previous) => ({
        ...(previous.session === session ? previous : emptyState(session)),
        loading: true,
        error: null,
      }));
      const activityId = record({
        kind: 'operation',
        label: append ? 'Load more GitHub repositories' : 'Read GitHub repositories',
        description:
          'Read the repositories this GitHub account owns or can access. No repositories are changed.',
        command: `GET /user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&per_page=50&page=${page}`,
        status: 'running',
      });
      const isCurrent = () =>
        mounted.current &&
        currentSession.current === session &&
        generation.current === requestGeneration;
      try {
        const result = await invoke<GitHubRepositoryPage>('list_github_repositories', {
          request: { page, perPage: 50 },
        });
        if (!isCurrent()) {
          settle(activityId, {
            status: 'success',
            output: 'Repository response discarded because the GitHub session changed.',
          });
          return;
        }
        if (result.accountLogin.toLowerCase() !== login.toLowerCase()) {
          throw new Error(
            'GitHub sign-in changed while loading repositories. Refresh the list to try again.',
          );
        }
        setState((previous) => ({
          session,
          repositories:
            append && previous.session === session
              ? mergeGitHubRepositories(previous.repositories, result.repositories)
              : mergeGitHubRepositories([], result.repositories),
          nextPage: result.nextPage,
          loading: false,
          loaded: true,
          error: null,
        }));
        settle(activityId, {
          status: 'success',
          output: `Received ${result.repositories.length} repositories${result.nextPage === null ? '. All available pages have been loaded.' : '. More repositories are available.'}`,
        });
      } catch (reason) {
        const message = errorMessage(reason);
        settle(activityId, { status: 'error', output: message });
        if (!isCurrent()) return;
        setState((previous) => ({
          ...(previous.session === session ? previous : emptyState(session)),
          loading: false,
          error: message,
        }));
        // Rust invalidates revoked/expired credentials; re-read that state to hide private rows.
        void refreshAuth();
      }
    },
    [login, record, refreshAuth, session, settle],
  );

  useEffect(() => {
    mounted.current = true;
    setState(emptyState(session));
    const effectGeneration = ++generation.current;
    // Defer one microtask so Strict Mode's discarded setup never makes a duplicate API request.
    if (session) {
      void Promise.resolve().then(() => {
        if (
          mounted.current &&
          currentSession.current === session &&
          generation.current === effectGeneration
        ) {
          void requestPage(1, false);
        }
      });
    }
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [session, requestPage]);

  // A new session never renders metadata retained by the previous one.
  const visibleState = state.session === session && session ? state : emptyState(session);
  const refresh = useCallback(() => requestPage(1, false), [requestPage]);
  const loadMore = useCallback(() => {
    if (visibleState.loading || visibleState.nextPage === null) return Promise.resolve();
    return requestPage(visibleState.nextPage, true);
  }, [requestPage, visibleState.loading, visibleState.nextPage]);

  return { ...visibleState, refresh, loadMore };
}
