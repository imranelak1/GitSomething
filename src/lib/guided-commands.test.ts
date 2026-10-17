import { describe, expect, it, vi } from 'vitest';
import {
  executeGuidedCommand,
  parseGuidedCommand,
  type GuidedCommandContext,
} from './guided-commands';
import { getLesson, LEARNING_LESSONS } from './learning';
import type { RepositorySnapshot } from './types';

const repository: RepositorySnapshot = {
  path: '/projects/orbit',
  name: 'orbit',
  branch: 'feature/teaching',
  files: [
    { path: 'src/a file.ts', status: 'modified', staged: false, additions: 1, deletions: 1 },
    { path: 'src/a file.ts', status: 'modified', staged: true, additions: 2, deletions: 1 },
    { path: 'new.ts', status: 'added', staged: false, additions: 1, deletions: 0 },
  ],
  commits: [
    {
      id: '1234567890abcdef',
      summary: 'Teach staging',
      author: 'Alex',
      timestamp: 1_700_000_000,
      parents: [],
    },
  ],
  branches: [
    { name: 'feature/teaching', target: '1234567890abcdef', current: true },
    { name: 'main', target: 'abc', current: false },
  ],
  guardian: null,
};

function context(overrides: Partial<GuidedCommandContext> = {}): GuidedCommandContext {
  return {
    repository: structuredClone(repository),
    demo: false,
    stage: vi.fn(async () => true),
    commit: vi.fn(async () => true),
    sync: vi.fn(async () => true),
    getDiff: vi.fn(async () => ({
      original: 'first\nold\nlast\n',
      modified: 'first\nnew\nlast\n',
      language: 'typescript',
    })),
    ...overrides,
  };
}

describe('guided command safety boundary', () => {
  it.each([
    'git status; git reset --hard',
    'git status && git push',
    'git log | cat',
    'git commit -m "$(whoami)"',
    'git commit -m "`whoami`"',
    'git status > output.txt',
    'git status\ngit push',
    'git status\u0000',
    'git reset --hard',
    'git push --force',
    'git push --force-with-lease',
    'git rebase main',
    'git branch new-branch',
    'git restore -- "new.ts"',
    'git add --all',
    'git add -- "*.ts"',
    'git add -- "../secret"',
    'git add -- "/etc/passwd"',
    'git add -- "C:\\secret"',
    'git add -- ".git/config"',
    'git add -- "foo/../../secret"',
    'git fetch https://example.com',
    'git pull origin',
    'git pull --ff-only origin',
    'git pull other-remote',
    'git -C elsewhere status',
    'echo hello',
  ])('rejects unsupported input without invoking any operation: %s', async (source) => {
    const current = context();
    expect((await executeGuidedCommand(source, current)).ok).toBe(false);
    expect(current.stage).not.toHaveBeenCalled();
    expect(current.commit).not.toHaveBeenCalled();
    expect(current.sync).not.toHaveBeenCalled();
    expect(current.getDiff).not.toHaveBeenCalled();
  });

  it('preserves quoted file paths and quoted messages without evaluation', () => {
    expect(parseGuidedCommand('git add -- "src/a file.ts"')).toEqual({
      kind: 'stage',
      path: 'src/a file.ts',
    });
    expect(parseGuidedCommand('git commit -m "Don\'t lose the user’s work"')).toEqual({
      kind: 'commit',
      message: "Don't lose the user’s work",
    });
    expect(parseGuidedCommand('git commit -m "Say \\"hello\\""')).toEqual({
      kind: 'commit',
      message: 'Say "hello"',
    });
  });

  it.each([
    '',
    'git commit -m "',
    'git commit -m ""',
    'git commit -m "a"b',
    'git add -- src/a file.ts',
  ])('gives actionable syntax errors for incomplete or ambiguous input: %s', async (source) => {
    const result = await executeGuidedCommand(source, context());
    expect(result.ok).toBe(false);
    expect(result.output.length).toBeGreaterThan(20);
  });
});

