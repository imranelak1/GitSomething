// Run only when the maintainer has launched the intended packaged candidate
// with WebView2 CDP on loopback 9223 and reserved it for this single verifier.
// GitHub must already be approved. Only plugin:dialog|open is replaced with a
// chosen temporary parent (or cancellation); all Git/auth/event IPC remains real.
// Tauri's invoke is immutable. The exact dialog custom-protocol fetch alone gets
// a fixture Response matching Tauri's scripts/ipc-protocol.js callback contract.
// This clones one known public project and leaves the checkout intact. It never
// starts OAuth, signs out, mutates a provider, removes a directory, or screenshots
// account data. Private cloning and the native picker UI are outside this proof.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cdpURL = 'http://127.0.0.1:9223';
const publicProject = 'imranelak1/GitSomething';
const cloneURL = `https://github.com/${publicProject}.git`;
const cloneButton = `button[aria-label="Clone and open ${publicProject}"]`;
const cloneReady = `(() => { const button = document.querySelector(${JSON.stringify(cloneButton)}); return Boolean(document.querySelector('.home-page') && button && !button.disabled); })()`;
const externalLink = `a[aria-label="Open ${publicProject} on GitHub"]`;
const stateKey = '__GITSOMETHING_CLONE_SMOKE__';
const reportFile = new URL('../artifacts/github-clone-native-report.json', import.meta.url);
const report = {
  testedAt: new Date().toISOString(),
  boundary:
    'Packaged native app and real GitHub public clone using existing approved native auth; only folder-picker selection/cancellation is supplied by a fixture. Private cloning, the native picker UI, and provider writes are unverified.',
  checks: [],
  proof: {},
  counts: {
    runtimeErrors: 0,
    consoleErrors: 0,
    securityErrors: 0,
    cspBlockedRequests: 0,
    cleanupErrors: 0,
  },
};
let stage = 'prepare';
let stageStarted = Date.now();
let socket;
let sequence = 0;
const pending = new Map();
let shimInstalled = false;
let fixturePath;
let ownsFixture = false;
let failure = false;

const packagedOrigin = (value) =>
  /^(?:https?:\/\/tauri\.localhost|tauri:\/\/localhost)(?:\/|$)/.test(value);
const delay = () => new Promise((resolve) => setTimeout(resolve, 125));
function begin(value) {
  stage = value;
  stageStarted = Date.now();
}
function check(name) {
  report.checks.push({ check: name, passed: true, durationMs: Date.now() - stageStarted });
  console.log(`PASS ${name}`);
}
function send(method, params = {}, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Native diagnostic timed out.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, timeoutMs) {
  const result = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs,
  );
  assert.ok(!result.exceptionDetails, 'The native diagnostic must complete safely.');
  return result.result.value;
}
async function waitFor(expression, message, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay();
  }
  throw new Error(message);
}
function configSections(content) {
  const sections = new Map();
  let values;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      values = {};
      sections.set(line, values);
    } else if (values && line && !line.startsWith('#') && !line.startsWith(';')) {
      const separator = line.indexOf('=');
      if (separator >= 0)
        values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return sections;
}

