import type { RepositorySnapshot } from './types';

export interface RecentRepository {
  path: string;
  name: string;
  branch: string;
  lastOpened: number;
}

export const RECENT_REPOSITORIES_KEY = 'branchline.recent-repositories.v1';
const MAX_RECENT = 8;
type RecentStorage = Pick<Storage, 'getItem' | 'setItem'>;
const displayMetadata = ({
  path,
  name,
  branch,
  lastOpened,
}: RecentRepository): RecentRepository => ({ path, name, branch, lastOpened });

function pathKey(path: string): string {
  return /^[a-z]:[\\/]|^\\\\/i.test(path)
    ? path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
    : path.replace(/\/+$/, '');
}

function validRecent(value: unknown): value is RecentRepository {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<RecentRepository>;
  return (
    typeof entry.path === 'string' &&
    entry.path.length <= 4096 &&
    /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(entry.path) &&
    !/[\u0000-\u001f]/.test(entry.path) &&
    typeof entry.name === 'string' &&
    entry.name.trim().length > 0 &&
    entry.name.length <= 200 &&
    typeof entry.branch === 'string' &&
    entry.branch.length <= 500 &&
    typeof entry.lastOpened === 'number' &&
    Number.isFinite(entry.lastOpened) &&
    entry.lastOpened >= 0
  );
}

export function readRecentRepositories(storage?: RecentStorage): RecentRepository[] {
  try {
    const raw: unknown = JSON.parse(
      (storage ?? localStorage).getItem(RECENT_REPOSITORIES_KEY) || '[]',
    );
    if (!Array.isArray(raw)) return [];
    const keys = new Set<string>();
    return raw
      .filter(validRecent)
      .map(displayMetadata)
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .filter((entry) => {
        const key = pathKey(entry.path);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Save display metadata only: no credentials, repository content, or demo paths. */
export function writeRecentRepositories(
  entries: RecentRepository[],
  storage?: RecentStorage,
): void {
  try {
    (storage ?? localStorage).setItem(
      RECENT_REPOSITORIES_KEY,
      JSON.stringify(entries.filter(validRecent).slice(0, MAX_RECENT).map(displayMetadata)),
    );
  } catch {
    /* Opening a repository still works when browser storage is unavailable. */
  }
}

export function rememberRepository(
  entries: RecentRepository[],
  repository: Pick<RepositorySnapshot, 'path' | 'name' | 'branch'>,
  now = Date.now(),
): RecentRepository[] {
  const next: RecentRepository = {
    path: repository.path,
    name: repository.name,
    branch: repository.branch,
    lastOpened: now,
  };
  if (!validRecent(next)) return entries;
  return [next, ...entries.filter((entry) => pathKey(entry.path) !== pathKey(next.path))].slice(
    0,
    MAX_RECENT,
  );
}

export function forgetRepository(entries: RecentRepository[], path: string): RecentRepository[] {
  return entries.filter((entry) => pathKey(entry.path) !== pathKey(path));
}
