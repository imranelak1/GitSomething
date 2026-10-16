// Launch a debug Branchline WebView with WebView2 CDP on loopback port 9223.
// This check uses actual Rust IPC and a temporary file in the current repo.
// Native folder selection and provider publishing require manual verification.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const root = process.cwd();
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()[0]
  .pages()
  .find((target) => target.url().includes(':1420'));
assert.ok(page, 'The native Branchline WebView must be open.');
const filePath = `.branchline-smoke-${crypto.randomUUID()}.txt`;
let created = false;
let canonicalPath;
const report = {
  testedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  boundary:
    'Real Tauri IPC and Rust Git engine. Native folder selection and provider publishing require manual verification.',
};
const ipc = (command, args) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  });
page.on('pageerror', (error) => report.errors.push(error.message));
try {
  await page.reload();
  await page.locator('.monaco-diff-editor').waitFor();
  const snapshot = await ipc('open_repository', { path: root });
  canonicalPath = snapshot.path;
  assert.equal(snapshot.name, basename(root));
  assert.ok(snapshot.commits.length > 0);
  report.checks.push(
    'Actual Rust IPC opens this local repository and returns its real branch and history',
  );

  await writeFile(join(root, filePath), 'A temporary native IPC test.\n', { flag: 'wx' });
  created = true;
  const args = { path: canonicalPath, filePath };
  const before = await ipc('get_diff', { ...args, staged: false });
  await ipc('stage_file', args);
  const staged = await ipc('get_diff', { ...args, staged: true });
  assert.equal(staged.modified, before.modified);
  await ipc('unstage_file', args);
  const after = await ipc('get_diff', { ...args, staged: false });
  assert.deepEqual(after, before);
  report.checks.push(
    'Actual native stage/unstage IPC changes the Git index and preserves the working file exactly',
  );
  assert.ok(
    (await page.locator('.console-line').allTextContents()).some((text) =>
      text.includes('restore'),
    ),
  );
  report.checks.push('Rust-generated equivalent commands reach the actual WebView console');
  await page.evaluate(() => document.fonts.ready);
  await mkdir('artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: 'artifacts/screenshots/native-window.png' });
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.status = 'passed';
  await writeFile('artifacts/native-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (created) {
    await ipc('unstage_file', { path: canonicalPath, filePath }).catch(() => {});
    await unlink(join(root, filePath));
  }
  await browser.close();
}
