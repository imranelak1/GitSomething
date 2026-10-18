import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_ANONYMOUS_ID_KEY,
  ANALYTICS_MODE_KEY,
  createAnalyticsClient,
  type AnalyticsDependencies,
  type AnalyticsEvent,
  type AnalyticsMode,
  type AnalyticsPayload,
  type AnalyticsProperties,
} from './analytics';

const EVENT = 'gitsomething git action' as const;
function harness(
  options: {
    savedMode?: string;
    values?: Map<string, string>;
    eligible?: boolean;
    configured?: boolean;
    blockedStorage?: boolean;
    send?: AnalyticsDependencies['send'];
    randomUuid?: AnalyticsDependencies['randomUuid'];
  } = {},
) {
  const values = options.values ?? new Map<string, string>();
  if (options.savedMode) values.set(ANALYTICS_MODE_KEY, options.savedMode);
  let ids = 0;
  const send = vi.fn(options.send ?? (async () => undefined));
  const randomUuid = vi.fn(
    options.randomUuid ?? (() => '00000000-0000-4000-8000-' + String(++ids).padStart(12, '0')),
  );
  const client = createAnalyticsClient({
    isProductionDesktop: () => options.eligible ?? true,
    configured: options.configured ?? true,
    storage: () => {
      if (options.blockedStorage) throw new Error('Storage denied');
      return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
      };
    },
    randomUuid,
    send,
  });
  return { ...client, values, send, randomUuid };
}
function pendingSend(_payload: AnalyticsPayload, signal: AbortSignal): Promise<unknown> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });
}
async function settle() {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}
afterEach(() => vi.useRealTimers());

