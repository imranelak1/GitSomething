// Actual packaged WebView2 through page-only CDP. Never capture screenshots,
// serialize account/repository metadata, initiate OAuth, or change Git state.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const cdpURL = new URL(process.env.GITSOMETHING_CDP_URL || 'http://127.0.0.1:9223');
assert.ok(
  cdpURL.protocol === 'http:' &&
    cdpURL.hostname === '127.0.0.1' &&
    cdpURL.port === '9223' &&
    !cdpURL.username &&
    !cdpURL.password,
  'This smoke only connects to WebView2 on loopback port 9223.',
);
const packagedOrigin = (value) =>
  /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(value);
const report = {
  testedAt: new Date().toISOString(),
  boundary:
    'Actual packaged Tauri startup and page reloads through direct page-only CDP. Reports contain booleans, timings, and error counts only. No screenshots, private repository/account metadata, OAuth initiation, sign-out, provider writes, or real Git mutations. Demo navigation is explicitly selected and returns to Home.',
  checks: [],
  runtimeErrorCount: 0,
  consoleErrorCount: 0,
  securityErrorCount: 0,
  cspBlockedRequestCount: 0,
};
const check = (label) => {
  report.checks.push(label);
  console.log(`PASS ${label}`);
};
const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));
const targets = await (await fetch(new URL('/json/list', cdpURL))).json();
const target = targets.find((entry) => entry.type === 'page' && packagedOrigin(entry.url));
assert.ok(
  target,
  'Launch the packaged GitSomething app on CDP port 9223; dev targets are excluded.',
);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('Native CDP connection failed.')), {
    once: true,
  });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) {
      // Context loss during a reload is expected. Never copy protocol messages,
      // exception values, or DOM into the report: they can contain private data.
      request.reject(
        Object.assign(new Error(`Native ${request.method} command failed.`), {
          contextLost: /context.*(?:destroyed|not found)|cannot find context|navigat/i.test(
            message.error.message || '',
          ),
        }),
      );
    } else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') report.runtimeErrorCount += 1;
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
    report.consoleErrorCount += 1;
  if (
    message.method === 'Log.entryAdded' &&
    message.params.entry.source === 'security' &&
    message.params.entry.level === 'error'
  )
    report.securityErrorCount += 1;
  if (message.method === 'Network.loadingFailed' && message.params.blockedReason === 'csp')
    report.cspBlockedRequestCount += 1;
});
socket.addEventListener('close', () => {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('Native CDP connection closed.'));
  }
  pending.clear();
});
function send(method, params = {}, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Native ${method} timed out.`));
    }, timeout);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error('Native evaluation raised an exception.');
  return result.result.value;
}
async function waitFor(expression, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await evaluate(expression);
      if (result) return result;
    } catch (error) {
      if (!error.contextLost) throw error;
    }
    await pause(25);
  }
  throw new Error(label);
}
async function reload() {
  const previousDocument = await evaluate('performance.timeOrigin');
  await send('Page.reload', { ignoreCache: false });
  await waitFor(
    `performance.timeOrigin !== ${previousDocument}`,
    'Packaged reload must create a fresh document.',
  );
}
const homeReady = `Boolean(document.querySelector('.home-page') &&
  !document.querySelector('.startup-screen') &&
  !document.querySelector('.startup-app')?.inert)`;
const safeAuth = () =>
  evaluate(`window.__TAURI_INTERNALS__.invoke('github_auth_status').then(status => ({
    configured: status.configured === true, connected: status.connected === true
  }))`);
const startupState = `(() => {
  const screen = document.querySelector('.startup-screen');
  const app = document.querySelector('.startup-app');
  return screen && {
    visible: screen.getBoundingClientRect().height > 0,
    homeMounted: Boolean(document.querySelector('.home-page')),
    backgroundInert: app?.inert === true,
    backgroundHidden: app?.getAttribute('aria-hidden') === 'true',
    skipFocused: document.activeElement?.matches('.startup-skip') === true,
    elapsedMs: performance.now(),
  };
})()`;

try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await waitFor(homeReady, 'Packaged Home must be ready before this smoke.');
  assert.equal(
    await evaluate(`Boolean(document.querySelector('[role="dialog"],.github-device-flow'))`),
    false,
    'Close real dialogs and finish consent before running the startup smoke.',
  );
  const before = await safeAuth();
  assert.equal(before.configured, true, 'The packaged release needs its shared OAuth client ID.');
  report.githubConfigured = before.configured;
  report.githubConnectedBefore = before.connected;
  report.reducedMotion = await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
  check('Packaged Home is ready with safe native auth status and no active consent');

  await reload();
  if (!report.reducedMotion) {
    const startup = await waitFor(startupState, 'A fresh packaged reload must display startup.');
    assert.equal(startup.visible, true);
    assert.equal(startup.homeMounted, true, 'Home must mount while startup is visible.');
    assert.equal(startup.backgroundInert, true);
    assert.equal(startup.backgroundHidden, true);
    assert.equal(startup.skipFocused, true);
    report.startupObserved = startup;
    check('Native startup leaves Home mounted and inert while its skip control owns focus');
    await waitFor(homeReady, 'Startup must finish without waiting for GitHub or network.', 3200);
    report.naturalCompletionMs = Math.round(await evaluate('performance.now()'));
    assert.ok(
      report.naturalCompletionMs <= 3000,
      'Natural startup must finish within three seconds.',
    );
  } else {
    await waitFor(homeReady, 'Reduced-motion startup must immediately expose Home.');
    assert.equal(await evaluate(`Boolean(document.querySelector('.startup-screen'))`), false);
    report.reducedMotionBypassed = true;
  }
  await waitFor(
    `document.activeElement?.matches('.home-open-repository') === true`,
    'Startup must hand keyboard focus to Open repository.',
  );
  check('Native startup completes finitely and hands focus to Open repository');

  if (!report.reducedMotion) {
    await reload();
    await waitFor(startupState, 'Fresh reload must replay startup before testing Escape.');
    const started = Date.now();
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await waitFor(homeReady, 'Escape must immediately dismiss native startup.', 1500);
    await waitFor(
      `document.activeElement?.matches('.home-open-repository') === true`,
      'Escape must restore Home focus.',
    );
    report.escapeDismissalMs = Date.now() - started;
    assert.ok(report.escapeDismissalMs < 1000);
    check('Escape dismisses native startup promptly and restores Home keyboard focus');
  }

  await evaluate(`document.querySelector('button[aria-label="Try demo workspace"]').click()`);
  await waitFor(
    `Boolean(document.querySelector('.app-body:not([hidden]) .repository-toolbar'))`,
    'The explicitly selected demo workspace must open.',
  );
  assert.equal(await evaluate(`Boolean(document.querySelector('.startup-screen'))`), false);
  await evaluate(`document.querySelector('.brand').click()`);
  await waitFor(homeReady, 'The native startup smoke must return to Home.');
  await pause(300);
  assert.equal(await evaluate(`Boolean(document.querySelector('.startup-screen'))`), false);
  check('Demo and Home navigation do not replay startup and the app returns to Home');

  const after = await safeAuth();
  report.githubConnectedAfter = after.connected;
  assert.equal(after.configured, before.configured);
  assert.equal(after.connected, before.connected, 'The smoke must preserve the signed-in account.');
  assert.equal(await evaluate(`Boolean(document.querySelector('.github-device-flow'))`), false);
  assert.equal(report.runtimeErrorCount, 0);
  assert.equal(report.consoleErrorCount, 0);
  assert.equal(report.securityErrorCount, 0);
  assert.equal(report.cspBlockedRequestCount, 0);
  check(
    'Account connection is preserved without runtime errors or blocked production CSP requests',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  // Every error generated by this script is fixed text, with no account or DOM payload.
  report.failure =
    error instanceof assert.AssertionError ? error.message.split('\n')[0] : error.message;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  const closed = new Promise((resolve) =>
    socket.addEventListener('close', resolve, { once: true }),
  );
  socket.close();
  await Promise.race([closed, pause(1000)]);
}
// Artifact writes happen only after disconnecting; no live reload is induced mid-check.
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
await writeFile(
  new URL('startup-native-report.json', artifacts),
  `${JSON.stringify(report, null, 2)}\n`,
);
