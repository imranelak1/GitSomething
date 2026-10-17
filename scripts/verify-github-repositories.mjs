import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit browser fixtures only. These checks never authorize GitHub, contact a
// provider, read the OS credential store, or create/change a repository.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const screenshots = new URL(`github-repositories/${runId}/`, artifacts);
await mkdir(screenshots, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const report = {
  baseURL,
  testedAt: new Date().toISOString(),
  browser: await browser.version(),
  scope:
    'GitHub sign-in, repository metadata, and Clone & open through mocked native IPC; no live OAuth, provider traffic, or filesystem changes',
  checks: [],
  errors: [],
  providerRequests: [],
  screenshots: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
function monitor(page, surface) {
  page.on('pageerror', (error) => report.errors.push({ surface, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ surface, message: message.text() });
  });
  page.on('request', (request) => {
    if (
      /^https:\/\/(?:[^/]+\.)?(?:github\.com|githubusercontent\.com|gitlab\.com)(?:\/|$)/.test(
        request.url(),
      )
    )
      report.providerRequests.push(request.url());
  });
}
async function capture(page, name) {
  if (name.includes('repositories')) await repositories(page).scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/github-repositories/${runId}/${name}`);
}
const repositories = (page) => page.locator('.github-repositories');
const rows = (page) => repositories(page).locator('.github-repositories-row');
const fixture = (page, callback, argument) => page.evaluate(callback, argument);
async function account(page) {
  await page.getByRole('button', { name: 'GitHub account', exact: true }).click();
  await page.locator('.github-account-dialog').waitFor();
}
async function closeAccount(page) {
  await page.keyboard.press('Escape');
  await page.locator('.github-account-dialog').waitFor({ state: 'hidden' });
}
async function finishConsent(page) {
  await expectNoOwnerSetup(page);
  await expect(page.getByLabel('GitHub verification code')).toHaveText('FIXTURE-CODE');
  await page.locator('.github-account-dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'GitHub account', exact: true })).toContainText(
    '-fixture',
  );
}
async function expectNoOwnerSetup(page) {
  await expect(page.getByLabel('GitHub OAuth client ID', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Register GitSomething on GitHub', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save GitHub setup', exact: true })).toHaveCount(0);
  await expect(page.locator('.github-connect input')).toHaveCount(0);
}
async function installFixture(page, options = {}) {
  await page.addInitScript((options) => {
    let nextId = 0;
    const callbacks = new Map();
    const listeners = new Map();
    const state = {
      configured: options.configured ?? true,
      connected: options.connected ?? false,
      login: options.login ?? 'alpha-fixture',
      mode: options.mode ?? 'defer',
      sequence: 0,
      calls: [],
      pending: [],
      openMode: 'success',
      pickerMode: 'cancel',
      pickerPath: 'C:\\GitSomething QA\\Projects',
      resolvePicker: null,
      cloneMode: 'success',
      pendingClone: null,
      emitted: [],
      deferInitialStatus: options.deferInitialStatus ?? false,
      resolveInitialStatus: null,
    };
    const account = () => ({
      login: state.login,
      name: state.login === 'alpha-fixture' ? 'Alpha Fixture' : 'Bravo Fixture',
      email: 'fixture@example.invalid',
      avatarUrl: '',
    });
    const status = () => ({
      configured: state.configured,
      connected: state.connected,
      account: state.connected ? account() : null,
      scopes: state.connected ? ['repo', 'workflow', 'read:user', 'user:email'] : [],
    });
    const repository = (id, name, changes = {}, login = state.login) => ({
      id,
      name,
      fullName: `${login}/${name}`,
      description: 'An educational Git project.',
      private: false,
      archived: false,
      fork: false,
      defaultBranch: 'main',
      htmlUrl: `https://github.com/${login}/${name}`,
      cloneUrl: `https://github.com/${login}/${name}.git`,
      updatedAt: '2026-10-17T10:30:00Z',
      language: 'Rust',
      ownerLogin: login,
      ...changes,
    });
    const result = (page, login = state.login, mode = 'success') => ({
      accountLogin: mode === 'mismatch' ? 'unrelated-account' : login,
      repositories:
        mode === 'empty'
          ? []
          : mode === 'mismatch'
            ? [repository(999, 'never-show-cross-account', {}, 'unrelated-account')]
            : page === 1
              ? [
                  repository(1, 'terminal-lab', { private: true }, login),
                  repository(
                    2,
                    'friendly-guide',
                    {
                      description: 'Learn by reading <script>window.fixtureXss = true</script>.',
                      language: 'TypeScript',
                      updatedAt: '2026-10-15T10:30:00Z',
                    },
                    login,
                  ),
                ]
              : [
                  repository(
                    2,
                    'friendly-guide',
                    {
                      description: 'Updated metadata from a later page.',
                      language: 'TypeScript',
                      updatedAt: '2026-10-15T10:30:00Z',
                    },
                    login,
                  ),
                  repository(
                    3,
                    'archived-fork',
                    {
                      archived: true,
                      fork: true,
                      updatedAt: '2026-10-16T10:30:00Z',
                      htmlUrl: 'javascript:window.fixtureXss = true',
                    },
                    login,
                  ),
                ],
      nextPage: mode === 'empty' || page !== 1 ? null : 2,
    });
    state.resolvePending = (mode = 'success') => {
      const pending = state.pending.splice(0);
      for (const item of pending) {
        if (mode === 'error')
          item.reject(new Error('Fixture GitHub is temporarily unavailable. Try again.'));
        else item.resolve(result(item.page, item.login, mode));
      }
    };
    state.emit = (event, payload) => {
      state.emitted.push({ event, payload });
      for (const [id, listener] of listeners) {
        if (listener.event === event)
          callbacks.get(listener.handler)?.({ event, id, payload });
      }
    };
    state.cloneSnapshot = () => ({
      path: `${state.pickerPath}\\terminal-lab`,
      name: 'terminal-lab',
      branch: 'trunk',
      files: [],
      commits: [],
      branches: [],
      guardian: null,
    });
    state.cloneLog = (status) =>
      state.emit('git:log', {
        id: 'fixture-clone',
        operationId: 'fixture-clone',
        tokens: [
          { text: 'git', explanation: 'Git records project history.' },
          { text: 'clone', explanation: 'Download a working copy.' },
          {
            text: `https://github.com/${state.login}/terminal-lab.git`,
            explanation: 'The selected GitHub repository.',
          },
        ],
        status,
        message: status === 'success' ? 'Cloned your local working copy.' : 'Receiving Git objects.',
        timestamp: Date.now(),
      });
    window.__GITSOMETHING_GITHUB_TEST__ = state;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
      transformCallback(callback) {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id) {
        callbacks.delete(id);
      },
      async invoke(command, args) {
        state.calls.push({ command, args });
        if (command === 'github_auth_status') {
          if (state.deferInitialStatus) {
            state.deferInitialStatus = false;
            return new Promise((resolve) => {
              state.resolveInitialStatus = () => resolve(status());
            });
          }
          return status();
        }
        if (command === 'github_auth_start')
          return {
            sessionId: `fixture-session-${++state.sequence}`,
            userCode: 'FIXTURE-CODE',
            verificationUri: 'https://github.com/login/device',
            expiresIn: 900,
            interval: 5,
          };
        if (command === 'github_auth_poll') {
          state.connected = true;
          return { status: 'connected', account: account() };
        }
        if (command === 'github_auth_open_browser' || command === 'github_auth_cancel') return;
        if (command === 'github_auth_disconnect') {
          state.connected = false;
          return;
        }
        if (command === 'list_github_repositories') {
          if (!state.connected) throw new Error('Connect GitHub before browsing repositories.');
          const page = args.request.page;
          const login = state.login;
          if (state.mode === 'defer')
            return new Promise((resolve, reject) => {
              state.pending.push({ page, login, resolve, reject });
            });
          if (state.mode === 'error')
            throw new Error('Fixture GitHub is temporarily unavailable. Try again.');
          return result(page, login, state.mode);
        }
        if (command === 'open_github_repository') {
          if (state.openMode === 'error') throw 'Fixture browser could not open. Try again.';
          return;
        }
        if (command === 'plugin:dialog|open') {
          if (state.pickerMode === 'defer')
            return new Promise((resolve) => {
              state.resolvePicker = (value = state.pickerPath) => {
                state.resolvePicker = null;
                resolve(value);
              };
            });
          return state.pickerMode === 'cancel' ? null : state.pickerPath;
        }
        if (command === 'clone_github_repository') {
          state.cloneLog('running');
          if (state.cloneMode === 'existing') {
            state.cloneLog('error');
            throw 'A file or folder with this repository\'s name already exists there. Nothing was overwritten.';
          }
          if (state.cloneMode === 'error') {
            state.cloneLog('error');
            throw 'The clone could not finish. The new repository folder was preserved.';
          }
          if (state.cloneMode === 'defer')
            return new Promise((resolve) => {
              state.pendingClone = () => {
                state.pendingClone = null;
                state.cloneLog('success');
                resolve(state.cloneSnapshot());
              };
            });
          state.cloneLog('success');
          return state.cloneSnapshot();
        }
        if (command === 'plugin:event|listen') {
          const id = ++nextId;
          listeners.set(id, args);
          return id;
        }
        if (command === 'plugin:event|unlisten') {
          listeners.delete(args.eventId);
          return;
        }
        throw new Error(`Unexpected GitHub repository fixture IPC: ${command}`);
      },
    };
  }, options);
}

