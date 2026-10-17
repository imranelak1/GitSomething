// Requires the actual debug Tauri app with WebView2 CDP on loopback port 9223.
// The folder-picker IPC response alone is a fixture. All reads and mutations
// below pass through the app's real UI, IPC handlers, and Rust/libgit2 engine.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { enterDemoWorkspace } from './workspace-fixture.mjs';

const root = resolve(process.cwd());
const filename = `.branchline-learning-smoke-${randomUUID()}.txt`;
const fixturePath = join(root, filename);
assert.equal(
  dirname(fixturePath),
  root,
  'The temporary file must be directly inside this workspace.',
);
const contents = 'A temporary real Git engine check.\nKeep every user file untouched.\n';
const patchKey = `__branchlineNativeLearning_${randomUUID().replaceAll('-', '')}`;
const report = {
  testedAt: new Date().toISOString(),
  boundary:
    'Actual Tauri WebView, typed guided Git commands, and Rust/libgit2 IPC. Tauri freezes invoke, so only the plugin:dialog|open IPC fetch response is replaced with this workspace path; native folder selection itself is not verified. Every other fetch delegates unchanged. No commits, network Git commands, or provider writes are performed.',
  checks: [],
  errors: [],
  providerRequests: [],
  cleanup: [],
};
const artifacts = resolve(root, 'artifacts');
const screenshots = join(artifacts, 'learning');
await mkdir(screenshots, { recursive: true });
let browser;
let page;
let created = false;
let canonicalPath;
let previousGuide;
let patched = false;

const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const ipc = (command, args) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
const input = () => page.getByRole('textbox', { name: 'Guided Git command', exact: true });
async function run(source, expected) {
  const outputs = page.locator('.glass-command-output');
  const before = await outputs.count();
  await input().fill(source);
  await input().press('Enter');
  await expect(outputs).toHaveCount(before + 1, { timeout: 20_000 });
  await expect(outputs.last()).toContainText(expected, { timeout: 20_000 });
  await expect(input()).toHaveValue('');
  await expect(input()).toBeEnabled();
  return outputs.last();
}

