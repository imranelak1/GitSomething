import { describe, expect, it } from 'vitest';
import {
  forgetRepository,
  readRecentRepositories,
  rememberRepository,
  writeRecentRepositories,
} from './recent-repositories';

const entry = (path: string, lastOpened = 1) => ({
  path,
  name: 'project',
  branch: 'main',
  lastOpened,
});
describe('recent repository metadata', () => {
  it('ignores malformed storage, remote URLs, and invalid timestamps', () => {
    const values = [
      null,
      {},
      [entry('https://example.com/project')],
      [entry('/tmp/repo', -1)],
      [entry('/tmp/repo', Infinity)],
    ];
    for (const value of values)
      expect(
        readRecentRepositories({ getItem: () => JSON.stringify(value), setItem() {} }),
      ).toEqual([]);
    expect(readRecentRepositories({ getItem: () => '{invalid', setItem() {} })).toEqual([]);
  });
  it('deduplicates Windows paths while keeping distinct case-sensitive Unix paths', () => {
    const existing = [entry('C:\\Code\\Project'), entry('/code/Project'), entry('/code/project')];
    const updated = rememberRepository(
      existing,
      { path: 'c:/code/project', name: 'renamed', branch: 'feature/home' },
      100,
    );
    expect(updated).toHaveLength(3);
    expect(updated[0]).toEqual({
      path: 'c:/code/project',
      name: 'renamed',
      branch: 'feature/home',
      lastOpened: 100,
    });
    expect(forgetRepository(updated, 'C:\\Code\\Project')).toHaveLength(2);
  });
  it('bounds recents to eight successful openings and sorts loaded entries newest first', () => {
    let entries = [] as ReturnType<typeof readRecentRepositories>;
    for (let i = 0; i < 12; i++) entries = rememberRepository(entries, entry(`/projects/${i}`), i);
    expect(entries).toHaveLength(8);
    expect(entries.at(-1)?.path).toBe('/projects/4');
    const storage = { getItem: () => JSON.stringify([...entries].reverse()), setItem() {} };
    expect(readRecentRepositories(storage)[0].path).toBe('/projects/11');
  });
  it('keeps only repository display metadata and survives blocked storage', () => {
    let saved = '';
    const supplied = {
      ...entry('/projects/app'),
      token: 'do-not-persist-this',
      files: ['private-content'],
    };
    writeRecentRepositories([supplied], {
      getItem: () => null,
      setItem: (_key, value) => {
        saved = value;
      },
    });
    expect(Object.keys(JSON.parse(saved)[0]).sort()).toEqual([
      'branch',
      'lastOpened',
      'name',
      'path',
    ]);
    const loaded = readRecentRepositories({
      getItem: () => JSON.stringify([supplied]),
      setItem() {},
    });
    expect(Object.keys(loaded[0]).sort()).toEqual(['branch', 'lastOpened', 'name', 'path']);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readRecentRepositories(blocked)).toEqual([]);
    expect(() => writeRecentRepositories([entry('/projects/app')], blocked)).not.toThrow();
  });
});
