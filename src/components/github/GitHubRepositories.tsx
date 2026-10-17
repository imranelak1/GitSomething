import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  CircleAlert,
  Download,
  GitFork,
  Github,
  Globe,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';
import { useGitHubRepositories } from '@/hooks/useGitHubRepositories';
import { safeActivityText } from '@/lib/activity';
import {
  selectGitHubRepositories,
  isGitHubRepositoryUrl,
  type GitHubRepositorySort,
  type GitHubRepositoryVisibility,
  type GitHubRepository,
} from '@/lib/github-repositories';
import { AnimatedButton } from '../registry/vengeance/AnimatedButton';
import './github-repositories.css';

function updatedLabel(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function GitHubRepositories({
  onConnect,
  onClone,
  busy,
}: {
  onConnect: () => void;
  onClone: (repository: GitHubRepository) => Promise<boolean>;
  busy: boolean;
}) {
  const auth = useGitHubAuth();
  const repositories = useGitHubRepositories();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState<GitHubRepositoryVisibility>('all');
  const [sort, setSort] = useState<GitHubRepositorySort>('updated');
  const [openError, setOpenError] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const cloneRequest = useRef(false);
  const signedIn = auth.desktop && auth.connected && Boolean(auth.account?.login);
  const identity = signedIn ? `${auth.account?.login}:${auth.revision}` : '';
  const currentIdentity = useRef(identity);
  const openingRequest = useRef<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  currentIdentity.current = identity;
  const filtered = selectGitHubRepositories(repositories.repositories, query, visibility, sort);
  const counts = {
    all: repositories.repositories.length,
    private: repositories.repositories.filter((repository) => repository.private).length,
    public: repositories.repositories.filter((repository) => !repository.private).length,
  };
  const hasFilters = Boolean(query.trim()) || visibility !== 'all';

  function clearFilters() {
    setQuery('');
    setVisibility('all');
  }

  useEffect(() => {
    setQuery('');
    setVisibility('all');
    setSort('updated');
    setOpenError('');
    setOpening(null);
    setCloning(null);
    openingRequest.current = null;
  }, [auth.account?.login, auth.connected, auth.revision]);

  async function cloneRepository(repository: GitHubRepository) {
    if (busy || cloneRequest.current || !identity) return;
    cloneRequest.current = true;
    const requestIdentity = identity;
    setCloning(repository.cloneUrl);
    setOpenError('');
    try {
      await onClone(repository);
    } catch (reason) {
      if (currentIdentity.current !== requestIdentity) return;
      setOpenError(
        safeActivityText(reason instanceof Error ? reason.message : String(reason)).slice(0, 500),
      );
    } finally {
      cloneRequest.current = false;
      if (currentIdentity.current === requestIdentity) setCloning(null);
    }
  }

  async function openRepository(event: MouseEvent<HTMLAnchorElement>, url: string) {
    if (!auth.desktop) return;
    event.preventDefault();
    if (!isGitHubRepositoryUrl(url) || openingRequest.current || !identity) return;
    const requestIdentity = identity;
    openingRequest.current = requestIdentity;
    setOpening(url);
    setOpenError('');
    try {
      await invoke('open_github_repository', { url });
    } catch (reason) {
      if (currentIdentity.current !== requestIdentity) return;
      setOpenError(
        safeActivityText(
          typeof reason === 'string' ? reason : 'Could not open GitHub in your browser. Try again.',
        ).slice(0, 500),
      );
    } finally {
      if (currentIdentity.current === requestIdentity) {
        openingRequest.current = null;
        setOpening(null);
      }
    }
  }

  return (
    <section className="github-repositories" aria-labelledby="github-repositories-title">
      <div className="github-repositories-heading">
        <div className="github-repositories-title">
          <Github size={18} aria-hidden="true" />
          <h2 id="github-repositories-title">GitHub repositories</h2>
          {signedIn && repositories.loaded && (
            <span className="github-repositories-total">{counts.all}</span>
          )}
        </div>
        {signedIn && (
          <button
            type="button"
            className="github-repositories-refresh"
            onClick={() => void repositories.refresh()}
            disabled={repositories.loading}
            aria-label="Refresh GitHub repositories"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        )}
      </div>

      {!signedIn ? (
        <div className="github-repositories-disconnected">
          {!auth.desktop && <Monitor size={19} aria-hidden="true" />}
          <div>
            <p>
              {auth.desktop
                ? 'See your repositories here.'
                : 'Your GitHub repositories live in the desktop app.'}
            </p>
            <span>
              {auth.desktop
                ? 'Sign in to browse your public, private, and shared repositories.'
                : 'Open GitSomething on your computer to sign in securely and load your real repositories.'}
            </span>
          </div>
          {auth.desktop && (
            <button type="button" className="github-repositories-connect" onClick={onConnect}>
              <Github size={15} aria-hidden="true" /> Sign in with GitHub
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="github-repositories-account">
            <strong>@{auth.account?.login}</strong>
            <span>Public, private, and shared repositories.</span>
          </p>
          <div className="github-repositories-toolbar">
            <div className="github-repositories-search">
              <Search size={16} aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter loaded repositories"
                aria-label="Filter loaded GitHub repositories"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className="github-repositories-search-clear"
                  aria-label="Clear repository search"
                  onClick={() => {
                    setQuery('');
                    searchInput.current?.focus();
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            <label className="github-repositories-sort">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as GitHubRepositorySort)}
                aria-label="Sort GitHub repositories"
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <div className="github-repositories-filterbar">
            <div
              className="github-repositories-filters"
              role="group"
              aria-label="Repository visibility"
            >
              {(['all', 'public', 'private'] as const).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  aria-label={`${filter[0].toUpperCase()}${filter.slice(1)} repositories`}
                  aria-description={`${counts[filter]} loaded repositories`}
                  aria-pressed={visibility === filter}
                  onClick={() => setVisibility(filter)}
                >
                  {filter[0].toUpperCase()}
                  {filter.slice(1)}
                  <span>{counts[filter]}</span>
                </button>
              ))}
            </div>
            {hasFilters && (
              <button type="button" className="github-repositories-reset" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {repositories.error && (
            <div className="github-repositories-error" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              <p>{repositories.error}</p>
              <button
                type="button"
                onClick={() => void repositories.refresh()}
                disabled={repositories.loading}
              >
                Try again
              </button>
            </div>
          )}
          {openError && (
            <p className="github-repositories-open-error" role="alert">
              {openError}
            </p>
          )}
          {cloning && (
            <p className="github-repositories-clone-status" role="status">
              <LoaderCircle className="github-repositories-spinner" size={15} aria-hidden="true" />
              {busy
                ? 'Downloading your working copy. Large repositories can take a little longer.'
                : 'Choose a folder. A new repository folder will be created inside it.'}
            </p>
          )}

          {filtered.length > 0 && (
            <motion.ul
              className="github-repositories-list"
              aria-label="Repositories on GitHub"
              tabIndex={0}
              aria-busy={repositories.loading}
              initial={{ opacity: 0.75 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >
              {filtered.map((repository) => {
                const date = updatedLabel(repository.updatedAt);
                const safeUrl = isGitHubRepositoryUrl(repository.htmlUrl);
                return (
                  <li className="github-repositories-row" key={repository.id}>
                    <div className="github-repositories-row-heading">
                      <strong className="github-repositories-name">
                        <span>{repository.ownerLogin}/</span>
                        {repository.name}
                      </strong>
                      <span className="github-repositories-visibility">
                        {repository.private ? (
                          <LockKeyhole size={12} aria-hidden="true" />
                        ) : (
                          <Globe size={12} aria-hidden="true" />
                        )}
                        {repository.private ? 'Private' : 'Public'}
                      </span>
                      <div className="github-repositories-actions">
                        {safeUrl &&
                          isGitHubRepositoryUrl(repository.cloneUrl) &&
                          repository.cloneUrl.endsWith('.git') && (
                            <AnimatedButton
                              type="button"
                              className="github-repositories-clone"
                              onClick={() => void cloneRepository(repository)}
                              disabled={busy || Boolean(cloning)}
                              aria-label={`Clone and open ${repository.fullName}`}
                            >
                              {cloning === repository.cloneUrl ? (
                                <LoaderCircle
                                  className="github-repositories-spinner"
                                  size={14}
                                  aria-hidden="true"
                                />
                              ) : (
                                <Download size={14} aria-hidden="true" />
                              )}
                              {cloning === repository.cloneUrl
                                ? busy
                                  ? 'Cloning…'
                                  : 'Choose folder…'
                                : 'Clone & open'}
                            </AnimatedButton>
                          )}
                        {safeUrl && (
                          <a
                            className="github-repositories-open"
                            href={repository.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => void openRepository(event, repository.htmlUrl)}
                            aria-label={`Open ${repository.fullName} on GitHub`}
                            aria-disabled={opening === repository.htmlUrl || undefined}
                          >
                            <span>GitHub</span>
                            {opening === repository.htmlUrl ? (
                              <LoaderCircle
                                className="github-repositories-spinner"
                                size={14}
                                aria-hidden="true"
                              />
                            ) : (
                              <ArrowUpRight size={14} aria-hidden="true" />
                            )}
                          </a>
                        )}
                      </div>
                    </div>
                    {repository.description && (
                      <p className="github-repositories-description">{repository.description}</p>
                    )}
                    <div className="github-repositories-metadata">
                      {repository.language && <span>{repository.language}</span>}
                      {date && (
                        <span>
                          Updated <time dateTime={repository.updatedAt}>{date}</time>
                        </span>
                      )}
                      {repository.fork && (
                        <span>
                          <GitFork size={12} aria-hidden="true" /> Fork
                        </span>
                      )}
                      {repository.archived && <span>Archived</span>}
                    </div>
                  </li>
                );
              })}
            </motion.ul>
          )}

          {repositories.loading && (
            <div className="github-repositories-loading" role="status">
              <LoaderCircle className="github-repositories-spinner" size={16} aria-hidden="true" />
              {repositories.repositories.length
                ? 'Loading repositories…'
                : 'Loading your GitHub repositories…'}
            </div>
          )}
          {!repositories.loading && repositories.loaded && filtered.length === 0 && (
            <div className="github-repositories-empty" role="status">
              <p>
                {hasFilters
                  ? 'No loaded repositories match your filter.'
                  : 'GitHub returned no repositories for this account.'}
              </p>
              <span>
                {hasFilters
                  ? repositories.nextPage === null
                    ? 'Try another search or choose a different visibility filter.'
                    : 'Try another filter or load more repositories below.'
                  : 'Organization repositories may need approval from your organization.'}
              </span>
            </div>
          )}
          {repositories.repositories.length > 0 && (
            <div className="github-repositories-footer">
              <div className="github-repositories-summary" aria-live="polite" aria-atomic="true">
                <span>
                  {hasFilters ? `${filtered.length} matching · ` : ''}
                  {counts.all} loaded
                  {repositories.nextPage === null ? ' · All available repositories' : ''}
                </span>
                {repositories.nextPage !== null && (
                  <span>Search covers loaded repositories. Load more to include the rest.</span>
                )}
              </div>
              {repositories.nextPage !== null && (
                <button
                  type="button"
                  onClick={() => void repositories.loadMore()}
                  disabled={repositories.loading}
                >
                  Load more repositories
                </button>
              )}
            </div>
          )}
          <p className="github-repositories-local-hint">
            Clone downloads a working copy to your computer. Already downloaded it? Choose Open
            repository above.
          </p>
        </>
      )}
    </section>
  );
}
