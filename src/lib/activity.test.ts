import { describe, expect, it } from 'vitest';
import { mergeActivity, safeActivityText, type ActivityEvent } from './activity';

const entry = (id: string): ActivityEvent => ({
  id,
  kind: 'command',
  label: 'Guided command',
  description: 'Run through the Git engine.',
  timestamp: 10,
  status: 'running',
});

describe('in-memory learning activity', () => {
  it('redacts provider credentials and remote URL passwords before storing or copying activity', () => {
    const events = mergeActivity([], {
      ...entry('a'),
      command: 'git push https://alice:password@github.com/alice/project ghp_example123',
      output: 'Authorization: Bearer private-value github_pat_example456 glpat-example789',
    });
    const serialized = JSON.stringify(events);
    for (const secret of [
      'password',
      'ghp_example123',
      'private-value',
      'github_pat_example456',
      'glpat-example789',
    ])
      expect(serialized).not.toContain(secret);
    expect(events[0].command).toContain('https://[redacted]@github.com');
    expect(safeActivityText('git commit -m "Improve search"')).toBe(
      'git commit -m "Improve search"',
    );
  });

  it('settles a command in place while preserving the request time and newer actions', () => {
    const request = entry('request');
    const newer = { ...entry('newer'), kind: 'interface' as const, timestamp: 20 };
    const result = mergeActivity([request, newer], {
      ...request,
      status: 'error',
      output: 'No changes staged.',
    });
    expect(result.map((event) => [event.id, event.status, event.timestamp])).toEqual([
      ['request', 'error', 10],
      ['newer', 'running', 20],
    ]);
    expect(request.status).toBe('running');
  });

  it('bounds the activity stream to 200 entries and retains the latest request', () => {
    const events = mergeActivity(
      Array.from({ length: 200 }, (_, i) => entry(String(i))),
      entry('last'),
    );
    expect(events).toHaveLength(200);
    expect(events[0].id).toBe('1');
    expect(events.at(-1)?.id).toBe('last');
  });
});
