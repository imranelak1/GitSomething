import { version } from '../../package.json';
import { isDesktop } from './types';

export type AnalyticsMode = 'off' | 'anonymous' | 'identified';
export type AnalyticsEvent =
  | 'gitsomething app opened'
  | 'gitsomething repository opened'
  | 'gitsomething repository cloned'
  | 'gitsomething git action'
  | 'gitsomething github connected'
  | 'gitsomething github disconnected'
  | 'gitsomething guide opened'
  | 'gitsomething guide completed'
  | 'gitsomething repository published';

export interface AnalyticsProperties {
  action?:
    'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'push' | 'rescue' | 'status' | 'diff';
  outcome?: 'success' | 'error';
  source?: 'local' | 'github';
  provider?: 'github' | 'gitlab';
  visibility?: 'public' | 'private';
}

export const ANALYTICS_MODE_KEY = 'gitsomething.analytics.mode.v1';
export const ANALYTICS_ANONYMOUS_ID_KEY = 'gitsomething.analytics.anonymous-id.v1';
// Public ingestion configuration. This grants no access to the owner dashboard.
const TOKEN = 'phc_r3upAczUZ29qFrExQxeWmG6bCYmVrbcctbKSDtXpv54J';
const HOST = 'https://eu.i.posthog.com';
export const analyticsConfigured = Boolean(TOKEN && HOST);

const EVENTS = new Set<AnalyticsEvent>([
  'gitsomething app opened',
  'gitsomething repository opened',
  'gitsomething repository cloned',
  'gitsomething git action',
  'gitsomething github connected',
  'gitsomething github disconnected',
  'gitsomething guide opened',
  'gitsomething guide completed',
  'gitsomething repository published',
]);
const VALUES = {
  action: ['stage', 'unstage', 'commit', 'fetch', 'pull', 'push', 'rescue', 'status', 'diff'],
  outcome: ['success', 'error'],
  source: ['local', 'github'],
  provider: ['github', 'gitlab'],
  visibility: ['public', 'private'],
} as const;
const STANDARD = {
  app_name: 'GitSomething',
  app_version: version,
  runtime: 'desktop',
  channel: 'beta',
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANONYMOUS_ID =
  /^gitsomething:anonymous:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface AnalyticsPayload {
  api_key: string;
  event: AnalyticsEvent;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

/** Transport injection keeps privacy tests completely offline. */
export interface AnalyticsDependencies {
  isProductionDesktop(): boolean;
  storage(): PreferenceStorage | undefined;
  randomUuid(): string | undefined;
  send(payload: AnalyticsPayload, signal: AbortSignal): Promise<unknown>;
  configured?: boolean;
}

function normalizeMode(value: unknown): AnalyticsMode {
  return value === 'anonymous' || value === 'identified' ? value : 'off';
}

function publicLogin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const login = value.toLowerCase();
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(login) && !login.includes('--') ? login : null;
}

function allowedProperties(input: unknown): Record<string, string> {
  const output: Record<string, string> = {};
  if (!input || typeof input !== 'object') return output;
  for (const [key, values] of Object.entries(VALUES)) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string' && (values as readonly string[]).includes(value))
      output[key] = value;
  }
  return output;
}

