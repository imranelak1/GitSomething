import type { ChangedFile, FileDiff, RepositorySnapshot } from './types';
import type { LessonId } from './learning';

export interface GuidedCommandContext {
  repository: RepositorySnapshot;
  demo: boolean;
  /** The boolean describes the file's current state: false stages, true unstages. */
  stage: (path: string, currentlyStaged: boolean) => Promise<boolean>;
  commit: (message: string) => Promise<boolean>;
  sync: (action: 'fetch' | 'pull' | 'push') => Promise<boolean>;
  getDiff: (path: string, staged: boolean) => Promise<FileDiff>;
}

export interface TerminalResult {
  ok: boolean;
  output: string;
  lessonId?: LessonId;
}

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'status'; short: boolean }
  | { kind: 'log'; oneline: boolean }
  | { kind: 'branch' }
  | { kind: 'diff'; staged: boolean; path?: string }
  | { kind: 'stage' | 'unstage'; path: string }
  | { kind: 'commit'; message: string }
  | { kind: 'sync'; action: 'fetch' | 'pull' | 'push' };

export class GuidedCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuidedCommandError';
  }
}

/** A deliberately small tokenizer. These values are never passed to a shell. */
function tokenize(source: string): string[] {
  if (!source.trim()) throw new GuidedCommandError('Type a command, or type help to see examples.');
  if (source.length > 4096) throw new GuidedCommandError('Keep commands under 4,096 characters.');
  if (/[\x00-\x1f\x7f]/.test(source)) {
    throw new GuidedCommandError(
      'Enter one command on one line. Control characters are unsupported.',
    );
  }
  if (/[;&|`<>$()]/.test(source)) {
    throw new GuidedCommandError(
      'Shell operators and substitutions are unsupported. Run one guided Git command at a time.',
    );
  }
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let started = false;
  let closedQuote = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote) {
        quote = null;
        closedQuote = true;
      } else if (
        character === '\\' &&
        (source[index + 1] === quote || source[index + 1] === '\\')
      ) {
        token += source[++index];
      } else {
        token += character;
      }
    } else if (/\s/.test(character)) {
      if (started) tokens.push(token);
      token = '';
      started = false;
      closedQuote = false;
    } else if (character === '"' || character === "'") {
      if (started)
        throw new GuidedCommandError('Put quotes around the whole file path or message.');
      quote = character;
      started = true;
    } else {
      if (closedQuote) throw new GuidedCommandError('Add a space after a quoted value.');
      token += character;
      started = true;
    }
  }
  if (quote) throw new GuidedCommandError('Close the quote around your file path or message.');
  if (started) tokens.push(token);
  return tokens;
}

function syntax(example: string): never {
  throw new GuidedCommandError(`Use ${example}. Type help for all supported commands.`);
}

function checkedPath(path: string): string {
  if (
    !path ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    /^[a-z]:/i.test(path) ||
    /[*?\[\]]/.test(path) ||
    path
      .split(/[\\/]/)
      .some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git')
  ) {
    throw new GuidedCommandError(
      'Choose one exact file path from Changes. Folders, globs, and paths outside the repository are unsupported.',
    );
  }
  return path;
}

export function parseGuidedCommand(source: string): ParsedCommand {
  const tokens = tokenize(source);
  if (tokens.length === 1 && tokens[0] === 'help') return { kind: 'help' };
  if (tokens[0] !== 'git')
    throw new GuidedCommandError(
      'Start with git, or type help. This is a guided Git terminal, not a shell.',
    );
  const [, command, ...args] = tokens;
  switch (command) {
    case 'status':
      if (!args.length || (args.length === 1 && args[0] === '--short')) {
        return { kind: 'status', short: args[0] === '--short' };
      }
      return syntax('git status [--short]');
    case 'log':
      if (!args.length || (args.length === 1 && args[0] === '--oneline')) {
        return { kind: 'log', oneline: args[0] === '--oneline' };
      }
      return syntax('git log [--oneline]');
    case 'branch':
      if (!args.length) return { kind: 'branch' };
      return syntax('git branch to list branches');
    case 'diff': {
      const staged = args[0] === '--staged';
      const remainder = staged ? args.slice(1) : args;
      if (!remainder.length) return { kind: 'diff', staged };
      if (remainder.length === 2 && remainder[0] === '--') {
        return { kind: 'diff', staged, path: checkedPath(remainder[1]) };
      }
      return syntax('git diff [--staged] [-- "path/to/file"]');
    }
    case 'add':
      if (args.length === 2 && args[0] === '--') {
        return { kind: 'stage', path: checkedPath(args[1]) };
      }
      return syntax('git add -- "path/to/file" to stage one changed file');
    case 'restore':
      if (args.length === 3 && args[0] === '--staged' && args[1] === '--') {
        return { kind: 'unstage', path: checkedPath(args[2]) };
      }
      return syntax('git restore --staged -- "path/to/file" to keep edits and unstage the file');
    case 'commit':
      if (args.length === 2 && args[0] === '-m' && args[1].trim()) {
        return { kind: 'commit', message: args[1] };
      }
      return syntax('git commit -m "Describe what changed"');
    case 'fetch':
    case 'push':
      if (!args.length || (args.length === 1 && args[0] === 'origin')) {
        return { kind: 'sync', action: command };
      }
      return syntax(`git ${command} [origin]`);
    case 'pull': {
      if (!args.length || (args.length === 1 && args[0] === '--ff-only')) {
        return { kind: 'sync', action: 'pull' };
      }
      return syntax('git pull [--ff-only] to pull from the current branch’s configured upstream');
    }
    default:
      throw new GuidedCommandError(
        `That Git command is unavailable here. Type help for the supported commands. History rewriting and force operations require a separate preview.`,
      );
  }
}

function help(): string {
  return [
    'Guided Git · runs through the Git engine, without a shell',
    '',
    'Read your repository',
    '  git status [--short]             See changed and staged files',
    '  git log [--oneline]              Read recent loaded commits',
    '  git branch                      List loaded branches',
    '  git diff [--staged] [-- "file"]  Compare changed text',
    '',
    'Save and share',
    '  git add -- "path/to/file"        Stage one exact changed file',
    '  git restore --staged -- "file"   Unstage; keep your edits',
    '  git commit -m "Your message"     Commit staged changes locally',
    '  git fetch [origin]              Check for remote commits',
    '  git pull [--ff-only]             Pull the configured upstream safely',
    '  git push [origin]               Upload local commits',
    '',
    'Use quotes for spaces. Reads use the current Branchline snapshot.',
    'Pull uses the current branch’s configured upstream, always with --ff-only.',
    'Status shows at most 500 rows; history shows 30 loaded commits.',
    'Diff output includes at most 10 files and 300 lines per file.',
    'All terminal output is limited to 40,000 characters.',
    'Reset, force push, scripts, and command chains are unavailable.',
  ].join('\n');
}

function statusCode(file: ChangedFile): string {
  switch (file.status) {
    case 'added':
    case 'new':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'conflicted':
      return 'U';
    default:
      return 'M';
  }
}

function statusOutput(repository: RepositorySnapshot, short: boolean): string {
  const { files } = repository;
  if (short) {
    const paths = new Map<string, { staged?: ChangedFile; working?: ChangedFile }>();
    for (const file of files) {
      const entry = paths.get(file.path) ?? {};
      if (file.staged) entry.staged = file;
      else entry.working = file;
      paths.set(file.path, entry);
    }
    const lines = [...paths.entries()].slice(0, 500).map(([path, { staged, working }]) => {
      const code =
        working?.status === 'conflicted'
          ? 'UU'
          : !staged && working && ['new', 'added'].includes(working.status)
            ? '??'
            : `${staged ? statusCode(staged) : ' '}${working ? statusCode(working) : ' '}`;
      return `${code} ${JSON.stringify(path)}`;
    });
    if (paths.size > 500)
      lines.push(`… ${paths.size - 500} more paths. Status is limited to 500 rows.`);
    return lines.join('\n') || 'Working directory clean.';
  }
  const stagedCount = files.reduce((count, file) => count + Number(file.staged), 0);
  const workingCount = files.length - stagedCount;
  const visible = files.slice(0, 500);
  const staged = visible.filter((file) => file.staged);
  const working = visible.filter((file) => !file.staged);
  const lines = [`On branch ${repository.branch}`, ''];
  if (staged.length)
    lines.push(
      'Selected for the next commit:',
      ...staged.map((file) => `  ${file.status.padEnd(10)} ${file.path}`),
      '',
    );
  if (working.length)
    lines.push(
      'Changes outside the next commit:',
      ...working.map((file) => `  ${file.status.padEnd(10)} ${file.path}`),
      '',
    );
  if (!files.length) lines.push('Working directory clean. Nothing to commit.');
  else lines.push(`${stagedCount} staged · ${workingCount} unstaged`);
  if (files.length > 500)
    lines.push(`… ${files.length - 500} more changes. Status is limited to 500 rows.`);
  if (repository.guardian) lines.push('', `Guardian: ${repository.guardian.message}`);
  return lines.join('\n');
}

function logOutput(repository: RepositorySnapshot, oneline: boolean): string {
  const commits = repository.commits.slice(0, 30);
  if (!commits.length) return 'No commits are loaded. Stage a file and make your first commit.';
  const lines = commits.map((commit) => {
    if (oneline) return `${commit.id.slice(0, 7)} ${commit.summary}`;
    const date = new Date(commit.timestamp * 1000);
    return `commit ${commit.id}\nAuthor: ${commit.author}\nDate: ${Number.isNaN(date.getTime()) ? 'Unknown' : date.toISOString()}\n\n    ${commit.summary}`;
  });
  return `${lines.join(oneline ? '\n' : '\n\n')}\n\n${commits.length} recent loaded commit${commits.length === 1 ? '' : 's'} shown. This is not a complete traversal.`;
}

function exactFile(repository: RepositorySnapshot, path: string, staged: boolean): ChangedFile {
  const file = repository.files.find((entry) => entry.path === path && entry.staged === staged);
  if (!file) {
    throw new GuidedCommandError(
      `No ${staged ? 'staged' : 'unstaged'} change matches ${JSON.stringify(path)}. Run git status and copy an exact path.`,
    );
  }
  return file;
}

function linesOf(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** A compact replacement preview; bounded for a terminal, not an exported patch. */
function textDiff(path: string, diff: FileDiff): string {
  if (diff.original === diff.modified) return `${path}: no textual differences.`;
  const before = linesOf(diff.original);
  const after = linesOf(diff.modified);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const start = Math.max(0, prefix - 3);
  const endBefore = Math.min(before.length, before.length - suffix + 3);
  const endAfter = Math.min(after.length, after.length - suffix + 3);
  const body = [
    ...before.slice(start, prefix).map((line) => ` ${line}`),
    ...before.slice(prefix, before.length - suffix).map((line) => `-${line}`),
    ...after.slice(prefix, after.length - suffix).map((line) => `+${line}`),
    ...after.slice(after.length - suffix, endAfter).map((line) => ` ${line}`),
  ];
  if (diff.original.endsWith('\n') !== diff.modified.endsWith('\n')) {
    body.push('\\ Final newline changed.');
  }
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${before.length ? start + 1 : 0},${endBefore - start} +${after.length ? start + 1 : 0},${endAfter - start} @@`,
    ...body.slice(0, 300),
    ...(body.length > 300
      ? ['… Preview limited to 300 lines. Use the diff viewer for the full file.']
      : []),
  ].join('\n');
}

export async function executeGuidedCommand(
  source: string,
  context: GuidedCommandContext,
): Promise<TerminalResult> {
  const practice = context.demo
    ? 'Practice repository · your files and remote accounts are untouched.\n\n'
    : '';
  const result = (ok: boolean, output: string, lessonId: LessonId): TerminalResult => ({
    ok,
    output:
      practice +
      (output.length > 40_000
        ? `${output.slice(0, 40_000)}\n… Terminal output limited. Use the workspace to read more.`
        : output),
    lessonId,
  });
  let lessonId: LessonId = 'safety';
  try {
    const command = parseGuidedCommand(source);
    switch (command.kind) {
      case 'help':
        return result(true, help(), 'safety');
      case 'status':
        return result(true, statusOutput(context.repository, command.short), 'stage');
      case 'log':
        return result(true, logOutput(context.repository, command.oneline), 'commit');
      case 'branch':
        return result(
          true,
          context.repository.branches
            .slice(0, 500)
            .map((branch) => `${branch.current ? '*' : ' '} ${branch.name}`)
            .concat(
              context.repository.branches.length > 500
                ? ['… Branch list limited to 500 rows.']
                : [],
            )
            .join('\n') || `No branch references yet. Current branch: ${context.repository.branch}`,
          'branch',
        );
      case 'diff': {
        lessonId = 'diff';
        const files = command.path
          ? [exactFile(context.repository, command.path, command.staged)]
          : context.repository.files.filter((file) => file.staged === command.staged);
        // Git diff excludes untracked files. Do not teach the viewer's broader
        // "preview any file" behavior as if it were the CLI's behavior.
        const tracked = files.filter(
          (file) => command.staged || !['new', 'added'].includes(file.status),
        );
        if (!tracked.length)
          return result(
            true,
            files.length
              ? 'Untracked files do not appear in git diff. Stage a new file, then use git diff --staged to review it.'
              : `No ${command.staged ? 'staged' : 'unstaged'} changes to compare.`,
            lessonId,
          );
        const outputs: string[] = [];
        for (const file of tracked.slice(0, 10)) {
          outputs.push(textDiff(file.path, await context.getDiff(file.path, command.staged)));
        }
        if (tracked.length > 10)
          outputs.push(
            `… ${tracked.length - 10} more changed files. Use -- "path/to/file" to read one.`,
          );
        return result(true, outputs.join('\n\n'), lessonId);
      }
      case 'stage':
      case 'unstage': {
        lessonId = 'stage';
        const staged = command.kind === 'unstage';
        exactFile(context.repository, command.path, staged);
        const completed = await context.stage(command.path, staged);
        return result(
          completed,
          completed
            ? `${staged ? 'Unstaged' : 'Staged'} ${JSON.stringify(command.path)}. ${staged ? 'Your working edits are still here.' : 'Its current version is selected for the next commit.'}`
            : 'The file action did not complete. Read its matching Git error row in the action log, or wait if another action is running. Refresh Changes before trying again.',
          lessonId,
        );
      }
      case 'commit': {
        lessonId = 'commit';
        if (!context.repository.files.some((file) => file.staged)) {
          throw new GuidedCommandError(
            'Nothing is staged. Select a file with git add -- "path/to/file", then commit.',
          );
        }
        const completed = await context.commit(command.message);
        return result(
          completed,
          completed
            ? `Saved a local commit: ${command.message}\nPush when you are ready to share it.`
            : 'The commit did not complete. Read its matching Git error row in the action log, or wait if another action is running. Your files are still in the workspace.',
          lessonId,
        );
      }
      case 'sync': {
        lessonId = 'sync';
        const completed = await context.sync(command.action);
        const success = {
          fetch:
            'Fetch completed. Remote references were checked; your working files were not merged.',
          pull: 'Fast-forward-only pull from the configured upstream completed. The branch advanced only if the histories were compatible.',
          push: 'Push completed. Local commits were uploaded; uncommitted edits stay on your computer.',
        };
        return result(
          completed,
          completed
            ? success[command.action]
            : `${command.action[0].toUpperCase()}${command.action.slice(1)} did not complete. Read its matching Git error row in the action log for authentication, remote, or history details, or wait if another action is running.`,
          lessonId,
        );
      }
    }
  } catch (error) {
    return result(false, error instanceof Error ? error.message : String(error), lessonId);
  }
}
