import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { enterDemoWorkspace } from './workspace-fixture.mjs';
import { confirmSlide } from './slide-fixture.mjs';

const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1420';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('github-dark/', artifacts);
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
  checks: [],
  errors: [],
  providerRequests: [],
  screenshots: [],
  publishHeaders: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const capture = async (page, name) => {
  // Let path drawing and spring entrances settle before the visual proof.
  await page.waitForTimeout(1300);
  await page.screenshot({
    path: new URL(name, screenshots).pathname.replace(/^\/([A-Z]:)/, '$1'),
    fullPage: true,
  });
  report.screenshots.push(`artifacts/github-dark/${name}`);
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
async function waitForEditor(page) {
  await enterDemoWorkspace(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(750);
}
async function openPublishWithPalette(page) {
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor();
  await page.getByPlaceholder('What would you like to do?').fill('Create');
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'From local to launched.', exact: true }).waitFor();
}
async function assertPublishHeader(page, surface) {
  const viewportWidth = page.viewportSize().width;
  const geometry = await page.evaluate(() => {
    const title = document.querySelector('.publish-title');
    const close = document.querySelector('.publish-close');
    const dialog = document.querySelector('.publish-dialog');
    if (!title || !close || !dialog) return null;
    const rectangle = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    };
    return {
      viewportWidth: window.innerWidth,
      title: rectangle(title),
      close: rectangle(close),
      dialog: rectangle(dialog),
      titleScrollWidth: title.scrollWidth,
      titleClientWidth: title.clientWidth,
    };
  });
  report.publishHeaders.push({ surface, ...geometry });
  assert.ok(geometry, `${surface}: publishing header must render`);
  assert.equal(
    geometry.viewportWidth,
    viewportWidth,
    `${surface}: layout viewport must match the configured device width`,
  );
  assert.ok(
    geometry.titleScrollWidth <= geometry.titleClientWidth + 1,
    `${surface}: publishing title must fit fully inside its available width`,
  );
  assert.ok(
    geometry.title.right <= geometry.close.left - 5,
    `${surface}: publishing title must leave space for the close button`,
  );
  assert.ok(
    geometry.close.right <= geometry.dialog.right + 1 &&
      geometry.close.right <= geometry.viewportWidth,
    `${surface}: publishing close button must remain inside its dialog and viewport`,
  );
  assert.ok(
    geometry.title.top >= geometry.dialog.top - 1 && geometry.close.top >= geometry.dialog.top - 1,
    `${surface}: publishing title and close button must stay visible after a form transition`,
  );
}

