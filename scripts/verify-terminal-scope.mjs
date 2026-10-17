import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace } from './workspace-fixture.mjs';
import { confirmSlide } from './slide-fixture.mjs';

// Fixed production preview. Git writes use the explicit practice repository;
// the native error case mocks IPC. No provider or actual repository is changed.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('terminal-scope/', artifacts);
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
    'Git and provider operations remain visible; interface interactions never enter the terminal or its clipboard export',
  checks: [],
  screenshots: [],
  errors: [],
  providerRequests: [],
};
function check(name) {
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
function monitor(page, surface) {
  page.on('pageerror', (error) => report.errors.push({ surface, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ surface, message: message.text() });
  });
  page.on('request', (request) => {
    if (/https:\/\/(?:api\.)?(?:github\.com|gitlab\.com)/.test(request.url()))
      report.providerRequests.push(request.url());
  });
}
const stream = (page) =>
  page.getByRole('log', { name: 'Git and GitHub operations', exact: true, includeHidden: true });
const input = (page) => page.getByRole('textbox', { name: 'Guided Git command', exact: true });
const entries = (page) => stream(page).locator('.glass-entry');
const outputs = (page) => stream(page).locator('.glass-command-output');
async function pageFor(surface, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  monitor(page, surface);
  await page.addInitScript(() => {
    localStorage.setItem('branchline.guide.v1', 'seen');
    window.__TERMINAL_SCOPE_CLIPBOARD__ = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text) {
          window.__TERMINAL_SCOPE_CLIPBOARD__ = text;
        },
      },
    });
  });
  return page;
}
async function run(page, source, expected) {
  const count = await outputs(page).count();
  await input(page).fill(source);
  await input(page).press('Enter');
  await expect(outputs(page)).toHaveCount(count + 1);
  await expect(outputs(page).last()).toContainText(expected);
  return outputs(page).last();
}
async function snapshot(page) {
  return entries(page).allTextContents();
}
async function copied(page) {
  await page.getByRole('button', { name: 'Copy visible console', exact: true }).click();
  return page.evaluate(() => window.__TERMINAL_SCOPE_CLIPBOARD__);
}
async function assertQuiet(page, before, name) {
  await expect.poll(() => snapshot(page)).toEqual(before.entries);
  assert.equal(
    await copied(page),
    before.clipboard,
    `${name}: copied terminal must remain unchanged`,
  );
  assert.deepEqual(await snapshot(page), before.entries, `${name}: copying must not log itself`);
  check(name);
}
async function baseline(page) {
  const text = await snapshot(page);
  const clipboard = await copied(page);
  assert.deepEqual(await snapshot(page), text, 'Copy must not create its own terminal entry');
  return { entries: text, clipboard };
}
async function capture(page, filename) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL(filename, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/terminal-scope/${filename}`);
}
async function resize(page, name, key) {
  const handle = page.getByRole('separator', { name, exact: true });
  await handle.focus();
  await handle.press(key);
  await handle.blur();
}
async function installNativeFixture(page) {
  await page.addInitScript(() => {
    let nextId = 0;
    const callbacks = new Map();
    const listeners = new Map();
    const state = {
      path: 'C:\\terminal-scope-fixture\\project',
      connected: true,
      publishes: [],
      calls: [],
    };
    window.__TERMINAL_SCOPE_NATIVE__ = state;
    const status = () => ({
      configured: true,
      connected: state.connected,
      scopes: state.connected ? ['repo', 'workflow'] : [],
      account: state.connected
        ? {
            login: 'scope-fixture',
            name: 'Scope Fixture',
            email: 'fixture@example.invalid',
            avatarUrl: '',
          }
        : null,
    });
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
        state.calls.push(command);
        if (command === 'github_auth_status') return status();
        if (command === 'list_github_repositories')
          return { repositories: [], nextPage: null, accountLogin: 'scope-fixture' };
        if (command === 'github_auth_disconnect') {
          state.connected = false;
          return;
        }
        if (command === 'github_auth_start') throw new Error('Fixture GitHub sign-in unavailable.');
        if (command === 'plugin:event|listen') {
          const id = ++nextId;
          listeners.set(id, args);
          return id;
        }
        if (command === 'plugin:event|unlisten') {
          listeners.delete(args.eventId);
          return;
        }
        if (command === 'plugin:dialog|open') return state.path;
        if (command === 'open_repository')
          return {
            path: state.path,
            name: 'project',
            branch: 'main',
            files: [],
            guardian: null,
            commits: [
              {
                id: 'abc123abc123',
                summary: 'Scope fixture checkpoint',
                author: 'Fixture',
                timestamp: 1700000000,
                parents: [],
              },
            ],
            branches: [{ name: 'main', current: true, target: 'abc123abc123' }],
          };
        if (command === 'fetch_repository')
          throw new Error('Fixture authentication blocked fetch before Git began.');
        if (command === 'publish_repository') {
          state.publishes.push(args.request);
          await new Promise((resolve, reject) => {
            state.resolvePublish = resolve;
            state.rejectPublish = reject;
          });
          return {
            path: args.request.path,
            url: `https://github.com/scope-fixture/${args.request.name}`,
            branch: 'main',
          };
        }
        throw new Error(`Unexpected terminal-scope fixture IPC: ${command}`);
      },
    };
  });
}