export function createAnalyticsClient(dependencies: AnalyticsDependencies) {
  const listeners = new Set<() => void>();
  const requests = new Set<AbortController>();
  const stored = (key: string): string | null => {
    try {
      return dependencies.storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const persist = (key: string, value: string | null) => {
    try {
      const storage = dependencies.storage();
      if (value === null) storage?.removeItem(key);
      else storage?.setItem(key, value);
    } catch {
      /* A denied storage write never blocks a privacy change. */
    }
  };
  let mode = normalizeMode(stored(ANALYTICS_MODE_KEY));
  let account: string | null = null;
  let anonymousId: string | null = null;
  const allowed = () => {
    try {
      return (
        mode !== 'off' &&
        (dependencies.configured ?? analyticsConfigured) &&
        dependencies.isProductionDesktop()
      );
    } catch {
      return false;
    }
  };
  const clearAnonymousId = () => {
    anonymousId = null;
    persist(ANALYTICS_ANONYMOUS_ID_KEY, null);
  };
  const stopPendingRequests = () => {
    for (const request of requests) request.abort();
    requests.clear();
  };
  const identity = (): string | null => {
    if (mode === 'identified' && account) return `gitsomething:github:${account}`;
    if (anonymousId) return anonymousId;
    const saved = stored(ANALYTICS_ANONYMOUS_ID_KEY);
    if (saved && ANONYMOUS_ID.test(saved)) anonymousId = saved;
    else {
      const uuid = dependencies.randomUuid();
      if (!uuid || !UUID.test(uuid)) return null;
      anonymousId = `gitsomething:anonymous:${uuid}`;
      persist(ANALYTICS_ANONYMOUS_ID_KEY, anonymousId);
    }
    return anonymousId;
  };
  const setAnalyticsMode = (value: AnalyticsMode): void => {
    const next = normalizeMode(value);
    if (next === mode) return;
    mode = next;
    stopPendingRequests();
    // Never attach earlier anonymous events to a later named profile.
    clearAnonymousId();
    persist(ANALYTICS_MODE_KEY, mode);
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* One subscriber cannot interrupt privacy changes. */
      }
    }
  };
  const setAnalyticsAccount = (login: string | null): void => {
    const next = publicLogin(login);
    if (next === account) return;
    account = next;
    if (mode !== 'identified') return;
    stopPendingRequests();
    clearAnonymousId();
  };
  const trackEvent = (event: AnalyticsEvent, properties?: AnalyticsProperties): void => {
    try {
      if (!EVENTS.has(event) || !allowed()) return;
      const distinctId = identity();
      if (!distinctId) return;
      const identified = mode === 'identified' && account !== null;
      const payload: AnalyticsPayload = {
        api_key: TOKEN,
        event,
        distinct_id: distinctId,
        properties: {
          ...allowedProperties(properties),
          ...STANDARD,
          $process_person_profile: identified,
          $geoip_disable: true,
          ...(identified ? { $set: { github_login: account } } : {}),
        },
        timestamp: new Date().toISOString(),
      };
      const controller = new AbortController();
      requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 5000);
      const complete = () => {
        clearTimeout(timeout);
        requests.delete(controller);
      };
      try {
        // One attempt, no background queue, retries or unload beacon. Opt-out
        // aborts pending attempts; events already received cannot be recalled.
        void dependencies
          .send(payload, controller.signal)
          .catch(() => {})
          .finally(complete);
      } catch {
        complete();
      }
    } catch {
      /* Analytics must never interrupt a Git operation. */
    }
  };
  return {
    getAnalyticsMode: (): AnalyticsMode => mode,
    setAnalyticsMode,
    setAnalyticsAccount,
    trackEvent,
    subscribeAnalyticsMode(callback: () => void): () => void {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

function productionDesktop(): boolean {
  if (typeof window === 'undefined' || !import.meta.env.PROD || !isDesktop()) return false;
  const { protocol, hostname } = window.location;
  return (
    (protocol === 'tauri:' && hostname === 'localhost') ||
    ((protocol === 'http:' || protocol === 'https:') && hostname === 'tauri.localhost')
  );
}

const analytics = createAnalyticsClient({
  isProductionDesktop: productionDesktop,
  storage: () => (typeof window === 'undefined' ? undefined : window.localStorage),
  randomUuid: () => globalThis.crypto?.randomUUID?.(),
  send: async (payload, signal) => {
    await fetch(`${HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      keepalive: false,
    });
  },
});

export const {
  getAnalyticsMode,
  setAnalyticsMode,
  setAnalyticsAccount,
  trackEvent,
  subscribeAnalyticsMode,
} = analytics;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === ANALYTICS_MODE_KEY || event.key === null) {
      setAnalyticsMode(normalizeMode(event.key === null ? null : event.newValue));
    }
  });
}
