import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace } from './workspace-fixture.mjs';
import { confirmSlide } from './slide-fixture.mjs';

// Fixed production preview; all actions use the explicit practice repository.
// There are no native IPC fixtures, provider credentials, or network mutations.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('workspace-layout/', artifacts);
const preferencesKey = 'gitsomething.workspace-layout.v1';
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
    'Workspace space allocation, pane resizing, accessible navigation, and responsive code review',
  checks: [],
  screenshots: [],
  geometry: [],
  errors: [],
  providerRequests: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const sidebarHandle = (page) =>
  page.getByRole('separator', { name: 'Resize repository sidebar', exact: true });
const filesHandle = (page) =>
  page.getByRole('separator', { name: 'Resize changed files', exact: true });
const sidebarToggle = (page) =>
  page.getByRole('button', { name: 'Toggle repository sidebar', exact: true });
const terminalInput = (page) =>
  page.getByRole('textbox', { name: 'Guided Git command', exact: true });
const value = async (control) => Number(await control.getAttribute('aria-valuenow'));
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
async function freshPage(surface, viewport, stored) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  monitor(page, surface);
  if (stored)
    await page.addInitScript(({ key, storedValue }) => localStorage.setItem(key, storedValue), {
      key: preferencesKey,
      storedValue: stored,
    });
  await page.goto(baseURL);
  await enterDemoWorkspace(page);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function capture(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/workspace-layout/${name}`);
}
async function geometry(page, surface) {
  const result = await page.evaluate(() => {
    const rectangle = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      sidebar: rectangle('.sidebar'),
      workspace: rectangle('.workspace-content'),
      changes: rectangle('.changes-view'),
      files: rectangle('.changes-panel'),
      diff: rectangle('.diff-panel'),
      editor: rectangle('.editor-container'),
      composer: rectangle('.commit-composer'),
      terminal: rectangle('[aria-label="Glass-Box Git console"]'),
      terminalInput: rectangle('#glass-command-input'),
    };
  });
  report.geometry.push({ surface, ...result });
  assert.ok(result.scrollWidth <= result.width + 1, `${surface}: document fits horizontally`);
  for (const key of ['files', 'diff', 'composer']) {
    const bounds = result[key];
    assert.ok(
      bounds && bounds.width > 0 && bounds.height > 0,
      `${surface}: ${key} has usable area`,
    );
    assert.ok(
      bounds.x >= -1 && bounds.right <= result.width + 1,
      `${surface}: ${key} fits horizontally`,
    );
  }
  const inputBounds = result.terminalInput;
  if (inputBounds)
    assert.ok(
      inputBounds.x >= -1 &&
        inputBounds.right <= result.width + 1 &&
        inputBounds.y >= -1 &&
        inputBounds.bottom <= result.height + 1,
      `${surface}: terminal input stays in the window`,
    );
  return result;
}
async function checkKeyboardResize(control) {
  await expect(control).toHaveAttribute('aria-orientation', 'vertical');
  await control.focus();
  await control.press('Home');
  const minimum = Number(await control.getAttribute('aria-valuemin'));
  await expect(control).toHaveAttribute('aria-valuenow', String(minimum));
  await control.press('ArrowLeft');
  await expect(control).toHaveAttribute('aria-valuenow', String(minimum));
  await control.press('ArrowRight');
  const increased = await value(control);
  assert.ok(increased > minimum);
  await control.press('ArrowLeft');
  await expect(control).toHaveAttribute('aria-valuenow', String(minimum));
  await control.press('End');
  const maximum = Number(await control.getAttribute('aria-valuemax'));
  await expect(control).toHaveAttribute('aria-valuenow', String(maximum));
  await control.press('ArrowRight');
  await expect(control).toHaveAttribute('aria-valuenow', String(maximum));
  await control.press('Home');
}
async function pointerResize(page, control, delta) {
  const initial = await value(control);
  const box = await control.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 100);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + delta, y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => value(control)).toBeGreaterThan(initial + delta - 3);
  return value(control);
}
async function cancelPointerResize(page, control) {
  const initial = await value(control);
  const saved = await page.evaluate((key) => localStorage.getItem(key), preferencesKey);
  const box = await control.boundingBox();
  assert.ok(box);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 100);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y, { steps: 5 });
  await expect.poll(() => value(control)).toBeGreaterThan(initial);
  const pointerId = await control.evaluate((element) => {
    for (let id = 0; id < 20; id += 1) if (element.hasPointerCapture(id)) return id;
    return null;
  });
  assert.notEqual(pointerId, null);
  await control.dispatchEvent('pointercancel', { pointerId, isPrimary: true });
  await page.mouse.up();
  await expect(control).toHaveAttribute('aria-valuenow', String(initial));
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), preferencesKey), saved);
  assert.equal(await page.evaluate(() => document.body.style.cursor), '');
}

try {
  let before = [];
  try {
    before = JSON.parse(await readFile(new URL('before.json', screenshots), 'utf8'));
  } catch {
    // The comparison is optional when running this suite in a fresh checkout.
  }
  for (const [width, height, editorMinimum] of [
    [1440, 1000, 300],
    [1280, 800, 240],
    [1440, 650, 180],
  ]) {
    const page = await freshPage(`${width}x${height}`, { width, height });
    await expect(page.locator('.activity-rail')).toBeHidden();
    await expect(page.locator('.workspace-masthead')).toHaveCount(0);
    await expect(page.locator('.journey-node')).toHaveCount(0);
    await expect(page.locator('.glass-learning')).toHaveCount(0);
    if (height >= 720) {
      const initialTerminalHeight = await value(
        page.getByRole('separator', { name: 'Resize Glass Box terminal', exact: true }),
      );
      assert.ok(initialTerminalHeight >= 160 && initialTerminalHeight <= 180);
    } else {
      await expect(page.locator('.glass-terminal-toggle')).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
    const measured = await geometry(page, `${width}x${height}-default`);
    assert.ok(
      measured.editor.height > editorMinimum,
      `${width}x${height}: code review has useful height`,
    );
    assert.ok(
      Math.abs(measured.composer.x - measured.files.x) <= 2,
      'Commit belongs in the file pane',
    );
    assert.ok(measured.composer.right <= measured.diff.x + 1, 'Commit does not consume diff width');
    assert.ok(
      measured.diff.bottom >= measured.composer.bottom - 2,
      'Diff spans the full file and commit column',
    );
    await expect(page.locator('.file-select').first()).toBeInViewport({ ratio: 0.99 });
    await expect(page.getByRole('button', { name: 'Commit changes', exact: true })).toBeInViewport({
      ratio: 0.99,
    });
    const old = before.find((entry) => entry.width === width && entry.height === height);
    if (old) {
      const previous = old.metrics['.editor-container'].height;
      report.geometry.at(-1).previousEditorHeight = previous;
      report.geometry.at(-1).editorHeightGain = measured.editor.height - previous;
      assert.ok(
        measured.editor.height > previous * 2,
        'Code review receives at least twice its former height',
      );
    }
    await capture(page, `after-${width}x${height}.png`);
    if (height < 720) {
      await page.keyboard.press('Control+j');
      await expect(terminalInput(page)).toBeVisible();
      const terminalOpen = await geometry(page, `${width}x${height}-terminal-open`);
      assert.ok(
        terminalOpen.editor.height >= 120,
        'The explicit terminal keeps useful code height',
      );
      assert.ok(
        terminalOpen.diff.bottom <= terminalOpen.terminal.y,
        'The diff must fit in the visible workspace above the terminal',
      );
      await expect(page.locator('.file-select').first()).toBeInViewport({ ratio: 0.99 });
      await expect(
        page.getByRole('button', { name: 'Commit changes', exact: true }),
      ).toBeInViewport({ ratio: 0.99 });
      await page.locator('.publish-prompt-action').scrollIntoViewIfNeeded();
      await expect(page.locator('.publish-prompt-action')).toBeInViewport({ ratio: 0.99 });
      await capture(page, `after-${width}x${height}-terminal-open.png`);
    }
    await page.close();
  }
  check(
    'Desktop and short windows give code review substantially more room; commit controls stay beside the diff',
  );

  const desktop = await freshPage('pane-resizing', { width: 1440, height: 1000 });
  await expect(sidebarHandle(desktop)).toHaveAttribute('aria-valuenow', '224');
  await expect(filesHandle(desktop)).toHaveAttribute('aria-valuenow', '304');
  await checkKeyboardResize(sidebarHandle(desktop));
  await checkKeyboardResize(filesHandle(desktop));
  const sidebarWidth = await pointerResize(desktop, sidebarHandle(desktop), 64);
  const filesWidth = await pointerResize(desktop, filesHandle(desktop), 72);
  await expect
    .poll(async () => (await desktop.locator('.sidebar').boundingBox()).width)
    .toBeCloseTo(sidebarWidth, 0);
  await expect
    .poll(async () => (await desktop.locator('.changes-panel').boundingBox()).width)
    .toBeCloseTo(filesWidth, 0);
  await expect
    .poll(() => desktop.evaluate((key) => JSON.parse(localStorage.getItem(key)), preferencesKey))
    .toMatchObject({ sidebarWidth, filesWidth });
  check('Both splitters support keyboard bounds and direct pointer resizing of their actual panes');
  await cancelPointerResize(desktop, sidebarHandle(desktop));
  await cancelPointerResize(desktop, filesHandle(desktop));
  check('Interrupted pointer resizing restores pane widths and leaves saved preferences unchanged');

  await desktop
    .getByRole('textbox', { name: 'Commit message', exact: true })
    .fill('Preserve my review context');
  await desktop.locator('.file-select[title="README.md"]').click();
  await sidebarToggle(desktop).focus();
  await sidebarToggle(desktop).press('Enter');
  await expect(sidebarToggle(desktop)).toHaveAttribute('aria-pressed', 'false');
  await expect(desktop.locator('.sidebar')).toBeHidden();
  assert.notEqual(await desktop.locator('.sidebar').getAttribute('inert'), null);
  for (let index = 0; index < 10; index += 1) {
    await desktop.keyboard.press('Tab');
    assert.equal(
      await desktop.evaluate(() => Boolean(document.activeElement?.closest('.sidebar'))),
      false,
    );
  }
  await sidebarToggle(desktop).focus();
  await sidebarToggle(desktop).press('Enter');
  await expect(sidebarToggle(desktop)).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await desktop.locator('.sidebar').boundingBox()).width)
    .toBeCloseTo(sidebarWidth, 0);
  await expect(desktop.getByRole('textbox', { name: 'Commit message', exact: true })).toHaveValue(
    'Preserve my review context',
  );
  await expect(desktop.locator('.diff-file')).toContainText('README.md');
  check(
    'The keyboard sidebar toggle keeps hidden controls out of focus and preserves the active review',
  );

  await desktop.reload();
  await enterDemoWorkspace(desktop);
  await expect(sidebarHandle(desktop)).toHaveAttribute('aria-valuenow', String(sidebarWidth));
  await expect(filesHandle(desktop)).toHaveAttribute('aria-valuenow', String(filesWidth));
  await sidebarToggle(desktop).click();
  await expect(sidebarToggle(desktop)).toHaveAttribute('aria-pressed', 'false');
  await desktop.reload();
  await enterDemoWorkspace(desktop);
  await expect(sidebarToggle(desktop)).toHaveAttribute('aria-pressed', 'false');
  assert.notEqual(await desktop.locator('.sidebar').getAttribute('inert'), null);
  await sidebarToggle(desktop).click();
  await desktop.setViewportSize({ width: 1024, height: 800 });
  await sidebarHandle(desktop).focus();
  await sidebarHandle(desktop).press('End');
  await filesHandle(desktop).focus();
  await filesHandle(desktop).press('End');
  const bounded = await geometry(desktop, '1024px-bounded-panes');
  assert.ok(bounded.editor.width >= 240, 'Pane maxima reserve a useful code column');
  await desktop.setViewportSize({ width: 1440, height: 1000 });
  check(
    'Pane widths survive reload and their available bounds reserve space for code when the window narrows',
  );

  const push = desktop.getByRole('slider', { name: 'Slide to push', exact: true });
  await confirmSlide(desktop, 'Slide to push');
  await expect(push).toHaveAttribute('aria-valuenow', '0');
  await expect(
    desktop.getByRole('log', { name: 'Git commands and interface actions', exact: true }),
  ).toContainText('push');
  await desktop.getByRole('button', { name: 'Show learning panel', exact: true }).click();
  await expect(
    desktop.getByRole('complementary', { name: 'Git learning panel', exact: true }),
  ).toBeVisible();
  await desktop.getByRole('button', { name: 'Hide learning panel', exact: true }).click();
  await expect(desktop.locator('.glass-learning')).toHaveCount(0);
  await desktop.getByRole('tab', { name: 'History', exact: true }).click();
  await expect(desktop.locator('.history-workspace .journey-node')).toHaveCount(5);
  await expect(desktop.locator('.history-row')).toHaveCount(7);
  await capture(desktop, 'after-history.png');
  await desktop.getByRole('tab', { name: /^Changes/ }).click();
  await expect(desktop.locator('.monaco-diff-editor')).toBeVisible();
  await expect(desktop.locator('.journey-node')).toHaveCount(0);
  check(
    'Push confirmation, on-demand learning, History graphs, and return to Changes remain functional',
  );
  await desktop.close();

  for (const saved of ['broken json', JSON.stringify({ sidebarWidth: 9000, filesWidth: -20 })]) {
    const page = await freshPage(
      'stored-preference-recovery',
      { width: 1440, height: 1000 },
      saved,
    );
    const repositoryWidth = await value(sidebarHandle(page));
    const changedFilesWidth = await value(filesHandle(page));
    assert.ok(repositoryWidth >= 190 && repositoryWidth <= 320);
    assert.ok(changedFilesWidth >= 248 && changedFilesWidth <= 420);
    await geometry(page, 'recovered-preferences');
    await page.close();
  }
  check('Malformed and out-of-range stored pane preferences recover to safe usable dimensions');

  for (const width of [320, 390]) {
    const page = await freshPage(`${width}px-mobile`, { width, height: 960 });
    const measured = await geometry(page, `${width}px-default`);
    assert.ok(measured.editor.height >= 150, `${width}px: code has a readable viewport`);
    const message = page.getByRole('textbox', { name: 'Commit message', exact: true });
    await message.scrollIntoViewIfNeeded();
    await message.fill(`Review at ${width}px`);
    await expect(page.getByRole('button', { name: 'Commit changes', exact: true })).toBeEnabled();
    await page
      .getByRole('button', { name: 'Commit changes', exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Commit changes', exact: true }),
    ).toBeInViewport();
    await page.locator('.file-select[title="README.md"]').scrollIntoViewIfNeeded();
    await page.locator('.file-select[title="README.md"]').click();
    await expect(page.locator('.diff-file')).toContainText('README.md');
    await terminalInput(page).fill('git status --short');
    await terminalInput(page).press('Enter');
    await expect(page.locator('.glass-command-output').last()).toContainText('README.md');
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.locator('.history-row').first()).toBeVisible();
    await page.getByRole('tab', { name: /^Changes/ }).click();
    await expect(message).toHaveValue(`Review at ${width}px`);
    await capture(page, `after-${width}px.png`);
    await page.close();
  }
  check(
    'At 320px and 390px, files, readable code, commit controls, terminal commands, and tabs remain reachable',
  );
  assert.deepEqual(report.providerRequests, []);
  assert.deepEqual(report.errors, []);
  check(
    'All workspace interactions complete without provider requests, browser exceptions, or Monaco errors',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('workspace-layout-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