try {
  const browserOnly = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(browserOnly, 'browser-only');
  await browserOnly.goto(baseURL);
  await expect(repositories(browserOnly)).toContainText(
    'Your GitHub repositories live in the desktop app.',
  );
  assert.equal(
    await repositories(browserOnly)
      .getByRole('button', { name: 'Sign in with GitHub', exact: true })
      .count(),
    0,
  );
  assert.equal(await rows(browserOnly).count(), 0);
  check(
    'Browser preview truthfully requires desktop sign-in and displays no invented repositories',
  );
  await browserOnly.close();

  const delayed = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(delayed, 'delayed-auth-readiness-fixture');
  await installFixture(delayed, { deferInitialStatus: true });
  await delayed.goto(baseURL);
  await delayed.waitForFunction(
    () => typeof window.__GITSOMETHING_GITHUB_TEST__.resolveInitialStatus === 'function',
  );
  await repositories(delayed)
    .getByRole('button', { name: 'Sign in with GitHub', exact: true })
    .click();
  await expect(delayed.locator('.github-account-dialog')).toBeVisible();
  assert.equal(
    await fixture(
      delayed,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
          ({ command }) => command === 'github_auth_start',
        ).length,
    ),
    0,
  );
  await fixture(delayed, () => window.__GITSOMETHING_GITHUB_TEST__.resolveInitialStatus());
  await expect(delayed.getByLabel('GitHub verification code')).toHaveText('FIXTURE-CODE');
  await expectNoOwnerSetup(delayed);
  await capture(delayed, 'home-github-approval.png');
  assert.equal(
    await fixture(
      delayed,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
          ({ command }) => command === 'github_auth_start',
        ).length,
    ),
    1,
  );
  await closeAccount(delayed);
  await delayed.close();

  const dismissed = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(dismissed, 'dismissed-auth-readiness-fixture');
  await installFixture(dismissed, { deferInitialStatus: true });
  await dismissed.goto(baseURL);
  await dismissed.waitForFunction(
    () => typeof window.__GITSOMETHING_GITHUB_TEST__.resolveInitialStatus === 'function',
  );
  await repositories(dismissed)
    .getByRole('button', { name: 'Sign in with GitHub', exact: true })
    .click();
  await expect(dismissed.locator('.github-account-dialog')).toBeVisible();
  await closeAccount(dismissed);
  await fixture(dismissed, () => window.__GITSOMETHING_GITHUB_TEST__.resolveInitialStatus());
  await dismissed.waitForTimeout(150);
  assert.equal(
    await fixture(dismissed, () =>
      window.__GITSOMETHING_GITHUB_TEST__.calls.some(
        ({ command }) => command === 'github_auth_start' || command === 'github_auth_cancel',
      ),
    ),
    false,
  );
  await account(dismissed);
  await expect(dismissed.getByLabel('GitHub verification code')).toHaveText('FIXTURE-CODE');
  await closeAccount(dismissed);
  await dismissed.close();
  check(
    'One click waits for delayed auth readiness, while closing cancels that intent without breaking a later sign-in',
  );

  const unavailable = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(unavailable, 'unconfigured-development-fixture');
  await installFixture(unavailable, { configured: false });
  await unavailable.goto(baseURL);
  await repositories(unavailable)
    .getByRole('button', { name: 'Sign in with GitHub', exact: true })
    .click();
  const unavailableSignIn = unavailable
    .locator('.github-connect')
    .getByRole('button', { name: 'Sign in with GitHub', exact: true });
  await expect(unavailableSignIn).toBeVisible();
  await expect(unavailableSignIn).toBeDisabled();
  await expect(unavailable.locator('.github-connect')).toContainText(
    'GitHub sign-in is unavailable in this development build.',
  );
  await expectNoOwnerSetup(unavailable);
  await capture(unavailable, 'desktop-development-signin-unavailable.png');
  for (const width of [320, 390]) {
    await unavailable.setViewportSize({ width, height: 844 });
    await unavailableSignIn.scrollIntoViewIfNeeded();
    const geometry = await unavailable.locator('.github-connect').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    assert.ok(geometry.left >= -1 && geometry.right <= width + 1, `${width}px sign-in fits`);
    assert.ok(
      geometry.scrollWidth <= geometry.clientWidth + 1,
      `${width}px sign-in has no horizontal overflow`,
    );
    await expectNoOwnerSetup(unavailable);
    await capture(unavailable, `${width}-development-signin-unavailable.png`);
  }
  assert.equal(
    await fixture(unavailable, () =>
      window.__GITSOMETHING_GITHUB_TEST__.calls.some(({ command }) =>
        ['github_auth_start', 'github_auth_configure', 'github_auth_open_setup'].includes(command),
      ),
    ),
    false,
  );
  await unavailable.close();
  check(
    'An unconfigured development build keeps sign-in disabled and never asks users to register an app or enter credentials',
  );

  const native = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(native, 'native-fixture');
  await installFixture(native);
  await native.goto(baseURL);
  await repositories(native)
    .getByRole('button', { name: 'Sign in with GitHub', exact: true })
    .click();
  await expectNoOwnerSetup(native);
  await expect(native.locator('.onboarding-dialog')).toHaveCount(0);
  await native.waitForFunction(() =>
    window.__GITSOMETHING_GITHUB_TEST__.calls.some(
      ({ command }) => command === 'github_auth_start',
    ),
  );
  assert.equal(
    await fixture(
      native,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
          ({ command }) => command === 'github_auth_start',
        ).length,
    ),
    1,
  );
  await finishConsent(native);
  await expect(repositories(native).getByRole('status')).toContainText(
    'Loading your GitHub repositories',
  );
  await native.waitForFunction(() => window.__GITSOMETHING_GITHUB_TEST__.pending.length > 0);
  const firstRequest = await fixture(
    native,
    () =>
      window.__GITSOMETHING_GITHUB_TEST__.calls.find(
        ({ command }) => command === 'list_github_repositories',
      ).args,
  );
  assert.deepEqual(firstRequest, { request: { page: 1, perPage: 100 } });
  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'success';
    window.__GITSOMETHING_GITHUB_TEST__.resolvePending();
  });
  await expect(rows(native)).toHaveCount(2);
  check(
    'Sign in with GitHub directly starts device approval and loads a bounded metadata page through Rust IPC',
  );

  await expect(repositories(native)).toContainText('alpha-fixture/terminal-lab');
  await expect(repositories(native)).toContainText('Private');
  await expect(repositories(native)).toContainText('Public');
  assert.equal(await fixture(native, () => Boolean(window.fixtureXss)), false);
  await capture(native, 'desktop-repositories.png');
  check(
    'The authenticated Home list shows private and public repositories, owner, language, and dates with text escaped',
  );

  const requestCount = await fixture(
    native,
    () =>
      window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
        ({ command }) => command === 'list_github_repositories',
      ).length,
  );
  const filter = native.getByRole('searchbox', {
    name: 'Filter loaded GitHub repositories',
    exact: true,
  });
  const allRepositories = repositories(native).getByRole('button', {
    name: 'All repositories',
    exact: true,
  });
  const publicRepositories = repositories(native).getByRole('button', {
    name: 'Public repositories',
    exact: true,
  });
  const privateRepositories = repositories(native).getByRole('button', {
    name: 'Private repositories',
    exact: true,
  });
  await expect(allRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(allRepositories).toHaveText(/All\s*2/);
  await expect(publicRepositories).toHaveText(/Public\s*1/);
  await expect(privateRepositories).toHaveText(/Private\s*1/);
  await privateRepositories.click();
  await expect(privateRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(native)).toHaveCount(1);
  await expect(rows(native)).toContainText('alpha-fixture/terminal-lab');
  await filter.fill('TypeScript');
  await expect(rows(native)).toHaveCount(0);
  await expect(allRepositories).toHaveText(/All\s*2/);
  await expect(publicRepositories).toHaveText(/Public\s*1/);
  await expect(privateRepositories).toHaveText(/Private\s*1/);
  await repositories(native)
    .getByRole('button', { name: 'Clear repository search', exact: true })
    .click();
  await expect(filter).toHaveValue('');
  await expect(filter).toBeFocused();
  await expect(privateRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(native)).toHaveCount(1);
  await filter.fill('TypeScript');
  await repositories(native).getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(filter).toHaveValue('');
  await expect(allRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(native)).toHaveCount(2);
  await publicRepositories.click();
  await expect(publicRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(rows(native)).toHaveCount(1);
  await expect(rows(native)).toContainText('alpha-fixture/friendly-guide');
  await repositories(native).getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(rows(native)).toHaveCount(2);
  check(
    'Public and Private filters combine with search, retain honest loaded counts, and clear back to the complete loaded list',
  );

  const sort = native.getByRole('combobox', { name: 'Sort GitHub repositories', exact: true });
  await expect(sort).toHaveValue('updated');
  await expect(rows(native).first()).toContainText('alpha-fixture/terminal-lab');
  await sort.selectOption('name');
  await expect(rows(native).first()).toContainText('alpha-fixture/friendly-guide');
  await sort.selectOption('updated');
  await expect(rows(native).first()).toContainText('alpha-fixture/terminal-lab');
  await filter.fill('TypeScript');
  await expect(rows(native)).toHaveCount(1);
  await repositories(native)
    .getByRole('button', { name: 'Clear repository search', exact: true })
    .click();
  await expect(filter).toHaveValue('');
  await expect(filter).toBeFocused();
  await expect(rows(native)).toHaveCount(2);
  assert.equal(
    await fixture(
      native,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
          ({ command }) => command === 'list_github_repositories',
        ).length,
    ),
    requestCount,
  );
  check(
    'Name and update sorting use loaded metadata; search clearing and visibility controls make no additional requests',
  );

  await filter.fill('typescript');
  await expect(rows(native)).toHaveCount(1);
  await filter.fill('friendly typescript');
  await expect(rows(native)).toHaveCount(1);
  await filter.fill('friendly rust');
  await expect(rows(native)).toHaveCount(0);
  await filter.fill('not-yet-loaded');
  await expect(repositories(native)).toContainText('No loaded repositories match your filter.');
  await expect(repositories(native)).toContainText(
    'Search covers loaded repositories. Load more to include the rest.',
  );
  assert.equal(
    await fixture(
      native,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
          ({ command }) => command === 'list_github_repositories',
        ).length,
    ),
    requestCount,
  );
  await filter.fill('');
  check(
    'Filtering uses loaded name/description/language metadata without new requests and explains pagination limits',
  );

  await repositories(native)
    .getByRole('button', { name: 'Load more repositories', exact: true })
    .click();
  await expect(rows(native)).toHaveCount(3);
  await expect(allRepositories).toHaveText(/All\s*3/);
  await expect(publicRepositories).toHaveText(/Public\s*2/);
  await expect(privateRepositories).toHaveText(/Private\s*1/);
  await expect(repositories(native)).toContainText('Updated metadata from a later page.');
  await expect(repositories(native)).toContainText('Archived');
  await expect(repositories(native)).toContainText('Fork');
  assert.equal(
    await repositories(native)
      .getByRole('button', { name: 'Load more repositories', exact: true })
      .count(),
    0,
  );
  assert.equal(
    await repositories(native)
      .getByRole('link', { name: 'Open alpha-fixture/archived-fork on GitHub', exact: true })
      .count(),
    0,
  );
  check(
    'Pagination merges repeated repository IDs, updates metadata, stops at the final page, and rejects unsafe destination URLs',
  );

  const open = repositories(native).getByRole('link', {
    name: 'Open alpha-fixture/terminal-lab on GitHub',
    exact: true,
  });
  assert.equal(await open.getAttribute('href'), 'https://github.com/alpha-fixture/terminal-lab');
  assert.equal(await open.getAttribute('rel'), 'noopener noreferrer');
  await open.click();
  assert.deepEqual(
    await fixture(
      native,
      () =>
        window.__GITSOMETHING_GITHUB_TEST__.calls.find(
          ({ command }) => command === 'open_github_repository',
        ).args,
    ),
    { url: 'https://github.com/alpha-fixture/terminal-lab' },
  );
  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.openMode = 'error';
  });
  await open.click();
  await expect(repositories(native).getByRole('alert')).toContainText(
    'Fixture browser could not open. Try again.',
  );
  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.openMode = 'success';
  });
  check(
    'Opening a repository uses the native trusted-browser IPC and reports launch failures without navigating the webview',
  );

  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'error';
  });
  await native.getByRole('button', { name: 'Refresh GitHub repositories', exact: true }).click();
  await expect(
    repositories(native).getByRole('alert').filter({ hasText: 'temporarily unavailable' }),
  ).toBeVisible();
  await expect(rows(native)).toHaveCount(3);
  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'success';
  });
  await repositories(native).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(rows(native)).toHaveCount(2);
  await expect(
    repositories(native).getByRole('alert').filter({ hasText: 'temporarily unavailable' }),
  ).toHaveCount(0);
  check('A failed refresh keeps current-account data usable and retry recovers the first page');

  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'mismatch';
  });
  await native.getByRole('button', { name: 'Refresh GitHub repositories', exact: true }).click();
  await expect(
    repositories(native).getByRole('alert').filter({ hasText: 'sign-in changed' }),
  ).toBeVisible();
  assert.equal(
    await repositories(native).getByText('never-show-cross-account', { exact: false }).count(),
    0,
  );
  check('A repository response for a different account is rejected before rendering');

  await privateRepositories.click();
  await filter.fill('terminal');
  await sort.selectOption('name');
  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'defer';
  });
  await native.getByRole('button', { name: 'Refresh GitHub repositories', exact: true }).click();
  await native.waitForFunction(() => window.__GITSOMETHING_GITHUB_TEST__.pending.length > 0);
  await account(native);
  await native.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await closeAccount(native);
  await expect(rows(native)).toHaveCount(0);
  await fixture(native, () => window.__GITSOMETHING_GITHUB_TEST__.resolvePending());
  await native.waitForTimeout(150);
  await expect(rows(native)).toHaveCount(0);
  await expect(repositories(native)).toContainText('See your repositories here.');
  check(
    'Disconnect hides private metadata immediately and discards a late response from the removed session',
  );

  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.login = 'bravo-fixture';
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'success';
  });
  await repositories(native)
    .getByRole('button', { name: 'Sign in with GitHub', exact: true })
    .click();
  await finishConsent(native);
  await expect(repositories(native)).toContainText('bravo-fixture/terminal-lab');
  assert.equal(await repositories(native).getByText('alpha-fixture/', { exact: false }).count(), 0);
  assert.equal(
    await native
      .getByRole('searchbox', { name: 'Filter loaded GitHub repositories', exact: true })
      .inputValue(),
    '',
  );
  await expect(allRepositories).toHaveAttribute('aria-pressed', 'true');
  await expect(sort).toHaveValue('updated');
  check(
    'Signing into another account starts with a clean list, search, visibility, and sort state',
  );

  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'empty';
  });
  await native.getByRole('button', { name: 'Refresh GitHub repositories', exact: true }).click();
  await expect(rows(native)).toHaveCount(0);
  await expect(repositories(native)).toContainText(
    'GitHub returned no repositories for this account.',
  );
  await expect(repositories(native)).toContainText('Organization repositories may need approval');
  check(
    'An empty provider result is explained without suggesting that organization access is guaranteed',
  );

  const cloning = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(cloning, 'clone-and-open-native-fixture');
  await cloning.emulateMedia({ reducedMotion: 'reduce' });
  await installFixture(cloning, { connected: true, mode: 'success' });
  await cloning.goto(baseURL);
  const cloneButton = repositories(cloning).getByRole('button', {
    name: 'Clone and open alpha-fixture/terminal-lab',
    exact: true,
  });
  await expect(cloneButton).toBeVisible();
  const cloneState = () =>
    fixture(cloning, () => ({
      pickers: window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
        ({ command }) => command === 'plugin:dialog|open',
      ),
      clones: window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
        ({ command }) => command === 'clone_github_repository',
      ),
      logs: window.__GITSOMETHING_GITHUB_TEST__.emitted.filter(
        ({ event }) => event === 'git:log',
      ),
      recents: JSON.parse(localStorage.getItem('branchline.recent-repositories.v1') || '[]'),
    }));
  await cloneButton.click();
  await expect(cloneButton).toBeEnabled();
  const cancelled = await cloneState();
  assert.equal(cancelled.pickers.length, 1);
  assert.deepEqual(cancelled.pickers[0].args, {
    options: {
      directory: true,
      multiple: false,
      title: 'Choose where to save terminal-lab',
    },
  });
  assert.equal(cancelled.clones.length, 0);
  assert.equal(cancelled.logs.length, 0);
  assert.deepEqual(cancelled.recents, []);
  await expect(cloning.locator('.home-page')).toBeVisible();
  await expect(repositories(cloning).getByRole('alert')).toHaveCount(0);
  check('Cancelling the native parent-folder picker leaves Home, recents, and the Git terminal untouched');

  await fixture(cloning, () => {
    window.__GITSOMETHING_GITHUB_TEST__.pickerMode = 'defer';
  });
  await cloneButton.evaluate((button) => {
    button.click();
    button.click();
  });
  await cloning.waitForFunction(
    () => typeof window.__GITSOMETHING_GITHUB_TEST__.resolvePicker === 'function',
  );
  await expect(cloneButton).toBeDisabled();
  await expect(repositories(cloning).getByRole('status')).toContainText('Choose a folder.');
  assert.equal((await cloneState()).pickers.length, 2);
  await fixture(cloning, () => window.__GITSOMETHING_GITHUB_TEST__.resolvePicker(null));
  await expect(cloneButton).toBeEnabled();
  assert.equal((await cloneState()).clones.length, 0);
  check('Repeated clone clicks share one pending folder picker and never start duplicate operations');

  for (const [mode, message] of [
    ['existing', 'already exists there. Nothing was overwritten.'],
    ['error', 'The new repository folder was preserved.'],
  ]) {
    await fixture(cloning, (mode) => {
      window.__GITSOMETHING_GITHUB_TEST__.pickerMode = 'success';
      window.__GITSOMETHING_GITHUB_TEST__.cloneMode = mode;
    }, mode);
    await cloneButton.click();
    await expect(repositories(cloning).getByRole('alert')).toContainText(message);
    await expect(cloneButton).toBeEnabled();
    await expect(cloning.locator('.home-page')).toBeVisible();
    assert.deepEqual((await cloneState()).recents, []);
  }
  check('Existing-folder and native clone failures stay on Home, explain preservation, and do not add recent repositories');

  await fixture(cloning, () => {
    window.__GITSOMETHING_GITHUB_TEST__.cloneMode = 'defer';
  });
  await cloneButton.click();
  await cloning.waitForFunction(
    () => typeof window.__GITSOMETHING_GITHUB_TEST__.pendingClone === 'function',
  );
  for (const action of await repositories(cloning)
    .getByRole('button', { name: /^Clone and open / }).all()) {
    await expect(action).toBeDisabled();
  }
  await expect(cloning.locator('.home-open-repository')).toBeDisabled();
  await expect(repositories(cloning).getByRole('status')).toContainText('Downloading your working copy.');
  await cloneButton.evaluate((button) => button.click());
  const pendingClone = await cloneState();
  assert.equal(pendingClone.clones.length, 3);
  assert.deepEqual(pendingClone.clones.at(-1).args, {
    parentPath: 'C:\\GitSomething QA\\Projects',
    cloneUrl: 'https://github.com/alpha-fixture/terminal-lab.git',
  });
  await fixture(cloning, () => window.__GITSOMETHING_GITHUB_TEST__.pendingClone());
  await expect(cloning.locator('.home-page')).toHaveCount(0);
  await expect(cloning.locator('.app-body')).toBeVisible();
  const stream = cloning.getByRole('log', { name: 'Git and GitHub operations', exact: true });
  await expect(stream).toBeVisible();
  await expect(stream.locator('.glass-entry-command')).toHaveCount(1);
  await expect(stream).toContainText('https://github.com/alpha-fixture/terminal-lab.git');
  await expect(stream).toContainText('Cloned your local working copy.');
  const saved = (await cloneState()).recents;
  assert.equal(saved.length, 1);
  assert.deepEqual(Object.keys(saved[0]).sort(), ['branch', 'lastOpened', 'name', 'path']);
  assert.equal(saved[0].path, 'C:\\GitSomething QA\\Projects\\terminal-lab');
  assert.equal(saved[0].branch, 'trunk');
  await capture(cloning, 'desktop-clone-workspace.png');
  await cloning.getByRole('link', { name: 'Go to home', exact: true }).click();
  await expect(cloning.locator('.home-recent-open')).toContainText('terminal-lab');
  await expect(cloning.locator('.home-recent-open')).toContainText(saved[0].path);
  check('Retry sends only parentPath and cloneUrl, blocks concurrent work, opens the returned working copy, and records one equivalent clone command plus a local recent');
  await cloning.close();

  const changedAccount = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(changedAccount, 'clone-picker-account-change-fixture');
  await changedAccount.emulateMedia({ reducedMotion: 'reduce' });
  await installFixture(changedAccount, { connected: true, mode: 'success' });
  await changedAccount.goto(baseURL);
  await fixture(changedAccount, () => {
    window.__GITSOMETHING_GITHUB_TEST__.pickerMode = 'defer';
  });
  await repositories(changedAccount).getByRole('button', {
    name: 'Clone and open alpha-fixture/terminal-lab', exact: true,
  }).click();
  await changedAccount.waitForFunction(
    () => typeof window.__GITSOMETHING_GITHUB_TEST__.resolvePicker === 'function',
  );
  await account(changedAccount);
  await changedAccount.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await closeAccount(changedAccount);
  await expect(rows(changedAccount)).toHaveCount(0);
  await fixture(changedAccount, () => window.__GITSOMETHING_GITHUB_TEST__.resolvePicker());
  await changedAccount.waitForTimeout(100);
  assert.equal(await fixture(changedAccount, () =>
    window.__GITSOMETHING_GITHUB_TEST__.calls.filter(
      ({ command }) => command === 'clone_github_repository',
    ).length), 0);
  await expect(changedAccount.locator('.home-page')).toBeVisible();
  assert.deepEqual(await fixture(changedAccount, () =>
    JSON.parse(localStorage.getItem('branchline.recent-repositories.v1') || '[]')), []);
  check('Changing the GitHub connection while a folder picker is pending prevents cloning with the previous account');
  await changedAccount.close();

  await fixture(native, () => {
    window.__GITSOMETHING_GITHUB_TEST__.mode = 'success';
  });
  await native.getByRole('button', { name: 'Refresh GitHub repositories', exact: true }).click();
  await expect(rows(native)).toHaveCount(2);
  for (const width of [320, 390, 1440]) {
    await native.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await native.emulateMedia({ reducedMotion: 'reduce' });
    const geometry = await repositories(native).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(
      geometry.left >= -1 && geometry.right <= geometry.viewport + 1,
      `${width}px repository section fits viewport`,
    );
    assert.ok(
      geometry.scrollWidth <= geometry.clientWidth + 1,
      `${width}px repository content does not overflow`,
    );
    assert.ok(geometry.documentWidth <= width + 1, `${width}px page has no horizontal overflow`);
    for (const control of await repositories(native)
      .locator('.github-repositories-clone, .github-repositories-open').all()) {
      const box = await control.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1,
        `${width}px Clone & open and GitHub actions fit the viewport`);
    }
    await capture(native, `${width}-repositories.png`);
  }
  check('Repository browsing remains readable at 320px, 390px, and 1440px with reduced motion');

  const storage = await fixture(native, () =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  );
  for (const value of ['terminal-lab', 'friendly-guide', 'FIXTURE-CODE', 'fixture@example.invalid'])
    assert.ok(
      !storage.includes(value),
      `Sensitive account/repository metadata is not persisted: ${value}`,
    );
  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider requests: ${JSON.stringify(report.providerRequests)}`,
  );
  assert.equal(
    report.errors.length,
    0,
    `Unexpected browser errors: ${JSON.stringify(report.errors)}`,
  );
  check(
    'OAuth codes and repository metadata stay out of browser storage; all checks produce zero provider traffic and browser errors',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  try {
    const contents = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(new URL(`github-repositories-report-${runId}.json`, artifacts), contents);
    await writeFile(new URL('github-repositories-report.json', artifacts), contents);
  } finally {
    await browser.close();
  }
}