try {
  begin('packaged-prerequisites');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  report.version = manifest.version;
  const targets = await (await fetch(`${cdpURL}/json/list`)).json();
  const target = targets.find((item) => item.type === 'page' && packagedOrigin(item.url));
  assert.ok(target, 'The intended packaged candidate must be running on loopback CDP9223.');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Native CDP connection failed.')), {
      once: true,
    });
  });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error('Native diagnostic request failed.'));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') report.counts.runtimeErrors++;
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      report.counts.consoleErrors++;
    if (
      message.method === 'Log.entryAdded' &&
      message.params.entry.source === 'security' &&
      message.params.entry.level === 'error'
    )
      report.counts.securityErrors++;
    if (message.method === 'Network.loadingFailed' && message.params.blockedReason === 'csp')
      report.counts.cspBlockedRequests++;
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Native CDP connection closed.'));
    }
    pending.clear();
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  report.proof.versionMatches = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('plugin:app|version').then(value => value === ${JSON.stringify(manifest.version)})`,
  );
  report.proof.packagedOrigin = await evaluate(`(${packagedOrigin.toString()})(location.href)`);
  report.proof.alreadyConnected = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('github_auth_status').then(status => status.connected === true)`,
  );
  assert.ok(
    report.proof.versionMatches && report.proof.packagedOrigin && report.proof.alreadyConnected,
  );
  assert.ok(await evaluate(`!document.querySelector('[role="dialog"],.github-device-flow')`));
  check(
    'Packaged version matches the manifests and the existing native GitHub connection is approved',
  );

  begin('native-row');
  await evaluate(`document.querySelector('.brand').click()`);
  await waitFor(`Boolean(document.querySelector('.home-page'))`, 'Home must open.');
  await waitFor(
    `Boolean(document.querySelector('.github-repositories-row')) && !document.querySelector('.github-repositories-list[aria-busy="true"]')`,
    'The existing account list must load.',
  );
  await evaluate(`(() => {
    document.querySelector('[aria-label="All repositories"]')?.click();
    document.querySelector('[aria-label="Clear repository search"]')?.click();
    const input = document.querySelector('[aria-label="Filter loaded GitHub repositories"]');
    if (input) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(publicProject)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  for (let page = 0; page < 10; page++) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(cloneButton)}))`)) break;
    const loaded = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.github-repositories-footer button')].find(value => value.textContent.trim() === 'Load more repositories' && !value.disabled);
      if (!button) return false;
      button.click(); return true;
    })()`);
    if (!loaded) break;
    await waitFor(
      `!document.querySelector('.github-repositories-list[aria-busy="true"]')`,
      'Repository paging must settle.',
    );
    await delay();
  }
  await waitFor(
    `Boolean(document.querySelector(${JSON.stringify(cloneButton)}))`,
    'The known public project must offer native cloning.',
  );
  await waitFor(
    cloneReady,
    'Finish or cancel any pending native folder selection before running this verifier.',
  );
  report.proof.cloneActionInitiallyReady = true;
  report.proof.separateBrowserLink = await evaluate(
    `Boolean(document.querySelector(${JSON.stringify(externalLink)}))`,
  );
  assert.ok(report.proof.separateBrowserLink);
  check('The known public project has distinct native clone and external GitHub actions');

  const parentPath = await mkdtemp(join(tmpdir(), 'gitsomething-clone-'));
  const destination = join(parentPath, 'GitSomething');
  report.proof.uniqueTemporaryParent = true;
  begin('picker-cancellation');
  const shimProof = await evaluate(`(() => {
    if (window[${JSON.stringify(stateKey)}]) throw new Error('Another clone verifier is active.');
    const internals = window.__TAURI_INTERNALS__;
    const state = { originalInvoke: internals.invoke, originalFetch: window.fetch, dialogURL: internals.convertFileSrc('plugin:dialog|open', 'ipc'), selectedParent: null, parentPath: ${JSON.stringify(parentPath)}, dialogCalls: 0, cloneEvents: 0, transferEvents: 0, checkoutEvents: 0, successfulCloneEvent: false };
    state.fetchWrapper = function(input, ...args) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      if (url === state.dialogURL) {
        state.dialogCalls++;
        return Promise.resolve(new Response(JSON.stringify(state.selectedParent), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Tauri-Response': 'ok' },
        }));
      }
      return state.originalFetch.call(this, input, ...args);
    };
    window[${JSON.stringify(stateKey)}] = state;
    Reflect.set(window, 'fetch', state.fetchWrapper);
    return { fetchReplaced: window.fetch === state.fetchWrapper, invokeUnchanged: internals.invoke === state.originalInvoke };
  })()`);
  shimInstalled = true;
  report.proof.exactDialogFetchFixtureInstalled = shimProof.fetchReplaced;
  report.proof.nativeInvokeUnchanged = shimProof.invokeUnchanged;
  assert.ok(
    shimProof.fetchReplaced && shimProof.invokeUnchanged,
    'The exact dialog fixture must install before any UI click.',
  );
  await evaluate(`(async () => {
    const state = window[${JSON.stringify(stateKey)}];
    state.callbackId = window.__TAURI_INTERNALS__.transformCallback(event => {
      const payload = event.payload;
      const tokens = payload?.tokens?.map(token => token.text) || [];
      if (tokens[0] !== 'git' || tokens[1] !== 'clone' || !tokens.some(value => value.includes(${JSON.stringify(cloneURL)}))) return;
      state.cloneEvents++;
      if (payload.message?.startsWith('Receiving Git objects:')) state.transferEvents++;
      if (payload.message?.startsWith('Checking out files:')) state.checkoutEvents++;
      if (payload.status === 'success') state.successfulCloneEvent = true;
    });
    state.eventId = await state.originalInvoke.call(window.__TAURI_INTERNALS__, 'plugin:event|listen', { event: 'git:log', target: { kind: 'Any' }, handler: state.callbackId });
  })()`);
  await waitFor(cloneReady, 'The clone action must be enabled before the cancellation fixture.');
  await evaluate(`document.querySelector(${JSON.stringify(cloneButton)}).click()`);
  await waitFor(
    `(() => { const state = window[${JSON.stringify(stateKey)}]; const button = document.querySelector(${JSON.stringify(cloneButton)}); return state.dialogCalls === 1 && button && !button.disabled; })()`,
    'Cancelled selection must settle.',
  );
  report.proof.cancelEmitsNoCloneEvents = await evaluate(
    `window[${JSON.stringify(stateKey)}].cloneEvents === 0`,
  );
  report.proof.cancelCreatesNoDestination = await stat(destination).then(
    () => false,
    (error) => error.code === 'ENOENT',
  );
  assert.ok(report.proof.cancelEmitsNoCloneEvents && report.proof.cancelCreatesNoDestination);
  check('Cancelling the picker fixture emits no native clone events and creates no destination');

  begin('public-native-clone');
  await waitFor(cloneReady, 'The clone action must be enabled before the selected-folder fixture.');
  await evaluate(`(() => {
    const state = window[${JSON.stringify(stateKey)}];
    state.selectedParent = state.parentPath;
    document.querySelector(${JSON.stringify(cloneButton)}).click();
  })()`);
  await waitFor(
    `Boolean(document.querySelector('.app-body:not([hidden]) .changes-panel')) && document.querySelector('.statusbar')?.textContent.includes('Local repository')`,
    'The real cloned workspace must open.',
    180_000,
  );
  report.proof.gitDirectoryCreated = await stat(join(destination, '.git')).then(
    (value) => value.isDirectory(),
    () => false,
  );
  const readmeBefore = await readFile(join(destination, 'README.md'));
  report.proof.readmeCheckedOut = readmeBefore.length > 0;
  const cleanClone =
    await evaluate(`window.__TAURI_INTERNALS__.invoke('open_repository', { path: ${JSON.stringify(destination)} }).then(snapshot => {
    window[${JSON.stringify(stateKey)}].clonedPath = snapshot.path;
    return snapshot.files.length === 0 && snapshot.commits.length > 0;
  })`);
  report.proof.realCleanWorkspace = cleanClone;
  assert.ok(report.proof.gitDirectoryCreated && report.proof.readmeCheckedOut && cleanClone);
  check('The native row clones GitHub into the new folder and opens a clean real workspace');

  begin('default-branch-tracking');
  const sections = configSections(await readFile(join(destination, '.git', 'config'), 'utf8'));
  const head = (await readFile(join(destination, '.git', 'HEAD'), 'utf8')).trim();
  assert.ok(head.startsWith('ref: refs/heads/'));
  const branch = head.slice('ref: refs/heads/'.length);
  const remote = sections.get('[remote "origin"]');
  const tracking = sections.get(`[branch "${branch}"]`);
  report.proof.originMatches = remote?.url === cloneURL;
  report.proof.branchTracksOrigin =
    tracking?.remote === 'origin' && tracking?.merge === `refs/heads/${branch}`;
  report.proof.originDefaultHead =
    (
      await readFile(join(destination, '.git', 'refs', 'remotes', 'origin', 'HEAD'), 'utf8')
    ).trim() === `ref: refs/remotes/origin/${branch}`;
  assert.ok(
    report.proof.originMatches && report.proof.branchTracksOrigin && report.proof.originDefaultHead,
  );
  check(
    'Saved Git metadata records origin, the checked-out default branch, upstream, and origin HEAD',
  );

  begin('native-progress-and-console');
  report.counts.cloneEvents = await evaluate(`window[${JSON.stringify(stateKey)}].cloneEvents`);
  report.counts.transferEvents = await evaluate(
    `window[${JSON.stringify(stateKey)}].transferEvents`,
  );
  report.counts.checkoutEvents = await evaluate(
    `window[${JSON.stringify(stateKey)}].checkoutEvents`,
  );
  report.proof.nativeSuccessEvent = await evaluate(
    `window[${JSON.stringify(stateKey)}].successfulCloneEvent`,
  );
  const consoleProof = `(() => {
    const entry = [...document.querySelectorAll('.glass-entry-command')].find(value => {
      const tokens = [...value.querySelectorAll('.glass-command-line code .vengeance-tooltip-trigger > span')].map(token => token.textContent);
      return tokens[0] === 'git' && tokens[1] === 'clone' && tokens.some(value => value.includes(${JSON.stringify(cloneURL)}));
    });
    return Boolean(entry?.querySelector('[aria-label="success"]')) && entry.textContent.includes('equivalent');
  })()`;
  await waitFor(consoleProof, 'The equivalent clone command must render in Glass Box.');
  report.proof.consoleEquivalent = true;
  assert.ok(
    report.counts.transferEvents > 0 &&
      report.counts.checkoutEvents > 0 &&
      report.proof.nativeSuccessEvent &&
      report.proof.consoleEquivalent,
  );
  check(
    'Real Rust transfer and checkout progress reaches events and the equivalent clone appears in Glass Box',
  );

  begin('existing-destination-refusal');
  report.proof.existingDestinationRejected = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('clone_github_repository', { parentPath: ${JSON.stringify(parentPath)}, cloneUrl: ${JSON.stringify(cloneURL)} }).then(() => false, error => typeof error === 'string' && error.includes('already exists'))`,
  );
  report.proof.existingReadmePreserved = readmeBefore.equals(
    await readFile(join(destination, 'README.md')),
  );
  assert.ok(report.proof.existingDestinationRejected && report.proof.existingReadmePreserved);
  check('A second real clone request refuses the existing destination and preserves its README');

  begin('watcher-round-trip');
  const fixtureName = `.gitsomething-clone-smoke-${randomUUID()}.fixture`;
  fixturePath = join(destination, fixtureName);
  await writeFile(fixturePath, 'GitSomething native clone watcher verification.\n', { flag: 'wx' });
  ownsFixture = true;
  await waitFor(
    `Boolean(document.querySelector(${JSON.stringify(`button[aria-label="Stage ${fixtureName}"]`)}))`,
    'The cloned repository watcher must show the owned fixture.',
  );
  report.proof.watcherSawFixture = true;
  await unlink(fixturePath);
  ownsFixture = false;
  await waitFor(
    `!document.querySelector(${JSON.stringify(`button[aria-label="Stage ${fixtureName}"]`)}) && document.querySelector('.files-empty')?.textContent.includes('All caught up')`,
    'The watcher must remove the fixture and return to clean state.',
  );
  report.proof.cleanStateRestored = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('open_repository', { path: ${JSON.stringify(destination)} }).then(snapshot => snapshot.files.length === 0)`,
  );
  assert.ok(report.proof.cleanStateRestored);
  check(
    'The clone watcher shows an owned new file and returns to clean state after only that file is removed',
  );

  begin('recents-and-connected-home');
  await evaluate(`document.querySelector('.brand').click()`);
  await waitFor(`Boolean(document.querySelector('.home-page'))`, 'Home must reopen.');
  report.proof.recentsIncludesClone = await evaluate(
    `[...document.querySelectorAll('.home-recent-open')].some(button => button.title === window[${JSON.stringify(stateKey)}].clonedPath)`,
  );
  report.proof.stillConnected = await evaluate(
    `window.__TAURI_INTERNALS__.invoke('github_auth_status').then(status => status.connected === true)`,
  );
  assert.ok(report.proof.recentsIncludesClone && report.proof.stillConnected);
  check(
    'Home lists the cloned checkout in Recents and the existing GitHub connection stays connected',
  );
} catch {
  failure = true;
  report.failedStage = stage;
  // Never serialize a raw exception: it can include a local path or account data.
  console.error(`FAIL native clone verification at ${stage}`);
} finally {
  if (ownsFixture) {
    await unlink(fixturePath).catch(() => report.counts.cleanupErrors++);
    ownsFixture = false;
  }
  if (shimInstalled && socket?.readyState === WebSocket.OPEN) {
    await evaluate(`(async () => {
      const state = window[${JSON.stringify(stateKey)}];
      if (!state) return { restored: false, listenerRemoved: false, invokeUnchanged: false };
      let listenerRemoved = true;
      let restored = false;
      try {
        if (state.eventId !== undefined) {
          window.__TAURI_EVENT_PLUGIN_INTERNALS__?.unregisterListener('git:log', state.eventId);
          await state.originalInvoke.call(window.__TAURI_INTERNALS__, 'plugin:event|unlisten', { event: 'git:log', eventId: state.eventId });
        }
      } catch {
        listenerRemoved = false;
      } finally {
        try {
          if (state.callbackId !== undefined) window.__TAURI_INTERNALS__.unregisterCallback(state.callbackId);
        } catch { listenerRemoved = false; }
        if (window.fetch === state.fetchWrapper) Reflect.set(window, 'fetch', state.originalFetch);
        restored = window.fetch === state.originalFetch;
        delete window[${JSON.stringify(stateKey)}];
        document.querySelector('.brand')?.click();
      }
      return { restored, listenerRemoved, invokeUnchanged: window.__TAURI_INTERNALS__.invoke === state.originalInvoke };
    })()`).then(
      (value) => {
        report.proof.fetchRestored = value.restored === true;
        report.proof.nativeInvokeUnchanged = value.invokeUnchanged === true;
        report.proof.listenerRemoved = value.listenerRemoved === true;
        if (!value.listenerRemoved) report.counts.cleanupErrors++;
      },
      () => report.counts.cleanupErrors++,
    );
    await waitFor(
      `Boolean(document.querySelector('.home-page'))`,
      'Home must remain open after cleanup.',
    ).catch(() => report.counts.cleanupErrors++);
    report.proof.connectedAfterCleanup = await evaluate(
      `window.__TAURI_INTERNALS__.invoke('github_auth_status').then(status => status.connected === true)`,
    ).catch(() => false);
  }
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  const noErrors = [
    'runtimeErrors',
    'consoleErrors',
    'securityErrors',
    'cspBlockedRequests',
    'cleanupErrors',
  ].every((key) => report.counts[key] === 0);
  if (
    !failure &&
    noErrors &&
    report.proof.fetchRestored &&
    report.proof.nativeInvokeUnchanged &&
    report.proof.connectedAfterCleanup
  ) {
    report.checks.push({
      check:
        'Native diagnostics are clean; dialog fetch fixture and listener are removed, native invoke stays unchanged, and Home remains connected',
      passed: true,
    });
    console.log(
      'PASS Native diagnostics are clean; dialog fetch fixture and listener are removed, native invoke stays unchanged, and Home remains connected',
    );
  } else {
    failure = true;
  }
  report.passedChecks = report.checks.length;
  report.status = failure ? 'failed' : 'passed';
  try {
    await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  } catch {
    failure = true;
    console.error('FAIL writing the counts-only native clone report');
  }
  console.log(
    JSON.stringify({
      status: report.status,
      passedChecks: report.passedChecks,
      counts: report.counts,
    }),
  );
  if (failure) process.exitCode = 1;
}
