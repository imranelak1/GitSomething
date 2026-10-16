import type { GitLog } from './types';

/** Backend emits running + settled updates with the same id. Keep one ordered row. */
export function mergeLog(logs: GitLog[], incoming: GitLog): GitLog[] {
  const existing = logs.findIndex((log) => log.id === incoming.id);
  if (existing !== -1) return logs.map((log, i) => (i === existing ? incoming : log));
  return [...logs, incoming].slice(-200);
}

export function displayError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