try {
  const desktop = await pageFor('desktop');
  await desktop.goto(baseURL);
  await enterDemoWorkspace(desktop);
  await expect(input(desktop)).toBeVisible();
  await run(desktop, 'git status --short', 'README.md');
  const before = await baseline(desktop);
  assert.ok(before.entries.length > 0);
  assert.ok(!before.clipboard.includes('Try the demo workspace'));

  await desktop.getByRole('tab', { name: 'History', exact: true }).click();
  await desktop.getByRole('tab', { name: /^Changes/ }).click();
  await desktop.locator('.file-select[title="README.md"]').click();
  await desktop.getByRole('textbox', { name: 'Filter changed files', exact: true }).fill('README');
  await desktop.getByRole('textbox', { name: 'Filter changed files', exact: true }).fill('');
  await desktop.getByRole('button', { name: 'Toggle repository sidebar', exact: true }).click();
  await desktop.getByRole('button', { name: 'Toggle repository sidebar', exact: true }).click();
  await desktop.keyboard.press('Control+k');
  await desktop.getByPlaceholder('What would you like to do?').fill('history');
  await desktop.keyboard.press('Escape');
  await desktop.getByRole('button', { name: 'Back to home', exact: true }).click();
  await desktop.getByRole('button', { name: 'Continue workspace', exact: true }).click();
  await assertQuiet(
    desktop,
    before,
    'Navigation, file inspection, filtering, sidebar toggles, palette search, and Home/Continue leave transcript and copied output unchanged',
  );

  await resize(desktop, 'Resize repository sidebar', 'ArrowRight');
  await resize(desktop, 'Resize changed files', 'ArrowRight');
  await resize(desktop, 'Resize Glass Box terminal', 'ArrowUp');
  const terminalHandle = desktop.getByRole('separator', {
    name: 'Resize Glass Box terminal',
    exact: true,
  });
  const box = await terminalHandle.boundingBox();
  await desktop.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 6 });
  await desktop.mouse.up();
  await desktop.getByRole('button', { name: 'Terminal appearance', exact: true }).click();
  await desktop
    .getByRole('combobox', { name: 'Terminal text size', exact: true })
    .selectOption('16');
  await desktop.getByRole('button', { name: 'Reset terminal appearance', exact: true }).click();
  await desktop.keyboard.press('Escape');
  await desktop.setViewportSize({ width: 1280, height: 900 });
  await desktop.setViewportSize({ width: 1440, height: 1000 });
  await assertQuiet(
    desktop,
    before,
    'Keyboard and pointer resizing, text preferences, reset, and window resizing stay out of the terminal and clipboard',
  );

  await desktop.getByRole('button', { name: 'Learn about commit', exact: true }).click();
  await desktop.locator('.learning-flow-more').click();
  await expect(
    desktop.getByRole('complementary', { name: 'Git learning panel', exact: true }),
  ).toBeVisible();
  await desktop
    .getByRole('combobox', { name: 'Learning topic', exact: true })
    .selectOption('branch');
  await desktop.locator('.glass-try-command').click();
  await expect(input(desktop)).toHaveValue('git branch');
  await input(desktop).fill('');
  await desktop.getByRole('button', { name: 'Hide learning panel', exact: true }).click();
  await desktop.getByRole('button', { name: 'A little help', exact: false }).click();
  await expect(desktop.getByRole('dialog', { name: 'A calmer way to Git.' })).toBeVisible();
  await desktop.getByRole('button', { name: 'Close help', exact: true }).click();
  await desktop.keyboard.press('Control+j');
  await desktop.keyboard.press('Control+j');
  await assertQuiet(
    desktop,
    before,
    'Lessons still open and prepare commands; topic selection, help dialogs, and terminal toggles create no transcript entries',
  );

  await run(desktop, 'help', 'Save and share');
  const beforeScroll = await baseline(desktop);
  const scroll = await stream(desktop).evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
    return { viewport: element.clientHeight, content: element.scrollHeight };
  });
  assert.ok(scroll.content > scroll.viewport + 24, 'Help supplies real scrollable output');
  await expect(desktop.getByRole('button', { name: 'Follow latest', exact: true })).toBeVisible();
  await desktop.getByRole('button', { name: 'Follow latest', exact: true }).click();
  await assertQuiet(
    desktop,
    beforeScroll,
    'Scrolling and Follow latest preserve the exact Git transcript and copied text',
  );

  const file = 'src/components/Dropzone.tsx';
  for (const action of ['Stage', 'Unstage', 'Stage']) {
    const count = await stream(desktop).locator('.glass-command-line').count();
    await desktop.getByRole('button', { name: `${action} ${file}`, exact: true }).click();
    await expect(stream(desktop).locator('.glass-command-line')).toHaveCount(count + 1);
    await expect(stream(desktop).locator('.glass-command-line').last()).toContainText(
      action === 'Unstage' ? 'restore' : 'add',
    );
  }
  await desktop
    .getByRole('textbox', { name: 'Commit message', exact: true })
    .fill('Keep the terminal focused on Git');
  await desktop.getByRole('button', { name: /Commit changes/ }).click();
  await expect(stream(desktop).locator('.glass-command-line').last()).toContainText(
    'Keep the terminal focused on Git',
  );
  await run(desktop, 'git log --oneline', 'Keep the terminal focused on Git');
  check(
    'Stage, unstage, and commit retain their equivalent Git operations and update practice repository state',
  );

  for (const action of ['Fetch', 'Pull']) {
    const count = await stream(desktop).locator('.glass-command-line').count();
    await desktop.getByRole('button', { name: action, exact: true }).click();
    await expect(stream(desktop).locator('.glass-command-line')).toHaveCount(count + 1);
    await expect(stream(desktop).locator('.glass-command-line').last()).toContainText(
      action.toLowerCase(),
    );
  }
  const pushCount = await stream(desktop).locator('.glass-command-line').count();
  const push = desktop.getByRole('slider', { name: 'Slide to push', exact: true });
  const beforeCancel = await baseline(desktop);
  await push.focus();
  await push.press('End');
  await push.press('Escape');
  await assertQuiet(
    desktop,
    beforeCancel,
    'An abandoned push confirmation creates no operation or slider-interaction noise',
  );
  await confirmSlide(desktop, 'Slide to push');
  await expect(stream(desktop).locator('.glass-command-line')).toHaveCount(pushCount + 1);
  await expect(stream(desktop).locator('.glass-command-line').last()).toContainText('push');
  check(
    'Fetch, Pull, and confirmed Push retain equivalent commands without generic button or slider entries',
  );

  const unchangedFiles = await desktop.locator('.file-row').count();
  await run(desktop, 'git reset --hard', 'unavailable');
  await expect(entries(desktop).last()).toHaveClass(/glass-entry-error/);
  await run(desktop, 'git status && git push', 'Shell operators');
  await run(desktop, 'ls', 'Start with git');
  assert.equal(await desktop.locator('.file-row').count(), unchangedFiles);
  check(
    'Guided help, rejected destructive commands, shell chains, and invalid commands keep their safety explanations in the terminal',
  );

  await desktop.getByRole('button', { name: 'Clear visible console', exact: true }).click();
  await expect(entries(desktop)).toHaveCount(0);
  assert.equal(await copied(desktop), '');
  await expect(entries(desktop)).toHaveCount(0);
  await run(desktop, 'git branch', '* feature/dropzone');
  await expect(entries(desktop)).toHaveCount(1);
  await capture(desktop, '1440-git-only-terminal.png');
  check('Clear and Copy stay silent; the next guided command appears once with its output');

  for (const width of [390, 320]) {
    const mobile = await pageFor(`${width}px`, { width, height: 960 });
    await mobile.goto(baseURL);
    await enterDemoWorkspace(mobile);
    await run(mobile, 'git status --short', 'README.md');
    const stable = await baseline(mobile);
    await resize(mobile, 'Resize Glass Box terminal', 'End');
    await mobile.getByRole('button', { name: 'Terminal appearance', exact: true }).click();
    await mobile
      .getByRole('combobox', { name: 'Terminal text size', exact: true })
      .selectOption('16');
    await mobile.keyboard.press('Escape');
    await mobile.getByRole('button', { name: 'Learn about stage', exact: true }).click();
    await mobile.locator('.learning-flow-command').click();
    await input(mobile).fill('');
    await assertQuiet(
      mobile,
      stable,
      `${width}px resizing, learning, and terminal appearance do not pollute the Git transcript`,
    );
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await capture(mobile, `${width}-git-only-terminal.png`);
    await mobile.close();
  }

  const native = await pageFor('native-operation-contract');
  await installNativeFixture(native);
  await native.goto(baseURL);
  await native.locator('.home-page .add-repository').click();
  await expect(input(native)).toBeVisible();
  await native.getByRole('button', { name: 'Fetch', exact: true }).click();
  await expect(stream(native)).toContainText(
    'Fixture authentication blocked fetch before Git began.',
  );
  await expect(entries(native).last()).toHaveClass(/glass-entry-error/);
  await native
    .getByRole('group', { name: 'Filter terminal entries', exact: true })
    .getByRole('button', { name: 'Events', exact: true })
    .click();
  await expect(stream(native)).toContainText('Fixture authentication blocked fetch');
  check('Native preflight failures remain visible as operation events even when Git never starts');

  await native.keyboard.press('Control+k');
  await native.getByPlaceholder('What would you like to do?').fill('Create');
  await native.keyboard.press('Enter');
  await expect(native.locator('.publish-dialog')).toBeVisible();
  const beforePublishing = await entries(native).count();
  await native
    .getByRole('button', { name: 'Drop a folder here, or choose one', exact: false })
    .click();
  await native.getByLabel('Repository name', { exact: true }).fill('scope-project');
  await native.getByRole('button', { name: 'Public', exact: true }).click();
  assert.equal(
    await entries(native).count(),
    beforePublishing,
    'Preparing a publish form must stay silent',
  );
  await confirmSlide(native);
  await expect
    .poll(() => native.evaluate(() => window.__TERMINAL_SCOPE_NATIVE__.publishes.length))
    .toBe(1);
  await expect(entries(native)).toHaveCount(beforePublishing + 1);
  await expect(entries(native).last().getByLabel('running', { exact: true })).toHaveCount(1);
  await native.evaluate(() => window.__TERMINAL_SCOPE_NATIVE__.resolvePublish());
  await expect(native.getByRole('button', { name: 'Open repository', exact: true })).toBeVisible();
  await expect(entries(native).last().getByLabel('success', { exact: true })).toHaveCount(1);
  await native.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  check(
    'Only confirmed publishing creates an event, which updates from running to success without duplicate rows',
  );

  await native.keyboard.press('Control+k');
  await native.getByPlaceholder('What would you like to do?').fill('Create');
  await native.keyboard.press('Enter');
  await confirmSlide(native);
  await expect
    .poll(() => native.evaluate(() => window.__TERMINAL_SCOPE_NATIVE__.publishes.length))
    .toBe(2);
  await native.evaluate(() =>
    window.__TERMINAL_SCOPE_NATIVE__.rejectPublish(
      new Error('Fixture publishing failed before push.'),
    ),
  );
  await expect(native.getByRole('alert')).toContainText('Fixture publishing failed before push.');
  await expect(entries(native).last()).toHaveClass(/glass-entry-error/);
  await native.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  await expect(stream(native)).toContainText('Fixture publishing failed before push.');
  check('Publishing errors remain in the operation transcript after dismissing the dialog');

  const beforeAccountGuidance = await entries(native).count();
  await native.getByRole('button', { name: 'GitHub account', exact: true }).click();
  assert.equal(await entries(native).count(), beforeAccountGuidance);
  await native.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(
    native.getByRole('button', { name: 'Sign in with GitHub', exact: true }),
  ).toBeVisible();
  await expect(entries(native).last().getByLabel('success', { exact: true })).toHaveCount(1);
  await native.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await expect(native.locator('.github-auth-error')).toContainText(
    'Fixture GitHub sign-in unavailable.',
  );
  await native.getByRole('button', { name: 'Close GitHub account', exact: true }).click();
  await expect(stream(native)).toContainText(/GitHub/);
  await expect(entries(native).last()).toHaveClass(/glass-entry-error/);
  await capture(native, 'native-operation-events.png');
  check(
    'Actual disconnect and failed GitHub sign-in attempts remain visible, while opening account guidance stays silent',
  );
  const nativeEventCount = await entries(native).count();
  const nativeFilters = native.getByRole('group', { name: 'Filter terminal entries', exact: true });
  await nativeFilters.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(entries(native)).toHaveCount(0);
  await nativeFilters.getByRole('button', { name: 'All operations', exact: true }).click();
  await expect(entries(native)).toHaveCount(nativeEventCount);
  check(
    'Commands hides provider events; All operations restores them without logging filter changes',
  );
  await native.close();

  assert.equal(
    report.providerRequests.length,
    0,
    'Practice-only checks must not contact a provider',
  );
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  check('Desktop and mobile checks produce no provider requests or browser errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('terminal-scope-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