try {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
  });
  await desktop.addInitScript(() => localStorage.setItem('branchline.guide.v1', 'seen'));
  monitor(desktop, 'desktop');
  await desktop.goto(baseURL);
  await waitForEditor(desktop);
  assert.equal(await desktop.locator('.file-row').count(), 6);
  assert.equal(await desktop.locator('.stage-checkbox[aria-pressed="true"]').count(), 2);
  assert.equal(await desktop.getByRole('button', { name: 'Commit changes' }).isDisabled(), true);
  check('Monaco mounts locally; initial commit requires a message and staged files');
  assert.ok(
    (await desktop.locator('[data-ui-source="skiper-ui"]').count()) > 0,
    'The working directory must render the actual Skiper UI integration',
  );
  assert.equal(
    await desktop.getByRole('button', { name: 'Commit changes' }).getAttribute('data-ui-source'),
    'vengeance-ui',
    'The commit CTA must render the actual Vengeance UI integration',
  );
  check('Skiper UI TextRoll and Vengeance UI AnimatedButton render in the working directory');
  report.palette = await desktop.evaluate(() => ({
    sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
    files: getComputedStyle(document.querySelector('.changes-panel')).backgroundColor,
    composer: getComputedStyle(document.querySelector('.commit-composer')).backgroundColor,
  }));
  assert.deepEqual(report.palette, {
    sidebar: 'rgb(21, 27, 35)',
    files: 'rgb(21, 27, 35)',
    composer: 'rgb(21, 27, 35)',
  });
  const publishPrompt = await desktop.locator('.publish-prompt').boundingBox();
  const publishPromptAction = await desktop.locator('.publish-prompt-action').boundingBox();
  assert.ok(
    publishPrompt &&
      publishPromptAction &&
      publishPromptAction.y + publishPromptAction.height <=
        publishPrompt.y + publishPrompt.height - 4,
    'The sidebar publishing action must fit fully inside its sidebar tile',
  );
  check(
    'GitHub dark navigation, charcoal files, and composer render; the sidebar publishing action stays visible',
  );
  assert.equal(await desktop.locator('.journey-node').count(), 0);
  await capture(desktop, 'desktop-working-directory.png');
  const standardEditor = await desktop.locator('.diff-panel').boundingBox();
  assert.ok(standardEditor);
  const focusToggle = desktop.getByRole('button', { name: 'Focus mode', exact: true });
  assert.equal(await focusToggle.getAttribute('aria-pressed'), 'false');
  await focusToggle.click();
  await desktop.waitForTimeout(450);
  const focusedEditor = await desktop.locator('.diff-panel').boundingBox();
  const focusedSidebar = await desktop.locator('.sidebar').boundingBox();
  assert.equal(await focusToggle.getAttribute('aria-pressed'), 'true');
  assert.ok(focusedEditor && focusedEditor.width > standardEditor.width + 80);
  assert.ok(!focusedSidebar || focusedSidebar.width < 1);
  assert.notEqual(await desktop.locator('.sidebar').getAttribute('inert'), null);
  await capture(desktop, 'desktop-focus-mode.png');
  await desktop.keyboard.press('Control+Shift+f');
  await desktop.waitForTimeout(450);
  const restoredEditor = await desktop.locator('.diff-panel').boundingBox();
  assert.equal(await focusToggle.getAttribute('aria-pressed'), 'false');
  assert.ok(restoredEditor && Math.abs(restoredEditor.width - standardEditor.width) <= 2);
  check(
    'Focus mode expands Monaco, makes the hidden sidebar inert, and restores from Ctrl+Shift+F',
  );
  await desktop.getByRole('tab', { name: 'History', exact: true }).click();
  await desktop.locator('.history-row').first().waitFor();
  assert.equal(await desktop.locator('.journey-node').count(), 5);
  assert.equal(await desktop.locator('.journey-lines path').count(), 4);
  assert.equal(await desktop.locator('.history-row').count(), 7);
  assert.equal(await desktop.locator('.commit-connections path').count(), 7);
  assert.equal(await desktop.locator('.graph-node-head').count(), 1);
  check(
    'Compact and full graphs draw only the fixture commits and their actual visible parent connections',
  );
  await capture(desktop, 'desktop-history.png');
  await desktop.getByRole('tab', { name: /^Changes/ }).click();
  await waitForEditor(desktop);
  for (const file of ['package.json', 'README.md', 'src/components/Dropzone.tsx']) {
    await desktop.locator(`.file-select[title="${file}"]`).click();
    await desktop.locator('.diff-file').filter({ hasText: file }).waitFor();
    await desktop.locator('.monaco-diff-editor').waitFor();
  }
  check('Repeated file changes and history navigation safely reset Monaco models');

  await desktop
    .getByRole('button', { name: 'Stage src/components/Dropzone.tsx', exact: true })
    .click();
  await desktop
    .getByRole('button', { name: 'Unstage src/components/Dropzone.tsx', exact: true })
    .waitFor();
  assert.equal(await desktop.locator('.stage-checkbox[aria-pressed="true"]').count(), 3);
  await desktop
    .getByRole('button', { name: 'Unstage src/components/Dropzone.tsx', exact: true })
    .click();
  await desktop
    .getByRole('button', { name: 'Stage src/components/Dropzone.tsx', exact: true })
    .waitFor();
  assert.equal(await desktop.locator('.stage-checkbox[aria-pressed="true"]').count(), 2);
  check('Stage and unstage move the exact selected file and update staged count');

  await desktop.getByRole('textbox', { name: 'Filter changed files' }).fill('package');
  assert.equal(await desktop.locator('.file-row').count(), 1);
  await desktop.getByRole('textbox', { name: 'Filter changed files' }).fill('');
  assert.equal(await desktop.locator('.file-row').count(), 6);
  check('Changed-file filtering restores the complete list when cleared');

  await desktop
    .getByRole('button', { name: 'Stage src/components/Dropzone.tsx', exact: true })
    .click();
  await desktop
    .getByRole('textbox', { name: 'Commit message', exact: true })
    .fill('Verify staged-only demo commit');
  await desktop.getByRole('button', { name: 'Commit changes' }).click();
  await desktop
    .getByText('Demo commit saved. Your real files are unchanged.', { exact: true })
    .waitFor();
  await desktop.locator('.commit-avatar.is-saved').waitFor();
  await desktop.getByText('Commit saved', { exact: true }).waitFor();
  await capture(desktop, 'desktop-commit-saved.png');
  check('Successful commits show the saved checkmark and confirmation in the commit composer');
  assert.equal(await desktop.locator('.file-row').count(), 3);
  assert.equal(await desktop.locator('.stage-checkbox[aria-pressed="true"]').count(), 0);
  assert.equal(
    await desktop.getByRole('textbox', { name: 'Commit message', exact: true }).inputValue(),
    '',
  );
  check('Demo commit saves only the 3 staged files and retains 3 unstaged changes');

  await desktop.keyboard.press('Control+k');
  await desktop.getByPlaceholder('What would you like to do?').fill('history');
  await desktop.keyboard.press('Enter');
  await desktop.locator('.history-row').first().waitFor();
  assert.match(
    await desktop.locator('.history-row').first().innerText(),
    /Verify staged-only demo commit/,
  );
  check('Ctrl+K search and Enter navigate to history containing the new commit');
  await desktop.getByRole('button', { name: 'Dismiss notification' }).click();
  await capture(desktop, 'desktop-history-after-commit.png');
  const firstRow = await desktop.locator('.history-row').first().boundingBox();
  assert.ok(firstRow);
  await desktop.mouse.move(firstRow.x + 220, firstRow.y + 25);
  await desktop.mouse.down();
  await desktop.mouse.move(firstRow.x + 220, firstRow.y + 99, { steps: 12 });
  await desktop.mouse.up();
  await desktop.getByRole('dialog').filter({ hasText: 'This is a history preview.' }).waitFor();
  assert.equal(
    await desktop.getByRole('button', { name: 'History editing · planned milestone' }).isDisabled(),
    true,
  );
  check('Dragging a commit opens a consequence preview and cannot mutate history');
  await capture(desktop, 'desktop-history-preview.png');
  await desktop.getByRole('button', { name: 'Close preview', exact: true }).click();

  await openPublishWithPalette(desktop);
  const publishing = desktop.getByRole('dialog', { name: 'From local to launched.', exact: true });
  assert.equal(
    await publishing
      .getByRole('button', { name: 'Private', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await publishing
      .getByText(
        'GitHub sign-in is available in the desktop app. This browser preview stays local.',
        { exact: true },
      )
      .isVisible(),
    true,
  );
  assert.equal(
    await publishing
      .getByRole('button', { name: 'Your local folder goes here', exact: false })
      .isDisabled(),
    true,
  );
  assert.equal(
    await publishing.getByRole('slider', { name: 'Slide to create & push', exact: true }).count(),
    0,
  );
  assert.equal(await publishing.locator('input[type="password"]').count(), 0);
  assert.equal(
    await publishing.getByRole('button', { name: 'Sign in with GitHub', exact: true }).count(),
    0,
  );
  await publishing.getByRole('textbox', { name: 'Repository name', exact: true }).fill('orbit-lab');
  await publishing.getByRole('combobox', { name: 'Git provider' }).selectOption('gitlab');
  assert.equal(
    await publishing.getByText('Desktop app required to publish', { exact: true }).isVisible(),
    true,
  );
  assert.equal(await publishing.locator('input[type="password"]').count(), 0);
  await publishing.getByRole('button', { name: 'Public', exact: true }).click();
  await publishing.getByText('Anyone can see your files and history.', { exact: true }).waitFor();
  await publishing.getByRole('button', { name: 'Private', exact: true }).click();
  check(
    'Publishing defaults private; provider and visibility controls work; browser cannot publish or capture credentials',
  );
  await capture(desktop, 'desktop-publish.png');
  await publishing.getByRole('button', { name: 'Preview flow', exact: true }).click();
  await desktop
    .getByText('Preview only · no files or repositories are changed', { exact: true })
    .waitFor();
  await desktop.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 });
  await desktop
    .getByText('Preview complete. No files or remote repositories were changed.', { exact: true })
    .waitFor();
  assert.equal(await desktop.locator('.publish-step.success').count(), 5);
  assert.equal(await desktop.locator('.publish-dialog a').count(), 0);
  check('Preview completes five simulated steps with no false success URL or repository link');
  await capture(desktop, 'desktop-publish-preview.png');
  await desktop.getByRole('button', { name: 'Done', exact: true }).click();
  await desktop.keyboard.press('Control+k');
  await desktop.getByPlaceholder('What would you like to do?').fill('console');
  await desktop.keyboard.press('Enter');
  assert.equal(
    await desktop.locator('.glass-terminal-toggle').getAttribute('aria-expanded'),
    'false',
  );
  await desktop.keyboard.press('Control+j');
  await desktop.locator('.glass-entry-command code .vengeance-tooltip-trigger').first().focus();
  await desktop.getByRole('tooltip').first().waitFor();
  check('Console toggles from palette and keyboard; explanations are keyboard accessible');

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.addInitScript(() => localStorage.setItem('branchline.guide.v1', 'seen'));
  monitor(mobile, 'mobile');
  await mobile.goto(baseURL);
  await waitForEditor(mobile);
  await capture(mobile, 'mobile-working-directory.png');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const mobileFiles = await mobile.locator('.file-list').boundingBox();
  const mobileComposer = await mobile.locator('.commit-composer').boundingBox();
  const mobileFilesPanel = await mobile.locator('.changes-panel').boundingBox();
  const mobileChangesView = await mobile.locator('.changes-view').boundingBox();
  const mobileEditor = await mobile.locator('.diff-panel').boundingBox();
  assert.ok(
    mobileFiles && mobileFiles.width >= 150,
    'Mobile changed-file list must have a usable width',
  );
  assert.ok(
    mobileEditor &&
      mobileFilesPanel &&
      mobileEditor.y >= mobileFilesPanel.y + mobileFilesPanel.height - 1,
    'Mobile editor must sit below the changed-file panel without overlap',
  );
  assert.ok(
    mobileComposer && mobileEditor && mobileComposer.y >= mobileEditor.y + mobileEditor.height - 1,
    'Mobile composer must sit below Monaco without overlap',
  );
  assert.ok(
    mobileComposer &&
      mobileChangesView &&
      mobileComposer.y + mobileComposer.height <=
        mobileChangesView.y + mobileChangesView.height + 1,
    'Mobile composer must remain inside the complete changes view',
  );
  check('390px layout stacks usable files, Monaco, and the composer without overlap');
  await openPublishWithPalette(mobile);
  const mobileDialog = mobile.locator('.publish-dialog');
  const mobileBox = await mobileDialog.boundingBox();
  assert.ok(mobileBox && mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 390);
  await capture(mobile, 'mobile-publish.png');
  await assertPublishHeader(mobile, '390px form');
  await mobileDialog.getByRole('button', { name: 'Preview flow', exact: true }).click();
  await mobile.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 });
  await capture(mobile, 'mobile-publish-preview.png');
  await assertPublishHeader(mobile, '390px progress');
  check('Mobile publishing dialog stays within viewport and preview remains usable');
  await mobile.getByRole('button', { name: 'Done', exact: true }).click();
  await mobile.getByRole('tab', { name: 'History', exact: true }).click();
  await mobile.locator('.history-row').first().waitFor();
  await capture(mobile, 'mobile-history.png');
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('Mobile history is accessible from tabs without horizontal document overflow');

  const narrow = await browser.newPage({
    viewport: { width: 320, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await narrow.addInitScript(() => localStorage.setItem('branchline.guide.v1', 'seen'));
  monitor(narrow, '320px-mobile');
  await narrow.goto(baseURL);
  await waitForEditor(narrow);
  await openPublishWithPalette(narrow);
  await capture(narrow, 'mobile-320-publish.png');
  await assertPublishHeader(narrow, '320px form');
  await narrow.getByRole('button', { name: 'Preview flow', exact: true }).click();
  await narrow.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 15_000 });
  await capture(narrow, 'mobile-320-publish-preview.png');
  await assertPublishHeader(narrow, '320px progress');
  check('320px and 390px publishing titles fit fully and preserve the close button');
  await narrow.close();

  // This is a frontend IPC contract test. It does not execute Rust, touch files,
  // create remote repositories, authenticate with GitHub, or claim native integration coverage.
  // The connected account is a frontend contract fixture, not a live OAuth session.
  const mockedNative = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(mockedNative, 'mocked-native-ipc');
  await mockedNative.addInitScript(() => {
    localStorage.setItem('branchline.guide.v1', 'seen');
    let id = 0;
    const callbacks = new Map();
    const listeners = new Map();
    window.__BRANCHLINE_TEST_IPC__ = {
      publishes: [],
      unsubscribed: [],
      url: 'javascript:alert(1)',
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
      transformCallback(callback) {
        const callbackId = ++id;
        callbacks.set(callbackId, callback);
        return callbackId;
      },
      unregisterCallback(callbackId) {
        callbacks.delete(callbackId);
      },
      async invoke(command, args) {
        if (command === 'github_auth_status') {
          return {
            configured: true,
            connected: true,
            account: {
              login: 'test-fixture',
              name: 'Test Fixture',
              email: 'test@example.invalid',
              avatarUrl: '',
            },
            scopes: ['repo', 'workflow', 'read:user', 'user:email'],
          };
        }
        if (command === 'plugin:event|listen') {
          const listenerId = ++id;
          listeners.set(listenerId, args);
          return listenerId;
        }
        if (command === 'plugin:event|unlisten') {
          window.__BRANCHLINE_TEST_IPC__.unsubscribed.push(args.eventId);
          listeners.delete(args.eventId);
          return;
        }
        if (command === 'plugin:dialog|open') return 'C:\\test-fixture\\orbit';
        if (command === 'open_repository') {
          const now = Math.floor(Date.now() / 1000);
          return {
            path: 'C:\\test-fixture\\orbit',
            name: 'orbit',
            branch: 'stable',
            guardian: null,
            files: [],
            commits: [
              {
                id: 'parallel123456789',
                summary: 'Newer work on another branch',
                author: 'Test Fixture',
                timestamp: now - 60,
                parents: ['current1234567890'],
              },
              {
                id: 'current1234567890',
                summary: 'Current branch checkpoint',
                author: 'Test Fixture',
                timestamp: now - 120,
                parents: [],
              },
            ],
            branches: [
              { name: 'parallel', target: 'parallel123456789', current: false },
              { name: 'stable', target: 'current1234567890', current: true },
            ],
          };
        }
        if (command === 'publish_repository') {
          const subscriptions = [...listeners.entries()].filter(
            ([, listener]) => listener.event === 'publish:progress',
          );
          const request = args.request;
          window.__BRANCHLINE_TEST_IPC__.publishes.push({
            name: request.name,
            provider: request.provider,
            private: request.private,
            token: request.token,
            authorName: request.authorName,
            authorEmail: request.authorEmail,
            subscribedBeforeInvoke: subscriptions.length === 1,
          });
          for (const step of ['validate', 'init', 'commit', 'remote', 'push']) {
            for (const status of ['running', 'success'])
              for (const [listenerId, listener] of subscriptions)
                callbacks.get(listener.handler)?.({
                  event: 'publish:progress',
                  id: listenerId,
                  payload: { operationId: request.operationId, step, status },
                });
          }
          return { url: window.__BRANCHLINE_TEST_IPC__.url, path: request.path, branch: 'main' };
        }
        throw new Error(`Unexpected mocked IPC command: ${command}`);
      },
    };
  });
  await mockedNative.goto(baseURL);
  await waitForEditor(mockedNative);
  await openPublishWithPalette(mockedNative);
  await mockedNative.getByText('Signed in as @test-fixture', { exact: true }).waitFor();
  assert.equal(await mockedNative.locator('input[type="password"]').count(), 0);
  await mockedNative.getByLabel('Repository name', { exact: true }).fill('pending-folder');
  await confirmSlide(mockedNative);
  await mockedNative.getByText('Choose the folder you want to publish.', { exact: true }).waitFor();
  assert.equal(
    await mockedNative.evaluate(() => window.__BRANCHLINE_TEST_IPC__.publishes.length),
    0,
  );
  await mockedNative
    .getByRole('button', { name: 'Drop a folder here, or choose one', exact: false })
    .click();
  await mockedNative.getByLabel('Repository name', { exact: true }).fill('');
  await confirmSlide(mockedNative);
  assert.equal(
    await mockedNative.evaluate(() => window.__BRANCHLINE_TEST_IPC__.publishes.length),
    0,
  );
  await mockedNative.getByLabel('Repository name', { exact: true }).fill('orbit');
  assert.equal(await mockedNative.locator('.publish-identity').getAttribute('open'), null);
  await mockedNative.locator('.publish-identity summary').click();
  assert.equal(
    await mockedNative.getByLabel('Commit author', { exact: true }).inputValue(),
    'Test Fixture',
  );
  assert.equal(
    await mockedNative.getByLabel('Commit email', { exact: true }).inputValue(),
    'test@example.invalid',
  );
  await mockedNative.locator('.publish-identity summary').click();
  await mockedNative.getByRole('combobox', { name: 'Git provider' }).selectOption('gitlab');
  assert.equal(await mockedNative.locator('input[type="password"]').inputValue(), '');
  await mockedNative.getByLabel('GitLab access token').fill('test-only-token-not-a-secret');
  await mockedNative.getByRole('combobox', { name: 'Git provider' }).selectOption('github');
  assert.equal(await mockedNative.locator('input[type="password"]').count(), 0);
  await mockedNative.getByRole('combobox', { name: 'Git provider' }).selectOption('gitlab');
  assert.equal(await mockedNative.locator('input[type="password"]').inputValue(), '');
  await mockedNative.getByRole('combobox', { name: 'Git provider' }).selectOption('github');
  await capture(mockedNative, 'desktop-publish-native-form.png');
  await confirmSlide(mockedNative);
  await mockedNative.getByRole('button', { name: 'Open repository', exact: true }).waitFor();
  const unsafeLink = mockedNative.locator('a.publish-secondary-button');
  assert.equal(await unsafeLink.getAttribute('href'), null);
  assert.equal(await unsafeLink.getAttribute('aria-disabled'), 'true');
  let ipc = await mockedNative.evaluate(() => window.__BRANCHLINE_TEST_IPC__);
  assert.deepEqual(ipc.publishes, [
    {
      name: 'orbit',
      provider: 'github',
      private: true,
      token: '',
      authorName: 'Test Fixture',
      authorEmail: 'test@example.invalid',
      subscribedBeforeInvoke: true,
    },
  ]);
  check(
    'Mocked native contract validates folder and name, uses GitHub account identity without a token field, clears GitLab tokens on provider change, subscribes before invoking, and rejects unsafe result links',
  );
  await mockedNative.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  await mockedNative.evaluate(() => {
    window.__BRANCHLINE_TEST_IPC__.url = 'https://github.com/test-fixture/orbit';
  });
  await openPublishWithPalette(mockedNative);
  assert.equal(await mockedNative.locator('input[type="password"]').count(), 0);
  await confirmSlide(mockedNative);
  await mockedNative.getByRole('button', { name: 'Open repository', exact: true }).waitFor();
  assert.equal(
    await mockedNative.getByRole('link', { name: 'Open on GitHub' }).getAttribute('href'),
    'https://github.com/test-fixture/orbit',
  );
  ipc = await mockedNative.evaluate(() => window.__BRANCHLINE_TEST_IPC__);
  assert.equal(ipc.publishes.length, 2);
  assert.equal(ipc.publishes[1].token, '');
  assert.equal(ipc.unsubscribed.length, new Set(ipc.unsubscribed).size);
  check(
    'Mocked native success accepts trusted HTTPS URL, keeps GitHub credentials out of publish IPC, and unregisters each listener once',
  );

  await mockedNative.getByRole('button', { name: 'Open repository', exact: true }).click();
  await mockedNative.getByRole('tab', { name: 'History', exact: true }).click();
  await mockedNative.getByRole('button', { name: 'Current branch checkpoint, current' }).waitFor();
  assert.equal(await mockedNative.locator('.history-row').count(), 2);
  assert.equal(
    await mockedNative.locator('.history-row').first().locator('.graph-node-head').count(),
    0,
  );
  assert.equal(
    await mockedNative
      .locator('.history-row')
      .filter({ hasText: 'Current branch checkpoint' })
      .locator('.graph-node-head')
      .count(),
    1,
  );
  assert.equal(await mockedNative.locator('.commit-connections path').count(), 1);
  assert.equal(
    await mockedNative.locator('.journey-position-current .journey-branch').innerText(),
    'stable',
  );
  await mockedNative.locator('.history-row').last().focus();
  await mockedNative.keyboard.press('Enter');
  assert.equal(
    await mockedNative.locator('.history-row').last().getAttribute('aria-pressed'),
    'true',
  );
  await mockedNative
    .locator('.commit-detail strong')
    .filter({ hasText: 'Current branch checkpoint' })
    .waitFor();
  check(
    'History marks the actual current branch target when a newer commit exists elsewhere, and keyboard selection updates its details',
  );
  await capture(mockedNative, 'desktop-history-native-topology.png');

  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider requests: ${report.providerRequests.join(', ')}`,
  );
  check('Browser demo makes zero GitHub or GitLab API requests');
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check('No React, Monaco, worker, or other browser console errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('github-dark-browser-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
