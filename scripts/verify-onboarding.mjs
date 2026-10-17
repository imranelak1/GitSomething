import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace, openGuideFromHome } from './workspace-fixture.mjs';
import { confirmSlide } from './slide-fixture.mjs';

// Use a fixed production preview so artifact writes cannot trigger a reload.
// This suite drives browser presentation and mocked native IPC. It never
// authorizes GitHub, accesses a credential store, or changes a real repository.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('studio-onboarding/', artifacts);
await mkdir(screenshots, { recursive: true });
const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(executablePath) ? { executablePath } : {}),
});
const report = {
  baseURL,
  testedAt: new Date().toISOString(),
  browser: await browser.version(),
  scope: 'Browser guide interactions and mocked native GitHub OAuth IPC only',
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
    if (/https:\/\/(?:api\.)?(?:github\.com|gitlab\.com)/.test(request.url())) {
      report.providerRequests.push(request.url());
    }
  });
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/studio-onboarding/${name}`);
}
async function expectText(page, text) {
  await page.getByText(text, { exact: true }).waitFor({ timeout: 15_000 });
}
async function waitForEditor(page) {
  await enterDemoWorkspace(page);
}
async function openAccount(page) {
  await page.getByRole('button', { name: 'GitHub account', exact: true }).click();
  await page.locator('.github-connect').waitFor();
}
async function closeGuide(page) {
  await page.getByRole('button', { name: 'Close getting started guide', exact: true }).click();
  await page.locator('.onboarding-dialog').waitFor({ state: 'hidden' });
}
async function openPublish(page) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('What would you like to do?').fill('Create');
  await page.keyboard.press('Enter');
  await page.locator('.publish-dialog').waitFor();
}
async function nativePage({ configured = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(page, configured ? 'mocked-native-auth' : 'mocked-native-unconfigured');
  await page.addInitScript(
    ({ configured }) => {
      localStorage.setItem('branchline.guide.v1', 'seen');
      let nextId = 0;
      let connected = false;
      const callbacks = new Map();
      const listeners = new Map();
      const account = {
        login: 'branchline-fixture',
        name: 'Branchline Fixture',
        email: 'fixture@example.invalid',
        avatarUrl: 'https://avatars.githubusercontent.com/u/0',
      };
      const scopes = ['repo', 'workflow', 'read:user', 'user:email'];
      const state = {
        commands: [],
        mode: 'connected',
        sequence: 0,
        publishes: [],
        resolvePoll: null,
      };
      window.__BRANCHLINE_AUTH_TEST__ = state;
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
          state.commands.push({
            command,
            args,
            calledAt: Date.now(),
            pollMode: command === 'github_auth_poll' ? state.mode : undefined,
          });
          if (command === 'plugin:event|listen') {
            const id = ++nextId;
            listeners.set(id, args);
            return id;
          }
          if (command === 'plugin:event|unlisten') {
            listeners.delete(args.eventId);
            return;
          }
          if (command === 'github_auth_status') {
            return {
              configured,
              connected,
              account: connected ? account : null,
              scopes: connected ? scopes : [],
            };
          }
          if (command === 'github_auth_start') {
            return {
              sessionId: `test-session-${++state.sequence}`,
              userCode: 'TEST-CODE',
              verificationUri: 'https://github.com/login/device',
              expiresIn: 900,
              interval: 5,
            };
          }
          if (command === 'github_auth_open_browser' || command === 'github_auth_cancel') return;
          if (command === 'github_auth_poll') {
            if (state.mode === 'defer') {
              return new Promise((resolve) => {
                state.resolvePoll = resolve;
              });
            }
            if (state.mode === 'pending') return { status: 'pending', retryAfter: 5 };
            if (state.mode === 'slow_down') return { status: 'slow_down', retryAfter: 10 };
            if (state.mode === 'denied' || state.mode === 'expired') return { status: state.mode };
            if (state.mode === 'error')
              throw new Error('Could not contact GitHub. Check your connection and try again.');
            connected = true;
            return { status: 'connected', account };
          }
          if (command === 'github_auth_disconnect') {
            connected = false;
            return;
          }
          if (command === 'plugin:dialog|open') return 'C:\\test-fixture\\first-project';
          if (command === 'publish_repository') {
            const request = args.request;
            state.publishes.push(request);
            const subscriptions = [...listeners.entries()].filter(
              ([, item]) => item.event === 'publish:progress',
            );
            for (const step of ['validate', 'init', 'commit', 'remote', 'push']) {
              for (const [id, item] of subscriptions) {
                callbacks.get(item.handler)?.({
                  event: 'publish:progress',
                  id,
                  payload: { operationId: request.operationId, step, status: 'success' },
                });
              }
            }
            return {
              url: 'https://github.com/branchline-fixture/first-project',
              path: request.path,
              branch: 'main',
            };
          }
          throw new Error(`Unexpected mocked IPC command: ${command}`);
        },
      };
    },
    { configured },
  );
  await page.goto(baseURL);
  await waitForEditor(page);
  return page;
}

try {
  const first = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(first, 'first-launch-browser');
  await first.goto(baseURL);
  await openGuideFromHome(first);
  await first.getByRole('dialog', { name: 'A good place to start.', exact: true }).waitFor();
  assert.equal(
    await first
      .locator('.onboarding-illustration [data-motion="branch-bloom"]')
      .getAttribute('data-phase'),
    'edit',
  );
  assert.equal(
    await first
      .locator('.onboarding-illustration [data-motion="branch-bloom"]')
      .getAttribute('aria-hidden'),
    'true',
  );
  await capture(first, 'desktop-welcome.png');
  assert.equal(
    await first.getByRole('button', { name: 'Step 1: Welcome' }).getAttribute('aria-current'),
    'step',
  );
  check('Home opens the first-use guide explicitly with clear progress and a skip action');

  await first.getByRole('button', { name: 'Get started', exact: true }).click();
  await expectText(
    first,
    'GitHub sign-in is available in the desktop app. This browser preview stays local.',
  );
  assert.equal(
    await first.getByRole('button', { name: 'Sign in with GitHub', exact: true }).count(),
    0,
  );
  assert.equal(await first.locator('.onboarding-dialog input[type="password"]').count(), 0);
  await capture(first, 'desktop-connect-browser.png');
  check('Browser sign-in is explicitly a desktop feature and requests no token');

  await first.getByRole('button', { name: 'Continue locally', exact: true }).click();
  assert.equal(
    await first
      .locator('.onboarding-illustration [data-motion="branch-bloom"]')
      .getAttribute('data-phase'),
    'commit',
  );
  const continueFiles = first.getByRole('button', {
    name: 'Continue with your files',
    exact: true,
  });
  assert.equal(await continueFiles.isDisabled(), true);
  await first
    .getByRole('checkbox', { name: 'Choose practice file README.md', exact: true })
    .click();
  assert.equal(
    await first
      .getByRole('checkbox', { name: 'Choose practice file README.md' })
      .getAttribute('aria-checked'),
    'true',
  );
  await first.getByRole('button', { name: 'Continue with 1 file', exact: true }).click();
  assert.equal(
    await first.getByRole('button', { name: 'Save practice commit', exact: true }).isDisabled(),
    true,
  );
  await first
    .getByRole('textbox', { name: 'What changed?', exact: true })
    .fill('Add a welcome message');
  await first.getByRole('button', { name: 'Save practice commit', exact: true }).click();
  await first.getByRole('button', { name: 'Preview a push', exact: true }).click();
  await expectText(first, 'Preview complete');
  await expectText(first, 'This is a practice animation. Nothing is uploaded.');
  await capture(first, 'desktop-practice-complete.png');
  check('Practice teaches file selection, a named local commit, and an explicitly simulated push');

  await first.getByRole('button', { name: 'Choose my project', exact: true }).click();
  await expectText(first, 'Working locally for now');
  await first.getByRole('button', { name: 'Explore the workspace', exact: true }).click();
  await first.locator('.onboarding-dialog').waitFor({ state: 'hidden' });
  await first.locator('.monaco-diff-editor').waitFor({ state: 'visible', timeout: 45_000 });
  assert.equal(await first.evaluate(() => localStorage.getItem('branchline.guide.v1')), 'seen');
  await first.reload();
  await waitForEditor(first);
  assert.equal(await first.locator('.onboarding-dialog').count(), 0);
  check('Completing the guide keeps local work available and remembers the choice after reload');

  await first.keyboard.press('Control+k');
  await first.getByPlaceholder('What would you like to do?').fill('Getting started');
  await first.keyboard.press('Enter');
  await first.getByRole('dialog', { name: 'A good place to start.', exact: true }).waitFor();
  await closeGuide(first);
  await first.getByRole('button', { name: /^A little help/ }).click();
  await first.getByRole('button', { name: 'Getting started guide', exact: true }).click();
  await first.getByRole('dialog', { name: 'A good place to start.', exact: true }).waitFor();
  await closeGuide(first);
  check('The guide can be replayed from both the command palette and A little help');

  await openAccount(first);
  await first.keyboard.press('Escape');
  await first.locator('.onboarding-dialog').waitFor({ state: 'hidden' });
  await first.waitForFunction(
    () => document.querySelector('[aria-label="GitHub account"]') === document.activeElement,
    null,
    { timeout: 2_000 },
  );
  assert.equal(
    await first
      .getByRole('button', { name: 'GitHub account', exact: true })
      .evaluate((button) => button === document.activeElement),
    true,
  );
  check('Escape closes the account guide and returns keyboard focus to its launcher');

  for (const width of [320, 390]) {
    const narrow = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    monitor(narrow, `guide-${width}px-reduced-motion`);
    await narrow.goto(baseURL);
    await openGuideFromHome(narrow);
    assert.equal(
      await narrow.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      true,
    );
    for (const stage of [
      'Step 1: Welcome',
      'Step 2: Connect',
      'Step 3: Try it',
      'Step 4: Your project',
    ]) {
      await narrow.getByRole('button', { name: stage, exact: true }).click();
      await narrow.waitForTimeout(200);
      const geometry = await narrow.locator('.onboarding-dialog').evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          scrollWidth: dialog.scrollWidth,
          clientWidth: dialog.clientWidth,
          viewport: window.innerWidth,
        };
      });
      assert.ok(
        geometry.left >= -1 && geometry.right <= geometry.viewport + 1,
        `${width}px ${stage}: dialog must fit`,
      );
      assert.ok(
        geometry.scrollWidth <= geometry.clientWidth + 1,
        `${width}px ${stage}: no horizontal content overflow`,
      );
      const stageName = stage.split(': ')[1].toLowerCase().replaceAll(' ', '-');
      await capture(narrow, `mobile-${width}-${stageName}.png`);
    }
    await narrow.getByRole('button', { name: 'Explore the workspace', exact: true }).click();
    await narrow.locator('.onboarding-dialog').waitFor({ state: 'hidden' });
    await narrow.close();
  }
  check('Every guide step and BranchBloom remain usable at 320px and 390px with reduced motion');

  const unavailable = await nativePage({ configured: false });
  await openAccount(unavailable);
  await expectText(
    unavailable,
    'GitHub sign-in is not available in this build. Your files are safe; you can still work locally.',
  );
  assert.equal(
    await unavailable.getByRole('button', { name: 'Sign in with GitHub', exact: true }).count(),
    0,
  );
  await unavailable.getByRole('button', { name: 'Continue locally', exact: true }).click();
  await expectText(unavailable, 'Pick what belongs together.');
  await unavailable.close();
  check('A build without an OAuth Client ID still supports the guide and local work');

  const native = await nativePage();
  await openAccount(native);
  await native.getByText('What am I allowing?', { exact: true }).click();
  await native
    .getByText(
      'GitSomething requests access to your public and private repositories, including creating repositories and pushing code',
      { exact: false },
    )
    .waitFor();
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expectText(native, 'TEST-CODE');
  await native.waitForFunction(() =>
    window.__BRANCHLINE_AUTH_TEST__.commands.some(
      ({ command }) => command === 'github_auth_open_browser',
    ),
  );
  assert.equal(await native.locator('.onboarding-dialog input[type="password"]').count(), 0);
  await capture(native, 'desktop-github-approval.png');
  await native.setViewportSize({ width: 320, height: 844 });
  await capture(native, 'mobile-320-github-approval.png');
  assert.equal(
    await native
      .locator('.onboarding-dialog')
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1),
    true,
    '320px native approval has no horizontal overflow',
  );
  await native.setViewportSize({ width: 1440, height: 960 });
  await native.getByRole('button', { name: 'Cancel', exact: true }).click();
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  const canceledCommands = await native.evaluate(() => window.__BRANCHLINE_AUTH_TEST__.commands);
  assert.ok(canceledCommands.some(({ command }) => command === 'github_auth_cancel'));
  assert.equal(await native.getByText('TEST-CODE', { exact: true }).count(), 0);
  check(
    'Sign-in shows a one-time code, opens the trusted backend browser action, and cancels cleanly',
  );

  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await native
    .getByRole('button', { name: 'Disconnect', exact: true })
    .waitFor({ timeout: 15_000 });
  await expectText(native, 'Signed in as @branchline-fixture');
  await capture(native, 'desktop-github-connected.png');
  await native.waitForFunction(
    () =>
      document.querySelector('[aria-label="GitHub account"]')?.textContent ===
      '@branchline-fixture',
    null,
    { timeout: 3_000 },
  );
  assert.equal(
    await native.locator('[aria-label="GitHub account"]').textContent(),
    '@branchline-fixture',
  );
  await native.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  check('Mocked consent connects the account across the interface and disconnect removes it');

  for (const [mode, expected] of [
    ['denied', 'GitHub sign-in was declined. You can try again or continue working locally.'],
    ['expired', 'Your sign-in code expired. Choose Sign in with GitHub to get a new one.'],
    ['error', 'Could not contact GitHub. Check your connection and try again.'],
  ]) {
    await native.evaluate((mode) => {
      window.__BRANCHLINE_AUTH_TEST__.mode = mode;
    }, mode);
    await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
    await expectText(native, 'TEST-CODE');
    try {
      await expectText(native, expected);
    } catch (error) {
      report.authFailure = {
        mode,
        actualAlerts: await native.getByRole('alert').allTextContents(),
        commands: await native.evaluate(() => window.__BRANCHLINE_AUTH_TEST__.commands),
        visibleContent: await native.locator('.onboarding-dialog').innerText(),
      };
      await capture(native, 'failed-consent-state.png');
      throw error;
    }
    assert.equal(await native.getByText('TEST-CODE', { exact: true }).count(), 0);
    assert.equal(
      await native.getByRole('button', { name: 'Continue locally', exact: true }).isEnabled(),
      true,
    );
  }
  check('Denied, expired, and interrupted consent give retry guidance and preserve local access');

  await native.evaluate(() => {
    window.__BRANCHLINE_AUTH_TEST__.mode = 'defer';
  });
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expectText(native, 'TEST-CODE');
  await native.waitForFunction(
    () => typeof window.__BRANCHLINE_AUTH_TEST__.resolvePoll === 'function',
    { timeout: 15_000 },
  );
  await native.getByRole('button', { name: 'Cancel', exact: true }).click();
  await native.evaluate(() =>
    window.__BRANCHLINE_AUTH_TEST__.resolvePoll({
      status: 'connected',
      account: { login: 'late-account', name: 'Late Account', email: null, avatarUrl: '' },
    }),
  );
  await native.waitForTimeout(250);
  assert.equal(await native.getByText('Signed in as @late-account', { exact: true }).count(), 0);
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  check('A late successful poll cannot reconnect the interface after cancellation');

  // Use real browser time and tag responses, rather than relying on an exact
  // global poll count. Extra legitimate pending polls are allowed; the delays
  // before the next stage must still honor GitHub's minimum intervals.
  const timing = await nativePage();
  await openAccount(timing);
  report.pollingClock = 'Real browser time; mode-tagged 5s/10s frontend polling checks';
  await timing.evaluate(() => {
    window.__BRANCHLINE_AUTH_TEST__.mode = 'pending';
  });
  await timing.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await timing.waitForFunction(
    () =>
      window.__BRANCHLINE_AUTH_TEST__.commands.some(
        ({ command, pollMode }) => command === 'github_auth_poll' && pollMode === 'pending',
      ),
    null,
    { timeout: 30_000 },
  );
  await timing.evaluate(() => {
    window.__BRANCHLINE_AUTH_TEST__.mode = 'slow_down';
  });
  await timing.waitForFunction(
    () =>
      window.__BRANCHLINE_AUTH_TEST__.commands.some(
        ({ command, pollMode }) => command === 'github_auth_poll' && pollMode === 'slow_down',
      ),
    null,
    { timeout: 30_000 },
  );
  await timing.evaluate(() => {
    window.__BRANCHLINE_AUTH_TEST__.mode = 'connected';
  });
  await timing
    .getByRole('button', { name: 'Disconnect', exact: true })
    .waitFor({ timeout: 30_000 });
  const timingCommands = await timing.evaluate(() => window.__BRANCHLINE_AUTH_TEST__.commands);
  const timingPolls = timingCommands.filter(({ command }) => command === 'github_auth_poll');
  const firstPending = timingPolls.findIndex(({ pollMode }) => pollMode === 'pending');
  const firstSlow = timingPolls.findIndex(({ pollMode }) => pollMode === 'slow_down');
  const firstConnected = timingPolls.findIndex(({ pollMode }) => pollMode === 'connected');
  assert.ok(
    firstPending >= 0 && firstSlow > firstPending && firstConnected > firstSlow,
    'Consent must progress pending ? slow_down ? connected',
  );
  const firstDelayMs =
    timingPolls[0].calledAt -
    timingCommands.find(({ command }) => command === 'github_auth_start').calledAt;
  const pendingDelayMs = timingPolls[firstSlow].calledAt - timingPolls[firstSlow - 1].calledAt;
  const slowDownDelayMs =
    timingPolls[firstConnected].calledAt - timingPolls[firstConnected - 1].calledAt;
  assert.ok(firstDelayMs >= 4_900, 'The first authorization poll must wait at least 5 seconds');
  assert.ok(
    pendingDelayMs >= 4_900,
    'Pending authorization must respect the 5-second poll interval',
  );
  assert.ok(slowDownDelayMs >= 9_900, 'Slow-down must raise the poll interval to 10 seconds');
  report.frontendPolling = { firstDelayMs, pendingDelayMs, slowDownDelayMs, polls: timingPolls };
  console.log(
    `Real-time polling gaps: first=${firstDelayMs}ms pending=${pendingDelayMs}ms slow_down=${slowDownDelayMs}ms`,
  );
  await timing.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await timing.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  check(
    'Pending consent respects its polling interval and GitHub slow-down postpones the next request',
  );
  await timing.close();

  await closeGuide(native);
  await native.setViewportSize({ width: 320, height: 844 });
  await openPublish(native);
  assert.equal(await native.locator('.publish-dialog input[type="password"]').count(), 0);
  assert.equal(
    await native
      .getByRole('slider', { name: 'Slide to create & push', exact: true })
      .getAttribute('aria-disabled'),
    'true',
  );
  await native
    .getByRole('button', { name: 'Drop a folder here, or choose one', exact: false })
    .click();
  assert.equal(
    await native
      .getByRole('slider', { name: 'Slide to create & push', exact: true })
      .getAttribute('aria-disabled'),
    'true',
  );
  await native.evaluate(() => {
    window.__BRANCHLINE_AUTH_TEST__.mode = 'connected';
  });
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expectText(native, 'TEST-CODE');
  await native
    .getByRole('button', { name: 'Disconnect', exact: true })
    .waitFor({ timeout: 15_000 });
  await native.locator('.publish-dialog').evaluate((dialog) => {
    dialog.scrollTop = dialog.scrollHeight;
  });
  await confirmSlide(native);
  await native.getByRole('button', { name: 'Open repository', exact: true }).waitFor();
  assert.equal(
    await native.locator('.publish-dialog').evaluate((dialog) => dialog.scrollTop),
    0,
    'Switching to publish progress returns the dialog to its header',
  );
  await capture(native, 'mobile-320-publish-complete.png');
  check('Publishing progress restores the narrow dialog header after submitting a scrolled form');
  const publishes = await native.evaluate(() => window.__BRANCHLINE_AUTH_TEST__.publishes);
  assert.equal(publishes.length, 1);
  assert.equal(publishes[0].provider, 'github');
  assert.equal(publishes[0].token, '');
  assert.equal(publishes[0].authorName, 'Branchline Fixture');
  assert.equal(publishes[0].authorEmail, 'fixture@example.invalid');
  check(
    'Publishing requires connected GitHub, autofills author identity, and sends no GitHub credential through IPC',
  );

  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider traffic: ${JSON.stringify(report.providerRequests)}`,
  );
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check('Guide and mocked consent produce no browser errors or real provider requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('studio-onboarding-browser-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
