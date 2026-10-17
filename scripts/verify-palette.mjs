import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A presentation check for the chosen dark palette. OAuth and publishing remain
// covered by the existing behavior suites; the device-code view below uses IPC fixtures.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('github-dark-guide/', artifacts);
await mkdir(screenshots, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const report = {
  baseURL,
  testedAt: new Date().toISOString(),
  scope:
    'Palette, text contrast, responsive guide presentation, and mocked device-code presentation',
  checks: [],
  contrasts: [],
  controls: [],
  screenshots: [],
  surfaces: [],
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

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/github-dark-guide/${name}`);
}

async function inspect(page, surface, selectors) {
  const result = await page.evaluate(
    ({ surface, selectors }) => {
      const parse = (value) => {
        const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const over = (front, back) =>
        [0, 1, 2].map((i) => front[i] * front[3] + back[i] * (1 - front[3])).concat(1);
      const luminance = (color) =>
        color
          .slice(0, 3)
          .map((channel) => {
            const c = channel / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = [];
      const controls = [];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!element) {
          contrast.push({ surface, selector, missing: true });
          continue;
        }
        const style = getComputedStyle(element);
        const backgrounds = [];
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement)
          backgrounds.push(parse(getComputedStyle(ancestor).backgroundColor));
        const background = backgrounds
          .reverse()
          .reduce((back, front) => over(front, back), [11, 11, 15, 1]);
        const foreground = over(parse(style.color), background);
        const a = luminance(foreground),
          b = luminance(background);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (element.matches('.stage-checkbox, .focus-toggle')) {
          const compare = (color) => {
            const light = luminance(over(parse(color), background));
            return Number(((Math.max(light, b) + 0.05) / (Math.min(light, b) + 0.05)).toFixed(2));
          };
          if (element.matches('.stage-checkbox'))
            controls.push({
              surface,
              selector,
              part: 'empty checkbox boundary',
              color: style.borderTopColor,
              ratio: compare(style.borderTopColor),
              minimum: 3,
            });
          else
            controls.push({
              surface,
              selector,
              part: 'control icon',
              color: style.color,
              ratio: Number(ratio.toFixed(2)),
              minimum: 3,
            });
          if (element.matches(':focus-visible'))
            controls.push({
              surface,
              selector,
              part: 'keyboard focus outline',
              color: style.outlineColor,
              ratio: style.outlineStyle === 'none' ? 0 : compare(style.outlineColor),
              minimum: 3,
            });
          continue;
        }
        const large =
          parseFloat(style.fontSize) >= 24 ||
          (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
        contrast.push({
          surface,
          selector,
          foreground: style.color,
          background: background.slice(0, 3).map(Math.round),
          ratio: Number(ratio.toFixed(2)),
          minimum: large ? 3 : 4.5,
        });
      }
      const dialog = document.querySelector('.onboarding-dialog, .publish-dialog');
      const bounds = dialog?.getBoundingClientRect();
      return {
        contrast,
        controls,
        dialogPaint: dialog
          ? {
              background: getComputedStyle(dialog).backgroundColor,
              colorScheme: getComputedStyle(dialog).colorScheme,
            }
          : null,
        geometry: bounds
          ? {
              left: bounds.left,
              right: bounds.right,
              viewport: innerWidth,
              scrollWidth: dialog.scrollWidth,
              clientWidth: dialog.clientWidth,
            }
          : null,
      };
    },
    { surface, selectors },
  );
  report.contrasts.push(...result.contrast);
  report.controls.push(...result.controls);
  if (result.dialogPaint) {
    report.surfaces.push({ surface, ...result.dialogPaint });
    const channels =
      result.dialogPaint.background
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    if (channels.length !== 3 || Math.max(...channels) > 65)
      report.issues.push({ surface, dialogPaint: result.dialogPaint });
  }
  for (const sample of result.contrast)
    if (sample.missing || sample.ratio < sample.minimum) report.issues.push(sample);
  for (const sample of result.controls)
    if (sample.ratio < sample.minimum) report.issues.push(sample);
  if (
    result.geometry &&
    (result.geometry.left < -1 ||
      result.geometry.right > result.geometry.viewport + 1 ||
      result.geometry.scrollWidth > result.geometry.clientWidth + 1)
  )
    report.issues.push({ surface, geometry: result.geometry });
}

async function guide(width) {
  const page = await browser.newPage({
    viewport: { width, height: width > 600 ? 960 : 844 },
    reducedMotion: 'reduce',
  });
  monitor(page, `guide-${width}`);
  await page.goto(baseURL);
  await page.locator('.onboarding-dialog').waitFor();
  await inspect(page, `${width}px welcome`, [
    '.onboarding-title h2',
    '.onboarding-title > p',
    '.onboarding-promise p',
    '.onboarding-footer .button-primary',
  ]);
  await capture(page, `${width}-welcome.png`);
  await page.getByRole('button', { name: 'Step 2: Connect', exact: true }).click();
  await page.locator('.github-auth-local-note').waitFor();
  await inspect(page, `${width}px connect`, [
    '.github-connect-heading p',
    '.github-auth-local-note p',
    '.onboarding-optional',
  ]);
  if (width === 1440) await capture(page, `${width}-connect.png`);
  await page.getByRole('button', { name: 'Step 3: Try it', exact: true }).click();
  await page.locator('.practice-commit').waitFor();
  await inspect(page, `${width}px practice`, [
    '.practice-heading > span:last-child',
    '.practice-lesson > p',
    '.practice-files > button > span:nth-last-child(2)',
    '.practice-file-status',
  ]);
  await capture(page, `${width}-practice.png`);
  await page.getByRole('tab', { name: /Save a commit/ }).click();
  await page.getByRole('textbox', { name: 'What changed?', exact: true }).fill('A fresh start');
  await inspect(page, `${width}px practice input`, [
    '.practice-message',
    '.practice-message input',
    '.practice-lesson .button-primary',
  ]);
  await page.getByRole('tab', { name: /Push to share/ }).click();
  await page.getByRole('button', { name: 'Preview a push', exact: true }).click();
  await inspect(page, `${width}px practice success`, [
    '.practice-push strong',
    '.practice-lesson > p.practice-note',
  ]);
  await page.getByRole('button', { name: 'Step 4: Your project', exact: true }).click();
  await page.locator('.onboarding-project-option').first().waitFor();
  await inspect(page, `${width}px project`, [
    '.onboarding-connection',
    '.onboarding-project-option strong',
    '.onboarding-project-option > span:nth-child(2) > span',
  ]);
  if (width === 320) await capture(page, `${width}-project.png`);
  await page.getByRole('button', { name: 'Publish a local folder', exact: false }).click();
  await page.locator('.publish-dialog').waitFor();
  await inspect(page, `${width}px publish`, [
    '.publish-title',
    '.publish-pipeline-stage > strong',
    '.publish-pipeline-stage > span',
    '.publish-form-footer .button-primary',
  ]);
  if (width !== 390) await capture(page, `${width}-publish.png`);
  await page.getByRole('button', { name: 'Preview flow', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 });
  await inspect(page, `${width}px publish success`, [
    '.publish-title',
    '.publish-step.success strong',
  ]);
  if (width !== 390) await capture(page, `${width}-publish-success.png`);
  if (width === 1440) {
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('.publish-dialog').waitFor({ state: 'hidden' });
    await inspect(page, 'workspace controls', [
      '.stage-checkbox[aria-pressed="false"]',
      '.focus-toggle',
    ]);
    await page.keyboard.press('Tab');
    await page.locator('.stage-checkbox[aria-pressed="false"]').first().focus();
    await inspect(page, 'keyboard control focus', ['.stage-checkbox:focus-visible']);
  }
  await page.close();
  check(`${width}px welcome, connect, practice, project, and publish views fit the dark interface`);
}

async function deviceCode() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    reducedMotion: 'reduce',
  });
  monitor(page, 'mocked-device-code');
  await page.addInitScript(() => {
    let nextId = 0;
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
      transformCallback() {
        return ++nextId;
      },
      unregisterCallback() {},
      async invoke(command) {
        if (command === 'github_auth_status')
          return { configured: true, connected: false, account: null, scopes: [] };
        if (command === 'github_auth_start')
          return {
            sessionId: 'palette-fixture',
            userCode: 'TEST-CODE',
            verificationUri: 'https://github.com/login/device',
            expiresIn: 900,
            interval: 60,
          };
        if (command === 'github_auth_poll') return { status: 'pending', retryAfter: 60 };
        if (
          command === 'github_auth_open_browser' ||
          command === 'github_auth_cancel' ||
          command === 'plugin:event|unlisten'
        )
          return;
        if (command === 'plugin:event|listen') return ++nextId;
        throw new Error(`Unexpected palette fixture IPC: ${command}`);
      },
    };
  });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Step 2: Connect', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  await inspect(page, 'desktop device code', [
    '.github-device-code-row code',
    '.github-code-copy',
    '.github-device-wait',
    '.github-signin-button',
  ]);
  await capture(page, '1440-device-code.png');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.waitForTimeout(200);
  await inspect(page, '320px device code', ['.github-device-code-row code', '.github-device-wait']);
  await capture(page, '320-device-code.png');
  await page.close();
  check('Mocked GitHub approval code and actions remain legible on desktop and 320px');
}

try {
  // Independent page batches produce all desktop and narrow proofs together.
  const batches = await Promise.allSettled([guide(1440), guide(320), guide(390), deviceCode()]);
  for (const batch of batches)
    if (batch.status === 'rejected')
      report.issues.push({ presentation: batch.reason.stack || String(batch.reason) });
  assert.equal(
    report.issues.length,
    0,
    `Palette or geometry issues: ${JSON.stringify(report.issues)}`,
  );
  check(`${report.contrasts.length} sampled text/background combinations meet WCAG AA contrast`);
  check('Empty stage-checkbox boundary, control icon, and keyboard focus contrast meet 3:1');
  assert.equal(
    report.providerRequests.length,
    0,
    'Presentation checks must make no provider requests',
  );
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check('Presentation checks produce no browser errors or real provider requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('github-dark-palette-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