try {
  browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((target) => target.url().includes(':1420'));
  assert.ok(page, 'The native Branchline WebView at port 1420 must be open.');
  report.browser = await browser.version();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('request', (request) => {
    if (/https:\/\/(?:api\.)?(?:github\.com|gitlab\.com)/.test(request.url())) {
      report.providerRequests.push(request.url());
    }
  });
  previousGuide = await page.evaluate(() => localStorage.getItem('branchline.guide.v1'));
  await page.evaluate(() => localStorage.setItem('branchline.guide.v1', 'seen'));
  await page.reload();
  await enterDemoWorkspace(page);
  await page.evaluate(
    ({ patchKey, root }) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals || typeof internals.invoke !== 'function')
        throw new Error('Actual Tauri IPC is required.');
      const pickerUrl = internals.convertFileSrc('plugin:dialog|open', 'ipc');
      const ipcOrigin = new URL(pickerUrl).origin;
      const state = { originalFetch: window.fetch, pickerSelections: 0, commands: [] };
      window[patchKey] = state;
      window.fetch = function (input, init) {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.href === pickerUrl) {
          state.pickerSelections++;
          return Promise.resolve(
            new Response(JSON.stringify(root), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
            }),
          );
        }
        if (url.origin === ipcOrigin)
          state.commands.push(decodeURIComponent(url.pathname.slice(1)));
        return state.originalFetch.call(window, input, init);
      };
    },
    { patchKey, root },
  );
  patched = true;

  const openThroughPicker = async () => {
    await page.locator('.add-repository').click();
    await page.waitForTimeout(200);
    report.pickerDiagnostics ??= [];
    report.pickerDiagnostics.push(
      await page.evaluate(
        (key) => ({
          selections: window[key]?.pickerSelections,
          nativeCommands: [...new Set(window[key]?.commands || [])],
          repository: document.querySelector('.repository-item')?.textContent,
          alerts: [...document.querySelectorAll('[role="alert"]')].map(
            (element) => element.textContent,
          ),
        }),
        patchKey,
      ),
    );
    await expect(page.locator('.repository-item')).toContainText(basename(root), {
      timeout: 20_000,
    });
    await expect(page.locator('.glass-environment')).toHaveText('Local');
    await expect(page.locator('.demo-ribbon')).toHaveCount(0);
    await expect(input()).toBeVisible();
    await expect(input()).toBeEnabled();
  };
  await openThroughPicker();
  const snapshot = await ipc('open_repository', { path: root });
  canonicalPath = snapshot.path;
  assert.equal(snapshot.name, basename(root));
  assert.ok(snapshot.commits.length, 'The real project must have committed history.');
  check(
    'The existing-repository button opens the actual project through a picker-IPC-only path fixture and leaves practice mode',
  );

  await run('git status', `On branch ${snapshot.branch}`);
  await run('git log --oneline', snapshot.commits[0].id.slice(0, 7));
  await run('git branch', snapshot.branch);
  check('Typed status, log, and branch commands read the real repository and its current branch');

  await writeFile(fixturePath, contents, { flag: 'wx' });
  created = true;
  // Use a bounded watcher wait. Reopening through the same picker fixture is
  // a fallback if this platform coalesces filesystem notifications.
  let watched = true;
  try {
    await expect(page.getByRole('button', { name: `Stage ${filename}`, exact: true })).toBeVisible({
      timeout: 8_000,
    });
  } catch {
    watched = false;
    await openThroughPicker();
    await expect(page.getByRole('button', { name: `Stage ${filename}`, exact: true })).toBeVisible({
      timeout: 20_000,
    });
  }
  report.watcherObserved = watched;
  check(
    watched
      ? 'The actual filesystem watcher discovers the unique temporary file in Changes'
      : 'Reopening the actual repository refreshes the unique temporary file in Changes (watcher delivery was not observed)',
  );

  await run(`git add -- "${filename}"`, `Staged "${filename}"`);
  const staged = await ipc('open_repository', { path: canonicalPath });
  assert.ok(
    staged.files.some((file) => file.path === filename && file.staged),
    'Typed git add must modify the real index.',
  );
  await expect(
    page.getByRole('button', { name: `Unstage ${filename}`, exact: true }),
  ).toBeVisible();
  check('Typed git add changes the real Git index and the workspace staging control');

  await run(`git diff --staged -- "${filename}"`, `diff --git a/${filename}`);
  await expect(page.locator('.glass-command-output').last()).toContainText(
    '+A temporary real Git engine check.',
  );
  const stagedDiff = await ipc('get_diff', {
    path: canonicalPath,
    filePath: filename,
    staged: true,
  });
  assert.equal(stagedDiff.modified, contents);
  check('The guided staged diff displays the actual fixture contents returned by Rust');

  await run(`git restore --staged -- "${filename}"`, `Unstaged "${filename}"`);
  const unstaged = await ipc('open_repository', { path: canonicalPath });
  assert.ok(!unstaged.files.some((file) => file.path === filename && file.staged));
  assert.ok(unstaged.files.some((file) => file.path === filename && !file.staged));
  assert.equal(await readFile(fixturePath, 'utf8'), contents);
  check(
    'Typed restore --staged removes only the fixture from the index and preserves its exact contents',
  );

  await run('git reset --hard', 'unavailable');
  const afterRejected = await ipc('open_repository', { path: canonicalPath });
  const statusRows = (state) =>
    state.files
      .map((file) => [file.path, file.status, file.staged])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(statusRows(afterRejected), statusRows(unstaged));
  assert.equal(afterRejected.commits[0].id, unstaged.commits[0].id);
  assert.equal(await readFile(fixturePath, 'utf8'), contents);
  check(
    'The guided terminal rejects hard reset while preserving real index status, HEAD, and fixture contents',
  );

  const stream = page.getByRole('log', { name: 'Git commands and interface actions', exact: true });
  await expect(stream).toContainText('Open repository');
  await expect(stream.locator('code').filter({ hasText: filename }).last()).toContainText(
    'restore',
  );
  const calls = await page.evaluate(
    (key) => ({ pickerSelections: window[key].pickerSelections, commands: window[key].commands }),
    patchKey,
  );
  assert.ok(calls.pickerSelections >= 1);
  for (const command of ['open_repository', 'stage_file', 'unstage_file', 'get_diff']) {
    assert.ok(calls.commands.includes(command), `Real native ${command} must be invoked.`);
  }
  report.nativeCommands = [...new Set(calls.commands)].sort();
  report.pickerFixtureSelections = calls.pickerSelections;
  check(
    'Interface requests and Rust-generated equivalent Git commands are visible together in the actual terminal',
  );

  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(screenshots, 'native-terminal.png') });
  report.screenshot = 'artifacts/learning/native-terminal.png';
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.providerRequests.length, 0, 'This test must not contact a provider.');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  if (created) {
    try {
      assert.equal(dirname(fixturePath), root);
      await ipc('unstage_file', { path: canonicalPath || root, filePath: filename });
      report.cleanup.push('Unstaged only the unique temporary fixture through actual Rust IPC');
    } catch (error) {
      report.cleanup.push(`Could not unstage the unique fixture: ${String(error)}`);
      report.status = 'failed';
      process.exitCode = 1;
    }
    try {
      await unlink(fixturePath);
      report.cleanup.push('Deleted only the unique temporary fixture file');
    } catch (error) {
      report.cleanup.push(`Could not remove the unique fixture: ${String(error)}`);
      report.status = 'failed';
      process.exitCode = 1;
    }
  }
  if (page && !page.isClosed()) {
    if (patched) {
      try {
        await page.evaluate((key) => {
          const state = window[key];
          if (state) {
            window.fetch = state.originalFetch;
            delete window[key];
          }
        }, patchKey);
        report.cleanup.push(
          'Restored the original fetch function; native invoke was never replaced',
        );
      } catch (error) {
        report.cleanup.push(`Could not restore the picker IPC fetch wrapper: ${String(error)}`);
        report.status = 'failed';
        process.exitCode = 1;
      }
    }
    if (previousGuide !== undefined) {
      await page
        .evaluate((value) => {
          if (value === null) localStorage.removeItem('branchline.guide.v1');
          else localStorage.setItem('branchline.guide.v1', value);
        }, previousGuide)
        .catch(() => {});
    }
  }
  await writeFile(
    join(artifacts, 'learning-native-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
  // Detach the Playwright transport only. Never send Browser.close, close the
  // user's native window, terminate Branchline, or close its browser context.
  // This repository's in-process Playwright exposes the CDP transport through
  // toImpl; closing that socket avoids leaving its Node handle alive.
  browser?._connection.toImpl?.(browser)?._connection.close();
  browser?._connection.close();
}