describe('manual desktop analytics privacy', () => {
  it('defaults off with no identifiers or requests before consent', () => {
    const c = harness();
    c.setAnalyticsAccount('example-user');
    c.trackEvent('gitsomething app opened');
    expect(c.getAnalyticsMode()).toBe('off');
    expect(c.send).not.toHaveBeenCalled();
    expect(c.randomUuid).not.toHaveBeenCalled();
    expect(c.values.has(ANALYTICS_ANONYMOUS_ID_KEY)).toBe(false);
  });
  it('validates persisted and runtime modes and notifies a synchronous subscription store', () => {
    for (const savedMode of ['true', 'on', '{"mode":"anonymous"}', 'IDENTIFIED'])
      expect(harness({ savedMode }).getAnalyticsMode()).toBe('off');
    const c = harness({ eligible: false });
    const listener = vi.fn();
    const unsubscribe = c.subscribeAnalyticsMode(listener);
    c.setAnalyticsMode('anonymous');
    expect(c.getAnalyticsMode()).toBe('anonymous');
    expect(listener).toHaveBeenCalledOnce();
    c.setAnalyticsMode('anonymous');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    c.setAnalyticsMode('unexpected' as AnalyticsMode);
    expect(c.getAnalyticsMode()).toBe('off');
    expect(listener).toHaveBeenCalledOnce();
  });
  it('excludes browser/development runtimes and missing configuration even after consent', () => {
    for (const options of [{ eligible: false }, { configured: false }]) {
      const c = harness(options);
      c.setAnalyticsMode('identified');
      c.setAnalyticsAccount('example-user');
      c.trackEvent(EVENT, { action: 'push' });
      expect(c.send).not.toHaveBeenCalled();
      expect(c.randomUuid).not.toHaveBeenCalled();
      expect(c.values.has(ANALYTICS_ANONYMOUS_ID_KEY)).toBe(false);
    }
  });
  it('constructs a minimal payload and strips repository, path, message, error and browser context', () => {
    const c = harness();
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT, {
      action: 'stage',
      outcome: 'success',
      source: 'local',
      path: '/fixture/file.ts',
      branch: 'fixture branch',
      repository: 'fixture repository',
      message: 'fixture text',
      error: 'fixture error',
      terminal: 'fixture command',
      $set: { email: 'fixture@example.invalid' },
      $current_url: 'fixture URL',
      timestamp: 'fixture timestamp',
    } as AnalyticsProperties);
    const payload = c.send.mock.calls[0][0];
    expect(payload).toEqual({
      api_key: expect.stringMatching(/^phc_/),
      event: EVENT,
      distinct_id: expect.stringMatching(/^gitsomething:anonymous:/),
      timestamp: expect.any(String),
      properties: {
        action: 'stage',
        outcome: 'success',
        source: 'local',
        app_name: 'GitSomething',
        app_version: expect.any(String),
        runtime: 'desktop',
        channel: 'beta',
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
    expect(Number.isFinite(Date.parse(payload.timestamp))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('fixture');
  });
  it('rejects automatic/unlisted events and invalid enum values despite runtime type bypasses', () => {
    const c = harness({ savedMode: 'anonymous' });
    for (const event of [
      'arbitrary event',
      '$autocapture',
      '$pageview',
      '$exception',
      '$identify',
      '$set',
      '$opt_in',
    ])
      c.trackEvent(event as AnalyticsEvent);
    expect(c.send).not.toHaveBeenCalled();
    c.trackEvent(EVENT, {
      action: 'fixture text',
      outcome: 'unknown',
      provider: 'github',
    } as unknown as AnalyticsProperties);
    const p = c.send.mock.calls[0][0].properties;
    expect(p).toMatchObject({ provider: 'github' });
    expect(p).not.toHaveProperty('action');
    expect(p).not.toHaveProperty('outcome');
  });
  it('retains an anonymous install ID across launches and rotates after opt-out', () => {
    const a = harness();
    a.setAnalyticsMode('anonymous');
    a.trackEvent(EVENT);
    const old = a.send.mock.calls[0][0].distinct_id;
    const b = harness({ values: a.values });
    b.trackEvent(EVENT);
    expect(b.send.mock.calls[0][0].distinct_id).toBe(old);
    a.setAnalyticsMode('off');
    expect(a.values.has(ANALYTICS_ANONYMOUS_ID_KEY)).toBe(false);
    a.setAnalyticsMode('anonymous');
    a.trackEvent(EVENT);
    expect(a.send.mock.calls[1][0].distinct_id).not.toBe(old);
  });
  it('never identifies anonymous usage even when the app knows a public GitHub login', () => {
    const c = harness();
    c.setAnalyticsAccount('Example-User');
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    const p = c.send.mock.calls[0][0];
    expect(p.properties.$process_person_profile).toBe(false);
    expect(p.properties).not.toHaveProperty('$set');
    expect(JSON.stringify(p)).not.toContain('example-user');
  });
  it('shares only a validated public login on future explicitly identified events', () => {
    const c = harness();
    c.setAnalyticsAccount('Example-User');
    c.setAnalyticsMode('identified');
    expect(c.send).not.toHaveBeenCalled();
    c.trackEvent('gitsomething github connected');
    const p = c.send.mock.calls[0][0];
    expect(p.distinct_id).toBe('gitsomething:github:example-user');
    expect(p.properties.$process_person_profile).toBe(true);
    expect(p.properties.$set).toEqual({ github_login: 'example-user' });
    expect(JSON.stringify(p)).not.toContain('email');
    expect(JSON.stringify(p)).not.toContain('$anon_distinct_id');
  });
  it('never links past anonymous history when enabling or leaving named sharing', () => {
    const c = harness();
    c.setAnalyticsAccount('example-user');
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    const prior = c.send.mock.calls[0][0].distinct_id;
    c.setAnalyticsMode('identified');
    c.trackEvent('gitsomething guide opened');
    const named = c.send.mock.calls[1][0];
    expect(named.distinct_id).toBe('gitsomething:github:example-user');
    expect(JSON.stringify(named)).not.toContain(prior);
    expect(JSON.stringify(named)).not.toContain('$anon_distinct_id');
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    expect(c.send.mock.calls[2][0].distinct_id).not.toBe(prior);
    expect(JSON.stringify(c.send.mock.calls[2][0])).not.toContain('example-user');
  });
  it('aborts every in-flight request and removes identity immediately on opt-out', async () => {
    const c = harness({ send: pendingSend });
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    c.trackEvent('gitsomething guide opened');
    const signals = c.send.mock.calls.map((call) => call[1]);
    expect(signals.every((s) => !s.aborted)).toBe(true);
    c.setAnalyticsMode('off');
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(c.values.has(ANALYTICS_ANONYMOUS_ID_KEY)).toBe(false);
    c.trackEvent(EVENT);
    await settle();
    expect(c.send).toHaveBeenCalledTimes(2);
  });
  it('aborts named requests on disconnect and removes that identity from subsequent usage', async () => {
    const c = harness({ send: pendingSend });
    c.setAnalyticsAccount('example-user');
    c.setAnalyticsMode('identified');
    c.trackEvent(EVENT);
    const signal = c.send.mock.calls[0][1];
    c.setAnalyticsAccount(null);
    expect(signal.aborted).toBe(true);
    c.trackEvent('gitsomething github disconnected');
    const next = c.send.mock.calls[1][0];
    expect(next.distinct_id).toMatch(/^gitsomething:anonymous:/);
    expect(next.properties.$process_person_profile).toBe(false);
    expect(JSON.stringify(next)).not.toContain('example-user');
    c.setAnalyticsMode('off');
    await settle();
  });
  it('isolates account switches while ignoring identical normalized login and mode updates', async () => {
    const c = harness({ send: pendingSend });
    c.setAnalyticsMode('identified');
    c.setAnalyticsAccount('first-user');
    c.trackEvent(EVENT);
    const signal = c.send.mock.calls[0][1];
    c.setAnalyticsAccount('FIRST-USER');
    c.setAnalyticsMode('identified');
    expect(signal.aborted).toBe(false);
    c.setAnalyticsAccount('second-user');
    expect(signal.aborted).toBe(true);
    c.trackEvent(EVENT);
    expect(c.send.mock.calls[1][0].distinct_id).toBe('gitsomething:github:second-user');
    expect(JSON.stringify(c.send.mock.calls[1][0])).not.toContain('first-user');
    c.setAnalyticsMode('off');
    await settle();
  });
  it('never retries failed requests after opting out or re-enabling', async () => {
    vi.useFakeTimers();
    const c = harness({
      send: async () => {
        throw new Error('Network unavailable');
      },
    });
    c.setAnalyticsMode('anonymous');
    expect(() => c.trackEvent(EVENT)).not.toThrow();
    await settle();
    c.setAnalyticsMode('off');
    c.setAnalyticsMode('anonymous');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.send).toHaveBeenCalledOnce();
  });
  it('aborts stalled requests at five seconds without queuing a retry', async () => {
    vi.useFakeTimers();
    const c = harness({ send: pendingSend });
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    const signal = c.send.mock.calls[0][1];
    await vi.advanceTimersByTimeAsync(4999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.send).toHaveBeenCalledOnce();
  });
  it('maintains consent and stable IDs in memory when localStorage is denied', () => {
    const c = harness({ blockedStorage: true });
    c.setAnalyticsMode('anonymous');
    c.trackEvent(EVENT);
    c.trackEvent('gitsomething guide opened');
    expect(c.getAnalyticsMode()).toBe('anonymous');
    expect(c.send.mock.calls[0][0].distinct_id).toBe(c.send.mock.calls[1][0].distinct_id);
  });
  it('rejects invalid login and stored identity data, and refuses non-random ID fallback', () => {
    for (const login of [
      'fixture@example.invalid',
      'https://github.com/example',
      'a--b',
      '-user',
      'user-',
      'a'.repeat(40),
    ]) {
      const c = harness();
      c.setAnalyticsAccount(login);
      c.setAnalyticsMode('identified');
      c.trackEvent(EVENT);
      const p = c.send.mock.calls[0][0];
      expect(p.distinct_id).toMatch(/^gitsomething:anonymous:/);
      expect(p.properties.$process_person_profile).toBe(false);
      expect(p.properties).not.toHaveProperty('$set');
      expect(JSON.stringify(p)).not.toContain(login);
    }
    const c = harness({
      values: new Map([[ANALYTICS_ANONYMOUS_ID_KEY, 'fixture user-provided ID']]),
      savedMode: 'anonymous',
    });
    c.trackEvent(EVENT);
    expect(c.send.mock.calls[0][0].distinct_id).toMatch(/^gitsomething:anonymous:/);
    const missing = harness({ randomUuid: () => undefined });
    missing.setAnalyticsMode('anonymous');
    missing.trackEvent(EVENT);
    expect(missing.send).not.toHaveBeenCalled();
  });
  it('snapshots enum data and contains transport and subscriber failures', () => {
    const c = harness();
    c.subscribeAnalyticsMode(() => {
      throw new Error('Subscriber failed');
    });
    const listener = vi.fn();
    c.subscribeAnalyticsMode(listener);
    c.setAnalyticsMode('anonymous');
    expect(listener).toHaveBeenCalledOnce();
    const properties: AnalyticsProperties = { action: 'fetch' };
    c.trackEvent(EVENT, properties);
    properties.action = 'push';
    expect(c.send.mock.calls[0][0].properties.action).toBe('fetch');
    const failed = harness({
      send: () => {
        throw new Error('Transport failed');
      },
    });
    failed.setAnalyticsMode('anonymous');
    expect(() => failed.trackEvent(EVENT)).not.toThrow();
  });
});