describe('guided reads and useful output', () => {
  it('distinguishes staged and working versions of the same path in short status', async () => {
    const result = await executeGuidedCommand('git status --short', context());
    expect(result.ok).toBe(true);
    expect(result.output).toContain('MM "src/a file.ts"');
    expect(result.output).toContain('?? "new.ts"');
    expect(result.output.split('src/a file.ts')).toHaveLength(2);
  });

  it('uses snapshot status without inventing remote synchronization information', async () => {
    const result = await executeGuidedCommand('git status', context());
    expect(result.output).toContain('On branch feature/teaching');
    expect(result.output).toContain('1 staged · 2 unstaged');
    expect(result.output).not.toMatch(/up.to.date|ahead|behind/i);
  });

  it('marks the current branch and labels history as a bounded loaded view', async () => {
    expect((await executeGuidedCommand('git branch', context())).output).toBe(
      '* feature/teaching\n  main',
    );
    const history = await executeGuidedCommand('git log --oneline', context());
    expect(history.output).toContain('1234567 Teach staging');
    expect(history.output).toContain('not a complete traversal');
  });

  it('reads the requested staged version and renders the actual changed text', async () => {
    const current = context();
    const result = await executeGuidedCommand('git diff --staged -- "src/a file.ts"', current);
    expect(current.getDiff).toHaveBeenCalledExactlyOnceWith('src/a file.ts', true);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('-old\n+new');
    expect(result.lessonId).toBe('diff');
  });

  it('reports native diff failures rather than fabricating file content', async () => {
    const result = await executeGuidedCommand(
      'git diff -- "src/a file.ts"',
      context({
        getDiff: vi.fn(async () => {
          throw new Error('Binary file cannot be displayed.');
        }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBe('Binary file cannot be displayed.');
  });

  it('does not pretend untracked files are included in git diff', async () => {
    const current = context();
    const result = await executeGuidedCommand('git diff -- "new.ts"', current);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Untracked files do not appear in git diff');
    expect(current.getDiff).not.toHaveBeenCalled();
  });

  it('keeps practice outputs explicit, including failures', async () => {
    const current = context({ demo: true });
    for (const command of ['git status', 'git reset --hard']) {
      expect((await executeGuidedCommand(command, current)).output).toContain(
        'Practice repository · your files and remote accounts are untouched.',
      );
    }
  });

  it('documents supported writes, safety limits, and output limits', async () => {
    const result = await executeGuidedCommand('help', context());
    expect(result.ok).toBe(true);
    expect(result.output).toContain('git restore --staged');
    expect(result.output).toContain('without a shell');
    expect(result.output).toContain('10 files and 300 lines');
  });

  it('bounds huge repository status while retaining the full change count', async () => {
    const current = context();
    current.repository.files = Array.from({ length: 5_000 }, (_, index) => ({
      path: `src/file-${index}.ts`,
      status: 'modified',
      staged: index % 2 === 0,
      additions: 1,
      deletions: 1,
    }));
    const short = await executeGuidedCommand('git status --short', current);
    expect(short.output.split('\n')).toHaveLength(501);
    expect(short.output).toContain('4500 more paths');
    const full = await executeGuidedCommand('git status', current);
    expect(full.output).toContain('2500 staged · 2500 unstaged');
    expect(full.output).not.toContain('src/file-4999.ts');
  });

  it('bounds diff reads, rendered lines, and total output for monorepos', async () => {
    const current = context({
      getDiff: vi.fn(async () => ({
        original: '',
        modified: 'x'.repeat(60_000),
        language: 'text',
      })),
    });
    current.repository.files = Array.from({ length: 20 }, (_, index) => ({
      path: `file-${index}.ts`,
      status: 'modified',
      staged: false,
      additions: 1,
      deletions: 1,
    }));
    const result = await executeGuidedCommand('git diff', current);
    expect(current.getDiff).toHaveBeenCalledTimes(10);
    expect(result.output.length).toBeLessThan(40_100);
    expect(result.output).toContain('Terminal output limited');
  });
});

describe('guided operations complete through existing callbacks', () => {
  it('stages and unstages the exact current file version with the hook’s state convention', async () => {
    const current = context();
    expect((await executeGuidedCommand('git add -- "src/a file.ts"', current)).ok).toBe(true);
    expect(current.stage).toHaveBeenLastCalledWith('src/a file.ts', false);
    expect(
      (await executeGuidedCommand('git restore --staged -- "src/a file.ts"', current)).ok,
    ).toBe(true);
    expect(current.stage).toHaveBeenLastCalledWith('src/a file.ts', true);
  });

  it('does not operate on a missing file or a version absent from the snapshot', async () => {
    const current = context();
    expect((await executeGuidedCommand('git add -- "missing.ts"', current)).ok).toBe(false);
    expect((await executeGuidedCommand('git restore --staged -- "new.ts"', current)).ok).toBe(
      false,
    );
    expect(current.stage).not.toHaveBeenCalled();
  });

  it('waits for completion and propagates failure without a success claim', async () => {
    let finish: ((completed: boolean) => void) | undefined;
    const current = context({
      stage: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    let settled = false;
    const pending = executeGuidedCommand('git add -- "new.ts"', current).then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish?.(false);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.output).toContain('did not complete');
    expect(result.output).not.toContain('Staged "new.ts"');
  });

  it('requires a staged file before committing and preserves the message', async () => {
    const current = context();
    const message = 'Explain the safe Git flow';
    expect((await executeGuidedCommand(`git commit -m "${message}"`, current)).ok).toBe(true);
    expect(current.commit).toHaveBeenCalledExactlyOnceWith(message);
    current.repository.files = [];
    expect((await executeGuidedCommand('git commit -m "Empty"', current)).ok).toBe(false);
    expect(current.commit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['git fetch origin', 'fetch'],
    ['git pull', 'pull'],
    ['git pull --ff-only', 'pull'],
    ['git push origin', 'push'],
  ] as const)('dispatches %s to the existing Git engine action', async (source, action) => {
    const current = context();
    expect((await executeGuidedCommand(source, current)).ok).toBe(true);
    expect(current.sync).toHaveBeenCalledExactlyOnceWith(action);
  });

  it('reports a failed sync as a failure', async () => {
    const result = await executeGuidedCommand(
      'git push',
      context({ sync: vi.fn(async () => false) }),
    );
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Push did not complete');
  });

  it('describes the actual configured upstream behavior of pull', async () => {
    const current = context();
    const result = await executeGuidedCommand('git pull', current);
    expect(result.output).toContain('configured upstream');
    expect(result.output).toContain('Fast-forward-only');
    const rejected = await executeGuidedCommand('git pull origin', current);
    expect(rejected.ok).toBe(false);
    expect(rejected.output).toContain('configured upstream');
    expect(current.sync).toHaveBeenCalledTimes(1);
    expect((await executeGuidedCommand('help', current)).output).toContain(
      'current branch’s configured upstream',
    );
  });
});

describe('contextual learning content', () => {
  it('has a distinct lesson for every supported concept and a safe fallback', () => {
    expect(new Set(LEARNING_LESSONS.map((lesson) => lesson.id)).size).toBe(6);
    for (const lesson of LEARNING_LESSONS) {
      expect(getLesson(lesson.id)).toBe(lesson);
      expect(lesson.explanation.length).toBeGreaterThan(50);
      expect(() => parseGuidedCommand(lesson.command)).not.toThrow();
    }
    expect(getLesson('unknown').id).toBe('safety');
    expect(getLesson('stage').tip).toContain('Your edits stay');
  });
});
