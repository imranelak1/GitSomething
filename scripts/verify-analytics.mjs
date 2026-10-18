import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

// Exercises the production analytics transport at a simulated Tauri origin. Every
// analytics request is intercepted locally; nothing is ingested into PostHog.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const report = {
  testedAt: new Date().toISOString(),
  scope:
    'Production bundle, simulated Tauri origin and account; all external traffic intercepted locally',
  checks: [],
  errors: [],
  requests: [],
  externalRequests: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const config = JSON.parse(
  await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const screenshots = new URL('../artifacts/analytics/', import.meta.url);
let debugPage;
await mkdir(screenshots, { recursive: true });

function decode(request) {
  return JSON.parse(request.postData() || 'null');
}

try {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 980 },
    reducedMotion: 'reduce',
  });
  const requests = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'tauri.localhost') {
      const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': config.app.security.csp },
      });
    } else if (url.hostname.endsWith('.posthog.com')) {
      const entry = {
        path: url.pathname,
        method: route.request().method(),
        payload: null,
        hasCookie: !!route.request().headers().cookie,
        hasReferrer: !!route.request().headers().referer,
      };
      if (route.request().method() === 'POST') entry.payload = decode(route.request());
      requests.push(entry);
      report.requests.push(entry);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': 'http://tauri.localhost',
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': '*',
        },
        body: JSON.stringify({ status: 1 }),
      });
    } else if (url.origin === new URL(baseURL).origin) await route.continue();
    else {
      report.externalRequests.push(url.hostname);
      await route.abort();
    }
  });
  await context.addInitScript(() => {
    let id = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
      transformCallback(callback) {
        const key = ++id;
        window[`_${key}`] = callback;
        return key;
      },
      unregisterCallback(key) {
        delete window[`_${key}`];
      },
      async invoke(command) {
        if (command === 'github_auth_status') {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return {
            configured: true,
            connected: true,
            account: {
              login: 'analytics-fixture',
              name: 'Private Fixture Name',
              email: 'private-fixture@example.invalid',
              avatarUrl: '',
            },
            scopes: ['repo'],
          };
        }
        if (command === 'list_github_repositories')
          return { repositories: [], nextPage: null, accountLogin: 'analytics-fixture' };
        if (command === 'plugin:event|listen') return ++id;
        if (command === 'plugin:event|unlisten') return;
        throw new Error(`Unexpected mocked IPC: ${command}`);
      },
    };
  });
  const page = await context.newPage();
  debugPage = page;
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  await page.goto('http://tauri.localhost');
  const trigger = page.getByRole('button', { name: 'Usage sharing: Off', exact: true });
  await expect(trigger).toBeVisible();
  await page.waitForTimeout(500);
  assert.equal(requests.length, 0);
  check('Production native-origin simulation sends no analytics before consent');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Privacy & usage', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Off', exact: true })).toBeFocused();
  await page.screenshot({
    path: new URL('privacy-desktop.png', screenshots).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  });
  check('Privacy dialog is discoverable and focuses the current native radio');
  await page.getByRole('radio', { name: 'Anonymous usage', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => requests.filter((r) => r.payload).length).toBeGreaterThan(0);
  const anonymous = requests.flatMap((r) =>
    r.payload ? (Array.isArray(r.payload) ? r.payload : (r.payload.batch ?? [r.payload])) : [],
  );
  assert.ok(anonymous.some((event) => event.event === 'gitsomething app opened'));
  assert.ok(!JSON.stringify(anonymous).includes('analytics-fixture'));
  assert.ok(!JSON.stringify(anonymous).includes('private-fixture'));
  assert.ok(
    anonymous.every(
      (event) =>
        !event.properties?.$current_url &&
        !event.properties?.$referrer &&
        !event.properties?.$browser,
    ),
  );
  check('Capture API sends allowlisted anonymous usage without account, URL or browser metadata');
  await page.getByRole('button', { name: 'Usage sharing: Anonymous', exact: true }).click();
  await page.getByRole('radio', { name: 'Usage with GitHub username', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Open getting started guide', exact: true }).click();
  await expect
    .poll(() => requests.some((r) => JSON.stringify(r.payload).includes('github_login')))
    .toBe(true);
  assert.ok(!JSON.stringify(requests).includes('private-fixture'));
  check(
    'Public GitHub username is shared only after choosing identified mode; email and name stay local',
  );
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Usage sharing: With GitHub username', exact: true })
    .click();
  await page.getByRole('radio', { name: 'Off', exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const stoppedAt = requests.length;
  await page.getByRole('button', { name: 'Open getting started guide', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(requests.length, stoppedAt);
  check('Opt-out immediately stops collection of subsequent real UI events');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Usage sharing: Off', exact: true })).toBeVisible();
  assert.equal(requests.length, stoppedAt);
  assert.equal(
    await page.evaluate(() => localStorage.getItem('gitsomething.analytics.anonymous-id.v1')),
    null,
  );
  check('Opt-out persists across launch and removes the installation identity');
  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByRole('button', { name: 'Usage sharing: Off', exact: true }).click();
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
  await page.getByRole('button', { name: 'Done', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await page.screenshot({
    path: new URL('privacy-320.png', screenshots).pathname.replace(/^\/(\w:)/, '$1'),
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Usage sharing: Off', exact: true })).toBeFocused();
  check('320px layout scrolls to all controls and Escape returns focus');
  const restoredAt = requests.length;
  await page.evaluate(() => localStorage.setItem('gitsomething.analytics.mode.v1', 'identified'));
  await page.reload();
  await expect
    .poll(() => requests.slice(restoredAt).filter((r) => r.payload).length)
    .toBeGreaterThan(0);
  const restored = requests
    .slice(restoredAt)
    .filter((r) => r.payload)
    .map((r) => r.payload);
  assert.ok(restored.every((r) => r.distinct_id === 'gitsomething:github:analytics-fixture'));
  assert.ok(restored.some((r) => r.event === 'gitsomething app opened'));
  check(
    'A saved named-sharing choice waits for delayed account restoration before counting a launch',
  );
  assert.ok(requests.every((r) => !/flags|config|record|survey|log|metric/.test(r.path)));
  assert.ok(requests.every((r) => !r.hasCookie && !r.hasReferrer));
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.externalRequests.length, 0);
  check(
    'No replay, flags, remote configuration, logs, metrics, provider traffic or browser errors',
  );
  report.status = 'passed';
  await context.close();
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  throw error;
} finally {
  if (debugPage && !debugPage.isClosed()) {
    report.runtimeSnapshot = await debugPage.evaluate(() => ({
      origin: location.origin,
      secureContext: isSecureContext,
      randomUuidAvailable: typeof crypto.randomUUID === 'function',
      nativeFlag: '__TAURI_INTERNALS__' in window,
      preference: localStorage.getItem('gitsomething.analytics.mode.v1'),
      anonymousId: localStorage.getItem('gitsomething.analytics.anonymous-id.v1'),
    }));
  }
  await browser.close();
  await writeFile(
    new URL('../artifacts/analytics-browser-report.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
}
