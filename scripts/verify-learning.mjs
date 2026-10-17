import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace } from './workspace-fixture.mjs';

// Run after a production build against a fixed preview; no provider credentials
// or API fixtures are needed. All mutation checks operate on the practice repo.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('learning/', artifacts);
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
  scope: 'Guided Git, action visibility, contextual learning, and responsive terminal',
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
function monitor(page, surface) {
  page.on('pageerror', (error) =>
    report.errors.push({ surface, type: 'pageerror', message: error.message }),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      report.errors.push({ surface, type: 'console', message: message.text() });
  });
  page.on('request', (request) => {
    if (/https:\/\/(?:api\.)?(?:github\.com|gitlab\.com)/.test(request.url()))
      report.providerRequests.push(request.url());
  });
}
async function createPage(surface, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript(() => localStorage.setItem('branchline.guide.v1', 'seen'));
  const page = await context.newPage();
  monitor(page, surface);
  await page.goto(baseURL);
  await enterDemoWorkspace(page);
  await expect(
    page.getByRole('textbox', { name: 'Guided Git command', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const terminal = (page) => page.getByRole('region', { name: 'Glass-Box Git console', exact: true });
const commandInput = (page) =>
  page.getByRole('textbox', { name: 'Guided Git command', exact: true });
const stream = (page) =>
  page.getByRole('log', { name: 'Git commands and interface actions', exact: true });
async function run(page, source, expected) {
  const outputs = page.locator('.glass-command-output');
  const before = await outputs.count();
  await commandInput(page).fill(source);
  await commandInput(page).press('Enter');
  await expect(outputs).toHaveCount(before + 1);
  if (expected) await expect(outputs.last()).toContainText(expected);
  await expect(commandInput(page)).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Run command', exact: true })).toBeDisabled();
  return outputs.last();
}
async function capture(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/learning/${name}`);
}
async function geometry(page, surface) {
  const inspected = await page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
      };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      terminal: rect(document.querySelector('[aria-label="Glass-Box Git console"]')),
      input: rect(document.querySelector('#glass-command-input')),
      learning: rect(document.querySelector('.learning-flow')),
      editor: rect(document.querySelector('.diff-panel')),
    };
  });
  report.geometry.push({ surface, ...inspected });
  assert.ok(
    inspected.scrollWidth <= inspected.width + 1,
    `${surface}: document must not overflow horizontally`,
  );
  for (const key of ['terminal', 'input', 'learning']) {
    const box = inspected[key];
    assert.ok(box && box.width > 0, `${surface}: ${key} must be visible`);
    assert.ok(
      box.x >= -1 && box.right <= inspected.width + 1,
      `${surface}: ${key} must fit horizontally`,
    );
  }
  assert.ok(
    inspected.input.y >= 0 && inspected.input.bottom <= inspected.height + 1,
    `${surface}: command input must remain visible in the viewport`,
  );
  return inspected;
}

try {
  const desktop = await createPage('desktop', { width: 1440, height: 1000 });
  const initialGeometry = await geometry(desktop, 'desktop-collapsed-lesson');
  assert.ok(
    initialGeometry.learning.height < 80,
    'The learning strip must stay compact until opened',
  );
  assert.ok(
    initialGeometry.editor.height >= 140,
    'The terminal must leave room for reviewing a diff',
  );
  check('The learning strip is compact and the open terminal leaves a usable diff workspace');

  const selectedFile = 'src/components/Dropzone.tsx';
  await desktop.getByRole('button', { name: `Stage ${selectedFile}`, exact: true }).click();
  await expect(
    desktop.getByRole('button', { name: `Unstage ${selectedFile}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(stream(desktop)).toContainText(`Stage ${selectedFile}`);
  await expect(stream(desktop)).toContainText(selectedFile);
  await expect(
    stream(desktop).locator('code').filter({ hasText: selectedFile }).last(),
  ).toContainText('add');
  check('Staging a file shows both the requested button action and its equivalent Git operation');

  await run(desktop, 'git status', '3 staged');
  await expect(desktop.locator('.glass-command-output').last()).toContainText(
    'On branch feature/dropzone',
  );
  await expect(desktop.locator('.glass-command-output').last()).toContainText(
    'Selected for the next commit:',
  );
  await run(desktop, 'git log --oneline', 'Make room for the next big idea');
  await run(desktop, 'git branch', '* feature/dropzone');
  check('Typed status, log, and branch commands return the current practice repository state');

  const input = commandInput(desktop);
  await input.fill('draft command');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('git branch');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('git log --oneline');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('git branch');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('draft command');
  await input.fill('');
  check('Up and Down recall command history and preserve an unfinished draft');

  const quotedFile = 'src/styles/globals.css';
  await run(desktop, `git add -- "${quotedFile}"`, `Staged "${quotedFile}"`);
  await expect(
    desktop.getByRole('button', { name: `Unstage ${quotedFile}`, exact: true }),
  ).toBeVisible();
  await run(desktop, `git restore --staged -- "${quotedFile}"`, `Unstaged "${quotedFile}"`);
  await expect(
    desktop.getByRole('button', { name: `Stage ${quotedFile}`, exact: true }),
  ).toBeVisible();
  await run(desktop, `git diff --staged -- "${selectedFile}"`, `diff --git a/${selectedFile}`);
  check(
    'Quoted exact paths stage and unstage files through the same state as the workspace; staged diffs render',
  );

  const fileCountBeforeRejection = await desktop.locator('.file-row').count();
  const stagedBeforeRejection = await desktop
    .locator('.stage-checkbox[aria-pressed="true"]')
    .count();
  await run(desktop, 'git reset --hard', 'unavailable');
  await run(desktop, 'git status && git push', 'Shell operators');
  assert.equal(await desktop.locator('.file-row').count(), fileCountBeforeRejection);
  assert.equal(
    await desktop.locator('.stage-checkbox[aria-pressed="true"]').count(),
    stagedBeforeRejection,
  );
  check(
    'Destructive commands and command chains show an explanation while leaving practice files and staging unchanged',
  );

  await run(
    desktop,
    'git commit -m "Teach through a working terminal"',
    'Saved a local commit: Teach through a working terminal',
  );
  await expect(desktop.locator('.stage-checkbox[aria-pressed="true"]')).toHaveCount(0);
  await expect(desktop.locator('.file-row')).toHaveCount(
    fileCountBeforeRejection - stagedBeforeRejection,
  );
  await run(desktop, 'git log --oneline', 'Teach through a working terminal');
  check(
    'A typed commit saves staged practice changes, removes them from Changes, and appears in history',
  );

  const filters = desktop.getByRole('group', { name: 'Filter terminal entries', exact: true });
  await filters.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Actions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(desktop.locator('.glass-command-output')).toHaveCount(0);
  await expect(stream(desktop)).toContainText(`Stage ${selectedFile}`);
  await filters.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(filters.getByRole('button', { name: 'Commands', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(desktop.locator('.glass-command-output')).not.toHaveCount(0);
  await expect(stream(desktop)).not.toContainText(`Stage ${selectedFile}`);
  await filters.getByRole('button', { name: 'All activity', exact: true }).click();
  check(
    'Actions and Commands filters separate interface requests from Git commands and their output',
  );

  await desktop.getByRole('button', { name: 'Learn about commit', exact: true }).click();
  await expect(desktop.locator('.learning-flow-panel')).toBeVisible();
  await expect(desktop.locator('.learning-flow-copy')).toContainText('until you push it');
  const teachingColors = await desktop.evaluate(() => ({
    learning: getComputedStyle(document.querySelector('.learning-flow-toggle')).color,
    action: getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim(),
  }));
  report.teachingColors = teachingColors;
  assert.equal(teachingColors.learning, 'rgb(188, 140, 255)');
  assert.equal(teachingColors.action, '#58a6ff');
  const outputCountBeforeExample = await desktop.locator('.glass-command-output').count();
  await desktop.locator('.learning-flow-command').click();
  await expect(input).toHaveValue('git log --oneline');
  await expect(input).toBeFocused();
  await expect(desktop.locator('.learning-flow-panel')).not.toBeVisible();
  assert.equal(await desktop.locator('.glass-command-output').count(), outputCountBeforeExample);
  const commandHandoff = await geometry(desktop, 'desktop-command-handoff');
  assert.ok(
    commandHandoff.editor.height >= 140,
    'Preparing a command must leave a usable diff workspace',
  );
  await desktop.getByRole('button', { name: 'Learn about commit', exact: true }).click();
  await expect(desktop.locator('.learning-flow-panel')).toBeVisible();
  await desktop.locator('.learning-flow-more').click();
  await expect(stream(desktop)).toContainText('Learn: Save a local checkpoint');
  await expect(desktop.locator('.learning-flow-panel')).not.toBeVisible();
  const lessonHandoff = await geometry(desktop, 'desktop-full-lesson-handoff');
  assert.ok(
    lessonHandoff.editor.height >= 140,
    'Opening a full lesson must leave a usable diff workspace',
  );
  await capture(desktop, 'desktop-lesson.png');
  check(
    'Purple learning content explains local commits; examples prefill and focus the terminal without executing',
  );

  const showLessonPanel = desktop.getByRole('button', { name: 'Show learning panel', exact: true });
  if (await showLessonPanel.isVisible()) await showLessonPanel.click();
  await expect(
    desktop.getByRole('combobox', { name: 'Learning topic', exact: true }),
  ).toBeVisible();
  await desktop
    .getByRole('combobox', { name: 'Learning topic', exact: true })
    .selectOption('branch');
  const outputCountBeforeTerminalExample = await desktop.locator('.glass-command-output').count();
  await desktop.locator('.glass-try-command').click();
  await expect(input).toHaveValue('git branch');
  await expect(input).toBeFocused();
  assert.equal(
    await desktop.locator('.glass-command-output').count(),
    outputCountBeforeTerminalExample,
  );
  check(
    'Terminal lessons switch topics and their command examples also require an explicit Enter to run',
  );

  if (await desktop.locator('.learning-flow-close').isVisible())
    await desktop.locator('.learning-flow-close').click();
  await desktop.getByRole('button', { name: 'Clear visible console', exact: true }).click();
  await expect(desktop.locator('.glass-command-output')).toHaveCount(0);
  await run(desktop, 'git status', '0 staged');
  await expect(desktop.locator('.glass-command-output')).toHaveCount(1);
  check(
    'Clear hides prior output and the next command remains visible with current repository state',
  );

  await run(desktop, 'help', 'Save and share');
  const scrollInfo = await stream(desktop).evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
    return { height: element.clientHeight, content: element.scrollHeight };
  });
  assert.ok(
    scrollInfo.content > scrollInfo.height + 24,
    'Help should provide enough content to test scroll following',
  );
  await expect(desktop.getByRole('button', { name: 'Follow latest', exact: true })).toBeVisible();
  await desktop.locator('.file-select').first().click();
  assert.ok(
    await stream(desktop).evaluate((element) => element.scrollTop < 10),
    'New interface actions must respect a reader who scrolled up',
  );
  await desktop.getByRole('button', { name: 'Follow latest', exact: true }).click();
  await expect
    .poll(() =>
      stream(desktop).evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThan(5);
  check('Scrolling back pauses automatic following; Follow latest returns to the newest output');

  await run(desktop, 'git branch', '* feature/dropzone');

  await desktop.keyboard.press('Control+j');
  await expect(input).not.toBeVisible();
  await desktop.keyboard.press('Control+j');
  await expect(input).toBeVisible();
  await expect(desktop.locator('.glass-command-output').last()).toContainText('* feature/dropzone');
  await capture(desktop, 'desktop-terminal.png');
  check('The terminal keyboard toggle collapses and reopens without losing command results');

  await desktop.getByRole('button', { name: 'A little help', exact: false }).click();
  await desktop.getByRole('dialog', { name: 'A calmer way to Git.' }).waitFor();
  await desktop.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(stream(desktop)).toContainText('Close help');
  await expect(stream(desktop)).toContainText('A little help');
  check('Buttons inside portal dialogs also appear in the terminal action stream');

  for (const width of [390, 320]) {
    const mobile = await createPage(`${width}px`, { width, height: 960 });
    await geometry(mobile, `${width}px-default`);
    await run(mobile, 'git status --short', 'package.json');
    await mobile.getByRole('button', { name: 'Learn about stage', exact: true }).click();
    await expect(mobile.locator('.learning-flow-panel')).toBeVisible();
    await geometry(mobile, `${width}px-expanded-lesson`);
    await mobile.locator('.learning-flow-command').click();
    await expect(commandInput(mobile)).toHaveValue('git diff --staged');
    await expect(commandInput(mobile)).toBeFocused();
    await expect(mobile.locator('.learning-flow-panel')).not.toBeVisible();
    await capture(mobile, `${width}-terminal-learning.png`);
    await mobile.context().close();
  }
  check(
    'At 390px and 320px, terminal input and learning controls fit and safe commands remain usable',
  );

  const reduced = await createPage('reduced-motion', { width: 1440, height: 1000 }, 'reduce');
  assert.equal(
    await reduced.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    true,
  );
  await reduced.getByRole('button', { name: 'Learn about push', exact: true }).click();
  await expect(reduced.locator('.learning-flow-panel')).toBeVisible();
  const reducedDuration = await reduced
    .locator('.learning-flow-toggle > svg:last-child')
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  assert.ok(
    parseFloat(reducedDuration) <= 0.001,
    `Reduced motion should be effectively immediate; received ${reducedDuration}`,
  );
  await run(reduced, 'git status', 'On branch feature/dropzone');
  await capture(reduced, 'reduced-motion-terminal.png');
  await reduced.context().close();
  check(
    'Reduced motion removes the learning transition while keeping terminal interactions available',
  );

  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider calls: ${report.providerRequests.join(', ')}`,
  );
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check('The browser demo makes zero provider requests and reports no browser or Monaco errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('learning-browser-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
