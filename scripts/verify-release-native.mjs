// Actual packaged Tauri WebView and Rust IPC only. Launch the release executable
// with WebView2 CDP on loopback port 9223 before running this script. It never
// starts OAuth, opens a browser, changes Git state, or approves account access.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const cdpURL = process.env.GITSOMETHING_CDP_URL || 'http://127.0.0.1:9223';
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const artifacts = new URL('../artifacts/', import.meta.url);
const report = {
  testedAt: new Date().toISOString(),
  expectedVersion: manifest.version,
  boundary:
    'Actual packaged native application, shared OAuth configuration, and bundled Monaco worker under production CSP. Read-only Rust status IPC and explicitly selected demo only; no OAuth initiation/consent, browser launch, provider writes, Git mutations, or credential-store writes.',
  checks: [],
  runtimeErrors: [],
  securityErrors: [],
  cspBlockedRequests: [],
};
const packagedOrigin = (value) =>
  /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(value);
const targets = await (await fetch(`${cdpURL}/json/list`)).json();
const target = targets.find((item) => item.type === 'page' && packagedOrigin(item.url));
assert.ok(
  target,
  'Launch the packaged GitSomething release with CDP on loopback port 9223. Development-server targets are deliberately excluded.',
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const workerRequests = new Set();
const redact = (value) =>
  String(value)
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, '$1[redacted]@')
    .replace(
      /([?&](?:code|token|session|device_code|user_code|access_token)[^=\s]*=)[^&\s]+/gi,
      '$1[redacted]',
    )
    .slice(0, 1200);
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(redact(message.error.message)));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const exception = message.params.exceptionDetails;
    report.runtimeErrors.push(redact(exception.exception?.description || exception.text));
  }
  if (message.method === 'Log.entryAdded') {
    const entry = message.params.entry;
    if (entry.source === 'security' && entry.level === 'error') {
      report.securityErrors.push(redact(entry.text));
    }
  }
  if (message.method === 'Network.loadingFailed' && message.params.blockedReason === 'csp') {
    report.cspBlockedRequests.push({ type: message.params.type, reason: 'csp' });
  }
  if (message.method === 'Network.requestWillBeSent') {
    const url = message.params.request.url;
    if (packagedOrigin(url) && /editor\.worker[^/]*\.js(?:\?|$)/.test(url)) {
      workerRequests.add(new URL(url).pathname);
    }
  }
});
socket.addEventListener('close', () => {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('The native CDP connection closed.'));
  }
  pending.clear();
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out.`));
    }, 30_000);
    pending.set(id, { resolve, reject, timer });
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
    throw new Error(
      redact(result.exceptionDetails.exception?.description || result.exceptionDetails.text),
    );
  }
  return result.result.value;
}
async function ipc(command) {
  const result = await evaluate(
    `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}).then(data => ({ok:true,data}), () => ({ok:false}))`,
  );
  assert.equal(result.ok, true, `Native command ${command} must succeed.`);
  return result.data;
}
async function waitFor(expression, message, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
const check = (message) => {
  report.checks.push(message);
  console.log(`PASS ${message}`);
};
let screenshot;
try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  const origin = await evaluate('location.origin');
  assert.ok(
    packagedOrigin(`${origin}/`),
    'The app must serve bundled assets from a packaged Tauri origin.',
  );
  report.origin = origin;
  report.version = await ipc('plugin:app|version');
  assert.equal(report.version, manifest.version);
  assert.equal(await ipc('plugin:app|name'), 'GitSomething');
  check('Actual packaged Tauri version and product name match the alpha release manifests');

  const status = await ipc('github_auth_status');
  assert.deepEqual(
    Object.keys(status)
      .filter((key) => key !== 'error')
      .sort(),
    ['account', 'configured', 'connected', 'scopes'],
    'Native auth status must expose metadata without credential fields.',
  );
  assert.equal(
    status.configured,
    true,
    'The publisher OAuth Client ID must be embedded in the release.',
  );
  assert.equal(typeof status.connected, 'boolean');
  assert.ok(Array.isArray(status.scopes));
  if (status.account !== null) {
    assert.deepEqual(Object.keys(status.account).sort(), ['avatarUrl', 'email', 'login', 'name']);
  }
  report.githubConfigured = true;
  report.githubConnected = status.connected;
  check('Packaged Rust auth reports shared GitHub configuration and only safe account metadata');

  assert.equal(
    await evaluate(`Boolean(document.querySelector('.github-device-flow'))`),
    false,
    'Finish or cancel any pending sign-in before running this read-only smoke.',
  );
  assert.equal(
    await evaluate(`Boolean(document.querySelector('[role="dialog"]'))`),
    false,
    'Close open dialogs before running the packaged release smoke.',
  );
  await evaluate(`document.querySelector('.brand').click()`);
  await waitFor(`Boolean(document.querySelector('.home-page'))`, 'Home must open.');
  await evaluate('document.fonts.ready.then(() => true)');
  const brand = await evaluate(`(() => {
    const mark = document.querySelector('.brand .logo-mark');
    const bounds = mark?.getBoundingClientRect();
    return {
      rendered: Boolean(mark instanceof SVGElement && mark.querySelector('path')),
      width: bounds?.width || 0,
      height: bounds?.height || 0,
      identity: mark?.getAttribute('data-brand'),
      viewBoxWidth: mark?.viewBox?.baseVal.width || 0,
      viewBoxHeight: mark?.viewBox?.baseVal.height || 0,
      text: document.querySelector('.brand')?.textContent.trim(),
      setupFields: document.querySelectorAll('.github-owner-setup,.github-owner-disclosure,input[aria-label="GitHub OAuth client ID"]').length,
    };
  })()`);
  assert.equal(brand.rendered, true);
  assert.ok(
    brand.width >= 16 && brand.height >= 16,
    'The application mark must have visible dimensions.',
  );
  assert.equal(brand.identity, 'gitsomething');
  assert.equal(brand.viewBoxWidth, 128);
  assert.equal(brand.viewBoxHeight, 128);
  assert.match(brand.text, /GitSomething/);
  assert.equal(brand.setupFields, 0);
  report.brand = brand;
  check('Packaged Home displays the loaded application mark without end-user OAuth setup fields');

  await evaluate(`document.querySelector('button[aria-label="Try demo workspace"]').click()`);
  await waitFor(
    `(() => {
    const editor = document.querySelector('.monaco-diff-editor');
    const bounds = editor?.getBoundingClientRect();
    return Boolean(bounds && bounds.width > 100 && bounds.height > 80 && !editor.closest('[hidden]'));
  })()`,
    'The bundled Monaco diff editor must mount in the explicitly selected practice workspace.',
  );
  await waitFor(
    `Boolean(document.querySelector('.monaco-diff-editor .view-lines')?.textContent.trim())`,
    'The bundled Monaco editor must render sample code.',
  );
  assert.equal(await evaluate(`typeof self.MonacoEnvironment?.getWorker`), 'function');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const resourceWorkers = await evaluate(`performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => /editor\\.worker[^/]*\\.js(?:\\?|$)/.test(name))
    .map(name => new URL(name).pathname)`);
  let workerTargets = [];
  try {
    const discovered = await send('Target.getTargets');
    workerTargets = discovered.targetInfos
      .filter(
        (item) =>
          ['worker', 'shared_worker'].includes(item.type) &&
          packagedOrigin(item.url.replace(/^blob:/, '')),
      )
      .map((item) => ({
        type: item.type,
        scheme: item.url.startsWith('blob:') ? 'blob' : 'packaged',
      }));
  } catch {
    // Worker requests and Resource Timing still prove bundled worker resolution
    // on WebView2 versions that do not expose Target discovery from a page.
  }
  report.monaco = {
    packagedWorkerAssets: [...new Set([...workerRequests, ...resourceWorkers])],
    workerTargets,
  };
  assert.ok(
    report.monaco.packagedWorkerAssets.length || workerTargets.length,
    'A bundled Monaco worker must load from the packaged origin or its allowed blob origin.',
  );
  check('Bundled Monaco renders code and starts its worker under the packaged production CSP');

  await evaluate(`document.querySelector('.brand').click()`);
  await waitFor(`Boolean(document.querySelector('.home-page'))`, 'The smoke must return to Home.');
  await evaluate('document.fonts.ready.then(() => true)');
  assert.equal(await evaluate(`Boolean(document.querySelector('.github-device-flow'))`), false);
  assert.deepEqual(report.runtimeErrors, []);
  assert.deepEqual(report.securityErrors, []);
  assert.deepEqual(report.cspBlockedRequests, []);
  // Let the Home TextRoll entrance finish before recording visual evidence.
  await new Promise((resolve) => setTimeout(resolve, 1300));
  // A connected Home can contain private repository names. Never record it as
  // release proof; signed-in visuals belong to explicit browser fixtures.
  if ((await ipc('github_auth_status')).connected) {
    report.screenshotSkipped =
      'Authenticated account; repository metadata is excluded from native visual evidence.';
  } else {
    assert.equal(await evaluate(`Boolean(document.querySelector('.github-device-flow'))`), false);
    screenshot = await send('Page.captureScreenshot', { format: 'png' });
  }
  check('Native smoke returns to Home without JavaScript exceptions or blocked CSP requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = redact(error.message || error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  const closed = new Promise((resolve) =>
    socket.addEventListener('close', resolve, { once: true }),
  );
  socket.close();
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))]);
}
// Write only after disconnecting CDP. Never capture a pending consent screen or
// serialize authentication responses, codes, sessions, or credentials to disk.
await mkdir(artifacts, { recursive: true });
if (screenshot) {
  await mkdir(new URL('release/', artifacts), { recursive: true });
  await writeFile(
    new URL('release/native-home.png', artifacts),
    Buffer.from(screenshot.data, 'base64'),
  );
  report.screenshot = 'artifacts/release/native-home.png';
}
await writeFile(
  new URL('releases-native-report.json', artifacts),
  `${JSON.stringify(report, null, 2)}\n`,
);
