// Actual Rust IPC against a development desktop app without publisher configuration.
// No provider calls, credential-store changes, or Git mutations.
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
  assert.equal(status.configured, false, 'Run this smoke on an unconfigured development build.');
  assert.equal(status.connected, false);
  await assert.rejects(ipc('github_auth_start'), /unavailable in this development build/);
  await assert.rejects(ipc('github_auth_configure'), /not found/i);
  await assert.rejects(ipc('github_auth_open_setup'), /not found/i);
  assert.equal((await ipc('github_auth_status')).configured, false);
  check(
    'Native registration and configuration commands are removed; unconfigured debug sign-in fails without exposing setup',
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
    if (await evaluate(`Boolean(document.querySelector('.github-connect'))`)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const labels = await evaluate(`({
    content: document.querySelector('.github-connect')?.textContent,
    inputs: document.querySelectorAll('.github-connect input').length,
    setup: document.querySelectorAll('.github-owner-setup,.github-owner-disclosure').length,
    signinDisabled: [...document.querySelectorAll('.github-connect button')].find(button => button.textContent.trim() === 'Sign in with GitHub')?.disabled
  })`);
  assert.match(labels.content, /GitHub sign-in is unavailable in this development build/);
  assert.doesNotMatch(labels.content, /Client ID|Register GitSomething|app setup/i);
  assert.equal(labels.inputs, 0);
  assert.equal(labels.setup, 0);
  assert.equal(labels.signinDisabled, true);
  assert.equal((await ipc('github_auth_status')).configured, false);
  check(
    'Actual desktop sign-in contains no registration or Client ID controls and explains development-only unavailability',
  );
  assert.deepEqual(errors, []);
  screenshot = await send('Page.captureScreenshot', { format: 'png' });
} finally {
  socket.close();
}
// Write artifacts after disconnecting CDP so Vite file watching cannot interrupt a check.
await mkdir('artifacts/github-repositories', { recursive: true });
await writeFile(
  'artifacts/github-repositories/native-development-signin.png',
  Buffer.from(screenshot.data, 'base64'),
);
await writeFile(
  'artifacts/github-repositories-native-report.json',
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      boundary:
        'Actual rebuilt Tauri WebView and Rust IPC without publisher configuration. No OAuth authorization, provider request, registration, configuration write or Git mutation.',
      checks,
      errors,
      status: 'passed',
    },
    null,
    2,
  ) + '\n',
);
