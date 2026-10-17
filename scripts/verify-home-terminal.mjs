import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace, openGuideFromHome } from './workspace-fixture.mjs';

// Use a fixed production preview. The native-routing case below mocks IPC and
// verifies the frontend contract only; no provider or actual Git writes occur.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('home-terminal/', artifacts);
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
    'Home navigation, preserved workspace, recent-repository IPC contract, adjustable terminal',
  checks: [],
  screenshots: [],
  geometry: [],
  issues: [],
  errors: [],
  providerRequests: [],
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
    if (/https:\/\/(?:api\.)?(?:github\.com|gitlab\.com)/.test(request.url()))
      report.providerRequests.push(request.url());
  });
}
const home = (page) => page.locator('.home-page');
const terminal = (page) => page.getByRole('region', { name: 'Glass-Box Git console', exact: true });
const handle = (page) =>
  page.getByRole('separator', { name: 'Resize Glass Box terminal', exact: true });
const input = (page) => page.getByRole('textbox', { name: 'Guided Git command', exact: true });
const homeButton = (page) => page.getByRole('button', { name: 'Back to home', exact: true });
async function capture(page, filename) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL(filename, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/home-terminal/${filename}`);
}
async function inspect(page, surface) {
  const result = await page.evaluate(() => {
    const rectangle = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      home: rectangle(document.querySelector('.home-page')),
      terminal: rectangle(document.querySelector('[aria-label="Glass-Box Git console"]')),
      input: rectangle(document.querySelector('#glass-command-input')),
      handle: rectangle(document.querySelector('[aria-label="Resize Glass Box terminal"]')),
    };
  });
  report.geometry.push({ surface, ...result });
  if (result.scrollWidth > result.width + 1)
    report.issues.push({ surface, message: 'Document must fit horizontally', geometry: result });
  for (const name of ['home', 'terminal', 'input', 'handle']) {
    const box = result[name];
    if (!box || box.width < 1 || box.height < 1) continue;
    if (box.x < -1 || box.right > result.width + 1)
      report.issues.push({ surface, message: `${name} must fit horizontally`, box });
    if (name === 'input')
      if (box.y < 0 || box.bottom > result.height + 1)
        report.issues.push({ surface, message: 'Terminal input must stay visible', box });
  }
  return result;
}
async function freshPage(surface, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  monitor(page, surface);
  await page.goto(baseURL);
  await expect(home(page)).toBeVisible();
  return page;
}
async function run(page, source, expected) {
  const outputs = page.locator('.glass-command-output');
  const count = await outputs.count();
  await input(page).fill(source);
  await input(page).press('Enter');
  await expect(outputs).toHaveCount(count + 1);
  await expect(outputs.last()).toContainText(expected);
}

try {
  const desktop = await freshPage('desktop');
  await expect(desktop.locator('.monaco-diff-editor')).toHaveCount(0);
  await expect(desktop.locator('.onboarding-dialog')).toHaveCount(0);
  await expect(
    desktop.getByRole('button', { name: 'Try demo workspace', exact: true }),
  ).toBeVisible();
  await inspect(desktop, '1440px-home');
  await capture(desktop, '1440-home.png');
  check('A fresh launch opens Home without mounting Monaco or an automatic guide overlay');

  await openGuideFromHome(desktop);
  await expect(
    desktop.getByRole('dialog', { name: 'A good place to start.', exact: true }),
  ).toBeVisible();
  await desktop.getByRole('button', { name: 'Close getting started guide', exact: true }).click();
  await expect(home(desktop)).toBeVisible();
  await desktop.getByRole('button', { name: 'Publish a local folder', exact: true }).click();
  await expect(desktop.locator('.publish-dialog')).toBeVisible();
  await desktop.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  await expect(home(desktop)).toBeVisible();
  check('Home opens the guide and folder-publishing workflow and returns safely after dismissal');

  await enterDemoWorkspace(desktop);
  const draft = 'Keep this unfinished commit message';
  await desktop.getByRole('textbox', { name: 'Commit message', exact: true }).fill(draft);
  await desktop.locator('.file-select[title="README.md"]').click();
  await expect(desktop.locator('.diff-file')).toContainText('README.md');
  await run(desktop, 'git status --short', 'README.md');
  await input(desktop).fill('git branch');
  await desktop.getByRole('tab', { name: 'History', exact: true }).click();
  await homeButton(desktop).click();
  await expect(home(desktop)).toBeVisible();
  await expect(input(desktop)).not.toBeVisible();
  await expect(
    desktop.getByRole('button', { name: 'Continue workspace', exact: true }),
  ).toBeVisible();
  await desktop.getByRole('button', { name: 'Continue workspace', exact: true }).click();
  await expect(desktop.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await desktop.getByRole('tab', { name: /^Changes/ }).click();
  await expect(desktop.getByRole('textbox', { name: 'Commit message', exact: true })).toHaveValue(
    draft,
  );
  await expect(desktop.locator('.diff-file')).toContainText('README.md');
  await expect(input(desktop)).toHaveValue('git branch');
  await expect(desktop.locator('.glass-command-output').last()).toContainText('README.md');
  await input(desktop).fill('');
  assert.deepEqual(
    await desktop.evaluate(() =>
      JSON.parse(localStorage.getItem('branchline.recent-repositories.v1') || '[]'),
    ),
    [],
  );
  check(
    'Home and Continue preserve the current tab, selected file, unfinished commit, terminal draft, and results; demo creates no recent repository',
  );

  await expect(handle(desktop)).toHaveAttribute('aria-orientation', 'horizontal');
  await handle(desktop).focus();
  const initialHeight = Number(await handle(desktop).getAttribute('aria-valuenow'));
  await handle(desktop).press('ArrowUp');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', String(initialHeight + 24));
  await handle(desktop).press('Shift+ArrowDown');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', String(initialHeight + 16));
  await handle(desktop).press('Home');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', '160');
  await handle(desktop).press('ArrowDown');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', '160');
  await handle(desktop).press('End');
  const maximum = Number(await handle(desktop).getAttribute('aria-valuemax'));
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', String(maximum));
  await handle(desktop).press('ArrowUp');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', String(maximum));
  check(
    'The accessible resize handle supports coarse and fine keyboard adjustments and enforces its minimum and maximum',
  );

  await handle(desktop).press('Home');
  await desktop.waitForTimeout(250);
  const resizeBounds = await handle(desktop).boundingBox();
  assert.ok(resizeBounds);
  await desktop.mouse.move(
    resizeBounds.x + resizeBounds.width / 2,
    resizeBounds.y + resizeBounds.height / 2,
  );
  await desktop.mouse.down();
  await desktop.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y - 90, {
    steps: 12,
  });
  await desktop.mouse.up();
  await expect
    .poll(async () => Number(await handle(desktop).getAttribute('aria-valuenow')))
    .toBeGreaterThan(235);
  const draggedHeight = Number(await handle(desktop).getAttribute('aria-valuenow'));
  await expect
    .poll(async () => (await desktop.locator('.glass-terminal-content').boundingBox()).height)
    .toBeCloseTo(draggedHeight, 0);
  await inspect(desktop, '1440px-resized-terminal');
  check(
    'Dragging the terminal edge upward grows its real content area while keeping the command input visible',
  );

  await desktop.getByRole('button', { name: 'Terminal appearance', exact: true }).click();
  const appearance = desktop.getByRole('dialog', { name: 'Terminal appearance', exact: true });
  await expect(appearance).toBeVisible();
  const font = appearance.getByRole('combobox', { name: 'Terminal text size', exact: true });
  assert.deepEqual(
    await font
      .locator('option')
      .evaluateAll((options) => options.map((option) => Number(option.value))),
    [12, 13, 14, 15, 16, 17, 18],
  );
  await font.selectOption('18');
  await expect(input(desktop)).toHaveCSS('font-size', '18px');
  await desktop.keyboard.press('Escape');
  await expect(appearance).not.toBeVisible();
  await expect(
    desktop.getByRole('button', { name: 'Terminal appearance', exact: true }),
  ).toBeFocused();
  await capture(desktop, '1440-adjusted-terminal.png');
  const stored = await desktop.evaluate(() =>
    JSON.parse(localStorage.getItem('branchline.terminal.v1')),
  );
  assert.equal(stored.fontSize, 18);
  assert.equal(stored.height, draggedHeight);
  await desktop.reload();
  await expect(home(desktop)).toBeVisible();
  await expect(desktop.locator('.monaco-diff-editor')).toHaveCount(0);
  await enterDemoWorkspace(desktop);
  await expect(input(desktop)).toHaveCSS('font-size', '18px');
  await expect(handle(desktop)).toHaveAttribute('aria-valuenow', String(draggedHeight));
  check(
    'Terminal typography offers 12–18px, closes accessibly, and preserves font size and height across a fresh Home launch',
  );

  await desktop.setViewportSize({ width: 1440, height: 650 });
  await handle(desktop).focus();
  await handle(desktop).press('End');
  await inspect(desktop, '1440px-short-window-maximum');
  await desktop.getByRole('button', { name: 'Terminal appearance', exact: true }).click();
  await desktop.getByRole('button', { name: 'Reset terminal appearance', exact: true }).click();
  await expect(input(desktop)).toHaveCSS('font-size', '13px');
  await desktop.keyboard.press('Escape');
  check('Window height constrains the terminal and Reset restores readable default typography');

  const shortWindow = await freshPage('fresh-short-window', { width: 1440, height: 650 });
  await enterDemoWorkspace(shortWindow);
  await expect(shortWindow.locator('.monaco-diff-editor')).toBeVisible();
  await expect(shortWindow.locator('.glass-terminal-toggle')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await shortWindow.keyboard.press('Control+j');
  await expect(input(shortWindow)).toBeVisible();
  await handle(shortWindow).focus();
  await handle(shortWindow).press('End');
  await inspect(shortWindow, '1440px-fresh-short-window-maximum');
  await capture(shortWindow, '1440-short-window-terminal.png');
  await shortWindow.close();
  check(
    'A fresh 650px-high window prioritizes Monaco; explicitly opening and resizing the terminal keeps its input on screen',
  );

  for (const width of [320, 390]) {
    const mobile = await freshPage(`${width}px`, { width, height: 960 });
    await inspect(mobile, `${width}px-home`);
    await capture(mobile, `${width}-home.png`);
    await enterDemoWorkspace(mobile);
    await handle(mobile).focus();
    await handle(mobile).press('End');
    await inspect(mobile, `${width}px-maximum-terminal`);
    await run(mobile, 'git branch', '* feature/dropzone');
    await mobile.getByRole('button', { name: 'Terminal appearance', exact: true }).click();
    await mobile
      .getByRole('combobox', { name: 'Terminal text size', exact: true })
      .selectOption('18');
    await mobile.keyboard.press('Escape');
    await inspect(mobile, `${width}px-large-terminal-text`);
    await capture(mobile, `${width}-terminal.png`);
    await mobile.close();
  }
  check(
    'At 320px and 390px, Home and maximum terminal sizes fit; large text remains usable with guided commands',
  );

  const native = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  monitor(native, 'mocked-native-routing');
  await native.addInitScript(() => {
    let nextId = 0;
    window.__HOME_ROUTE_FIXTURE__ = { path: 'C:\\fixture\\missing-repo', opens: [] };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
      transformCallback() {
        return ++nextId;
      },
      unregisterCallback() {},
      async invoke(command, args) {
        if (command === 'github_auth_status')
          return { configured: false, connected: false, account: null, scopes: [] };
        if (command === 'plugin:event|listen') return ++nextId;
        if (command === 'plugin:event|unlisten') return;
        if (command === 'plugin:dialog|open') return window.__HOME_ROUTE_FIXTURE__.path;
        if (command === 'open_repository') {
          window.__HOME_ROUTE_FIXTURE__.opens.push(args.path);
          if (args.path.includes('missing'))
            throw new Error('This folder is not a Git repository.');
          return {
            path: 'C:\\fixture\\actual-project',
            name: 'actual-project',
            branch: 'main',
            files: [],
            guardian: null,
            commits: [
              {
                id: 'abc123abc123',
                summary: 'Initial fixture commit',
                author: 'Fixture',
                timestamp: 1700000000,
                parents: [],
              },
            ],
            branches: [{ name: 'main', target: 'abc123abc123', current: true }],
          };
        }
        throw new Error(`Unexpected Home routing fixture IPC: ${command}`);
      },
    };
  });
  await native.goto(baseURL);
  await expect(home(native)).toBeVisible();
  await native.locator('.add-repository').click();
  await expect(native.getByRole('status')).toContainText('not a Git repository');
  await expect(home(native)).toBeVisible();
  assert.deepEqual(
    await native.evaluate(() =>
      JSON.parse(localStorage.getItem('branchline.recent-repositories.v1') || '[]'),
    ),
    [],
  );
  check(
    'A failed native open stays on Home, explains the error, and creates no false recent entry',
  );
  await native.evaluate(() => {
    window.__HOME_ROUTE_FIXTURE__.path = 'C:\\fixture\\actual-project';
  });
  await native.locator('.add-repository').click();
  await expect(home(native)).not.toBeVisible();
  await expect(terminal(native)).toBeVisible();
  const recents = await native.evaluate(() =>
    JSON.parse(localStorage.getItem('branchline.recent-repositories.v1')),
  );
  assert.equal(recents.length, 1);
  assert.equal(recents[0].name, 'actual-project');
  assert.equal(recents[0].path, 'C:\\fixture\\actual-project');
  await homeButton(native).click();
  await expect(
    native.getByRole('button', { name: 'Open actual-project', exact: true }),
  ).toBeVisible();
  await native.reload();
  await expect(home(native)).toBeVisible();
  await expect(native.locator('.monaco-diff-editor')).toHaveCount(0);
  await native.getByRole('button', { name: 'Open actual-project', exact: true }).click();
  await expect(terminal(native)).toBeVisible();
  assert.deepEqual(await native.evaluate(() => window.__HOME_ROUTE_FIXTURE__.opens), [
    'C:\\fixture\\actual-project',
  ]);
  check(
    'Only a successful native open enters the workspace and persists a recent repository; reopening a recent validates it through IPC again',
  );
  await homeButton(native).click();
  await native
    .getByRole('button', { name: 'Remove actual-project from recent repositories', exact: true })
    .click();
  await expect(
    native.getByRole('button', { name: 'Open actual-project', exact: true }),
  ).toHaveCount(0);
  await native.getByRole('button', { name: 'Continue workspace', exact: true }).click();
  await expect(terminal(native)).toBeVisible();
  assert.deepEqual(
    await native.evaluate(() =>
      JSON.parse(localStorage.getItem('branchline.recent-repositories.v1') || '[]'),
    ),
    [],
  );
  check(
    'Removing a recent shortcut leaves the current repository available through Continue workspace',
  );
  await native.close();

  assert.equal(
    report.issues.length,
    0,
    `Home or terminal geometry issues: ${JSON.stringify(report.issues)}`,
  );
  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider requests: ${report.providerRequests.join(', ')}`,
  );
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check(
    'Home, navigation, and terminal adjustments make no provider requests and produce no browser or Monaco errors',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('home-terminal-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
