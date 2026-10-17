import { describe, expect, it } from 'vitest';
import {
  filterGitHubRepositories,
  isGitHubRepositoryUrl,
  mergeGitHubRepositories,
  selectGitHubRepositories,
  type GitHubRepository,
} from './github-repositories';

const repository = (
  id: number,
  name: string,
  changes: Partial<GitHubRepository> = {},
): GitHubRepository => ({
  id,
  name,
  fullName: `example/${name}`,
  description: null,
  private: false,
  archived: false,
  fork: false,
  defaultBranch: 'main',
  htmlUrl: `https://github.com/example/${name}`,
  cloneUrl: `https://github.com/example/${name}.git`,
  updatedAt: '2026-10-17T10:00:00Z',
  language: null,
  ownerLogin: 'example',
  ...changes,
});

describe('GitHub repository browsing boundaries', () => {
  it('filters only loaded metadata by name, description, or language, ignoring case and spacing', () => {
    const source = [
      repository(1, 'Terminal', { description: 'Educational Git tools', language: 'Rust' }),
      repository(2, 'Website', { language: 'TypeScript' }),
    ];
    expect(filterGitHubRepositories(source, '  terminal ')).toEqual([source[0]]);
    expect(filterGitHubRepositories(source, 'EDUCATIONAL')).toEqual([source[0]]);
    expect(filterGitHubRepositories(source, 'typescript')).toEqual([source[1]]);
    expect(filterGitHubRepositories(source, 'unloaded-project')).toEqual([]);
    expect(filterGitHubRepositories(source, ' ')).toBe(source);
  });

  it('deduplicates pagination by immutable repository ID and updates changed metadata', () => {
    const first = repository(1, 'original');
    const second = repository(2, 'second');
    const renamed = repository(1, 'renamed', { private: true });
    const incoming = [renamed, repository(3, 'third')];
    expect(mergeGitHubRepositories([first, second], incoming)).toEqual([
      renamed,
      second,
      incoming[1],
    ]);
    expect(first.name).toBe('original');
    expect(incoming).toHaveLength(2);
  });

  it('combines visibility with multi-term metadata search without disclosing other matches', () => {
    const source = [
      repository(1, 'git-guide', { private: true, language: 'Rust' }),
      repository(2, 'public-guide', { description: 'A guide to Rust' }),
      repository(3, 'private-web', { private: true, language: 'TypeScript' }),
    ];
    expect(selectGitHubRepositories(source, 'guide RUST', 'private', 'updated')).toEqual([
      source[0],
    ]);
    expect(selectGitHubRepositories(source, 'rust', 'public', 'updated')).toEqual([source[1]]);
    expect(selectGitHubRepositories(source, 'missing', 'all', 'name')).toEqual([]);
  });

  it('sorts names and update times deterministically without changing pagination source order', () => {
    const source = [
      repository(4, 'zebra', { updatedAt: 'not-a-date' }),
      repository(3, 'project10', { updatedAt: '2026-10-16T10:00:00Z' }),
      repository(2, 'project2', { updatedAt: '2026-10-17T10:00:00Z' }),
      repository(1, 'Alpha', { updatedAt: '2026-10-17T10:00:00Z' }),
    ];
    const originalOrder = [...source];
    expect(selectGitHubRepositories(source, '', 'all', 'name').map((item) => item.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(selectGitHubRepositories(source, '', 'all', 'updated').map((item) => item.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(source).toEqual(originalOrder);
    expect(
      selectGitHubRepositories(
        [repository(2, 'same'), repository(1, 'same')],
        '',
        'all',
        'updated',
      ).map((item) => item.id),
    ).toEqual([1, 2]);
  });

  it('allows only HTTPS GitHub repository destinations without credentials, query, or fragments', () => {
    for (const url of [
      'https://github.com/example/project',
      'https://github.com/example/project.name-1_2/',
    ])
      expect(isGitHubRepositoryUrl(url), url).toBe(true);

    for (const url of [
      'javascript:alert(1)',
      'http://github.com/example/project',
      'https://github.com.evil.invalid/example/project',
      'https://example.invalid/example/project',
      'https://secret@github.com/example/project',
      'https://github.com:8443/example/project',
      'https://github.com/example/project?token=secret',
      'https://github.com/example/project#readme',
      'https://github.com/example/project/issues',
      'https://github.com/settings',
      'https://github.com/example/%0aproject',
      '/example/project',
    ])
      expect(isGitHubRepositoryUrl(url), url).toBe(false);
  });
});
