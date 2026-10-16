export interface ChangedFile {
  path: string;
  status: string;
  staged: boolean;
  additions: number;
  deletions: number;
}
export interface Commit {
  id: string;
  summary: string;
  author: string;
  timestamp: number;
  parents: string[];
}
export interface Branch {
  name: string;
  target: string;
  current: boolean;
}
export interface RepositorySnapshot {
  path: string;
  name: string;
  branch: string;
  files: ChangedFile[];
  commits: Commit[];
  branches: Branch[];
  guardian: { kind: string; message: string } | null;
}
export interface CommandToken {
  text: string;
  explanation: string;
}
export interface GitLog {
  id: string;
  operationId: string;
  tokens: CommandToken[];
  status: 'running' | 'success' | 'error';
  message?: string;
  timestamp: number;
}
export interface FileDiff {
  original: string;
  modified: string;
  language: string;
}
export const isDesktop = () => '__TAURI_INTERNALS__' in window;
