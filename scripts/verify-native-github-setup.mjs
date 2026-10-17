// Actual Rust IPC against an unconfigured desktop app. No provider calls,
// valid Client ID writes, credential-store changes, or Git mutations.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const targets = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target = targets.find((item) => item.type === 'page' && item.url.includes(':1420'));
assert.ok(target, 'Launch GitSomething with WebView2 CDP on loopback port 9223.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const requests = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    errors.push(message.params.exceptionDetails.text);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error(`${method} timed out.`));
    }, 15_000);
    requests.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}
async function ipc(command, args = {}) {
  // Catch expected native string rejections inside the page before CDP serializes them.
  const result = await evaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)}).then(data => ({ok:true,data}), error => ({ok:false,error:String(error)}))`,
  );
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
const checks = [];
const check = (message) => {
  checks.push(message);
  console.log(`PASS ${message}`);
};
let screenshot;
await send('Runtime.enable');
try {
  const status = await ipc('github_auth_status');
  assert.equal(typeof status.configured, 'boolean');
  assert.equal(typeof status.connected, 'boolean');
  assert.deepEqual(
    Object.keys(status)
      .filter((key) => key !== 'error')
      .sort(),
    ['account', 'configured', 'connected', 'scopes'],
  );
  check('Rebuilt native auth status exposes account state without credentials');
  assert.equal(status.configured, false, 'Run this smoke before completing owner setup.');
  assert.equal(status.connected, false);
  await assert.rejects(ipc('github_auth_start'), /public OAuth client ID/);
  await assert.rejects(
    ipc('github_auth_configure', { clientId: 'ghp_invalid-fixture-not-a-credential' }),
    /public Client ID/,
  );
  assert.equal((await ipc('github_auth_status')).configured, false);
  check(
    'Native setup rejects token-shaped input and missing configuration without saving a fake Client ID',
  );
  await assert.rejects(
    ipc('list_github_repositories', { request: { page: 1, perPage: 50 } }),
    /Connect to GitHub/,
  );
  await assert.rejects(
    ipc('open_github_repository', { url: 'https://example.invalid/owner/repo' }),
    /GitHub repository's HTTPS page/,
  );
  check('Native repository IPC rejects unauthenticated reads and unsafe browser destinations');
  await evaluate(`document.querySelector('button[aria-label="GitHub account"]').click()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector('.github-owner-setup input'))`)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const labels = await evaluate(`({
    setup: document.querySelector('.github-owner-setup')?.textContent,
    input: document.querySelector('.github-owner-setup input')?.labels[0]?.textContent,
    forms: document.querySelectorAll('.github-connect form').length
  })`);
  assert.match(labels.setup, /Register GitSomething on GitHub/);
  assert.match(labels.setup, /Device Flow/);
  assert.equal(labels.input, 'GitHub OAuth client ID');
  assert.equal(labels.forms, 0);
  await evaluate(`document.querySelector('.github-owner-setup input').focus()`);
  await send('Input.insertText', { text: 'ghp_invalid-fixture-not-a-credential' });
  await evaluate(`document.querySelector('.github-owner-save').click()`);
  // React state commits after the click handler returns.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector('.github-owner-input-error'))`)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(
    await evaluate(`document.querySelector('.github-owner-input-error')?.textContent ?? ''`),
    /public Client ID/,
  );
  assert.equal((await ipc('github_auth_status')).configured, false);
  await evaluate(`document.querySelector('.github-owner-setup input').select()`);
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type,
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    });
  }
  check(
    'Actual desktop owner guide renders registration instructions and validates input without nested publishing forms',
  );
  assert.deepEqual(errors, []);
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
} finally {
  socket.close();
}
// Write artifacts after disconnecting CDP so Vite file watching cannot interrupt a check.
await mkdir('artifacts/github-repositories', { recursive: true });
await writeFile(
  'artifacts/github-repositories/native-owner-setup.png',
  Buffer.from(screenshot.data, 'base64'),
);
await writeFile(
  'artifacts/github-repositories-native-report.json',
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      boundary:
        'Actual rebuilt Tauri WebView and Rust IPC, unconfigured owner session. No fake Client ID persisted, OAuth authorization, provider request or Git mutation.',
      checks,
      errors,
      status: 'passed',
    },
    null,
    2,
  ) + '\n',
);
