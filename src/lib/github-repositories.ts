export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
  cloneUrl: string;
  updatedAt: string;
  language: string | null;
  ownerLogin: string;
}

export interface GitHubRepositoryPage {
  repositories: GitHubRepository[];
  nextPage: number | null;
  accountLogin: string;
}

export type GitHubRepositoryVisibility = 'all' | 'public' | 'private';
export type GitHubRepositorySort = 'updated' | 'name';

/** Loaded data only: filtering never sends a query or credentials to GitHub. */
export function filterGitHubRepositories(repositories: GitHubRepository[], query: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return repositories;
  return repositories.filter((repository) => {
    const metadata = [repository.fullName, repository.description, repository.language]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return terms.every((term) => metadata.includes(term));
  });
}

const repositoryNameOrder = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Search and visibility apply together; sorting never mutates the paginated source. */
export function selectGitHubRepositories(
  repositories: GitHubRepository[],
  query: string,
  visibility: GitHubRepositoryVisibility,
  sort: GitHubRepositorySort,
) {
  const filtered = filterGitHubRepositories(repositories, query).filter(
    (repository) => visibility === 'all' || repository.private === (visibility === 'private'),
  );
  const nameOrder = (left: GitHubRepository, right: GitHubRepository) =>
    repositoryNameOrder.compare(left.name, right.name) ||
    repositoryNameOrder.compare(left.fullName, right.fullName) ||
    left.id - right.id;
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return filtered.sort((left, right) =>
    sort === 'name'
      ? nameOrder(left, right)
      : timestamp(right.updatedAt) - timestamp(left.updatedAt) || nameOrder(left, right),
  );
}

/** Pagination can repeat a repository if it was updated between page requests. */
export function mergeGitHubRepositories(
  previous: GitHubRepository[],
  incoming: GitHubRepository[],
) {
  const repositories = new Map(previous.map((repository) => [repository.id, repository]));
  incoming.forEach((repository) => repositories.set(repository.id, repository));
  return [...repositories.values()];
}

export function isGitHubRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
