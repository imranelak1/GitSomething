import { describe, expect, it } from 'vitest';
import { mergeLog } from './console';
import type { GitLog } from './types';
const log = (id: string, status: GitLog['status'] = 'running'): GitLog => ({
  id,
  status,
  operationId: id,
  tokens: [],
  timestamp: 0,
});
describe('streamed command history', () => {
  it('settles the original row even when operations finish out of order', () => {
    const pending = [log('a'), log('b')];
    const result = mergeLog(pending, log('a', 'success'));
    expect(result.map((row) => [row.id, row.status])).toEqual([
      ['a', 'success'],
      ['b', 'running'],
    ]);
    expect(pending[0].status).toBe('running');
  });
  it('bounds memory without discarding the newest command', () => {
    const result = mergeLog(
      Array.from({ length: 200 }, (_, i) => log(String(i))),
      log('latest'),
    );
    expect(result).toHaveLength(200);
    expect(result[0].id).toBe('1');
    expect(result.at(-1)?.id).toBe('latest');
  });
});
