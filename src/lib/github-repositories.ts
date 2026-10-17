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

/** Loaded data only: filtering never sends a query or credentials to GitHub. */
export function filterGitHubRepositories(repositories: GitHubRepository[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return repositories;
  return repositories.filter((repository) =>
    [repository.fullName, repository.description, repository.language].some((value) =>
      value?.toLocaleLowerCase().includes(term),
    ),
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
