// Signed-out browsers and explicit native IPC fixtures only. No real account,
// native window, filesystem Git operation, or provider authorization is used.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const root = new URL('../', import.meta.url);
const output = new URL('artifacts/startup/', root);
await mkdir(output, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const report = {
  testedAt: new Date().toISOString(),
  baseURL,
  boundary:
    'Signed-out browser and mocked native lifecycle only. Auth restoration is deferred in an explicit fixture; no real account, native window, credentials, provider requests, or Git mutations.',
  checks: [],
  errors: [],
  providerRequests: [],
  screenshots: [],
  geometry: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const run = promisify(execFile);
let ffmpeg = false;
try {
  await run('ffmpeg', ['-version']);
  ffmpeg = true;
} catch {
  /* Video is optional when FFmpeg is unavailable. */
}
function monitor(page, surface) {
  page.on('pageerror', (error) => report.errors.push({ surface, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push({ surface, message: message.text() });
  });
  page.on('request', (request) => {
    if (
      /^https:\/\/(?:[^/]+\.)?(?:github\.com|githubusercontent\.com|gitlab\.com)(?:\/|$)/.test(
        request.url(),
      )
    )
      report.providerRequests.push(request.url());
  });
}
async function capture(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(name, output)), fullPage: true });
  report.screenshots.push(`artifacts/startup/${name}`);
}
async function fixture(page, deferredAuth = false) {
  await page.addInitScript(
    ({ deferredAuth }) => {
      let nextId = 0;
      const callbacks = new Map(),
        listeners = new Map(),
        waiting = [];
      const state = {
        calls: [],
        listeners,
        emit(event, payload) {
          for (const [id, listener] of listeners)
            if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload });
        },
        resolveAuth() {
          for (const resolve of waiting.splice(0)) resolve(status());
        },
      };
      const status = () => ({ configured: true, connected: false, account: null, scopes: [] });
      window.__GITSOMETHING_STARTUP_TEST__ = state;
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWebview: { label: 'main' }, currentWindow: { label: 'main' } },
        transformCallback(callback) {
          const id = ++nextId;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback(id) {
          callbacks.delete(id);
        },
        async invoke(command, args) {
          state.calls.push({ command, args });
          if (command === 'github_auth_status')
            return deferredAuth ? new Promise((resolve) => waiting.push(resolve)) : status();
          if (command === 'plugin:event|listen') {
            const id = ++nextId;
            listeners.set(id, args);
            return id;
          }
          if (command === 'plugin:event|unlisten') {
            listeners.delete(args.eventId);
            return;
          }
          throw new Error(`Unexpected startup fixture IPC: ${command}`);
        },
      };
    },
    { deferredAuth },
  );
}
async function start(page, surface) {
  monitor(page, surface);
  await page.goto(baseURL);
  await page.locator('.startup-screen').waitFor({ state: 'visible' });
}
async function homeReady(page) {
  await expect(page.locator('.startup-screen')).toHaveCount(0, { timeout: 4000 });
  await expect(page.locator('.startup-app')).not.toHaveAttribute('inert');
  await expect(page.locator('.startup-app')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.home-page')).toBeVisible();
}
const sampleLogo = async (logo) => {
  const samples = [];
  const started = performance.now();
  while (performance.now() - started < 1100) {
    const head = logo.querySelector('.logo-head > path').getBoundingClientRect();
    const prompt = logo.querySelector('.logo-prompt').getBoundingClientRect();
    const outerNode = logo.querySelector('.logo-fork-node').getBoundingClientRect();
    const innerNode = logo.querySelector('.logo-fork-node + circle').getBoundingClientRect();
    const group = logo.querySelector('.logo-head');
    const bounds = group.getBBox();
    const pivot = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.9);
    const actualPivot = pivot.matrixTransform(group.getScreenCTM());
    const restingPivot = pivot.matrixTransform(logo.getScreenCTM());
    samples.push({
      width: logo.getBoundingClientRect().width,
      headPivotDrift: Math.hypot(actualPivot.x - restingPivot.x, actualPivot.y - restingPivot.y),
      promptEscape: prompt.bottom - head.bottom,
      pulseDrift: Math.hypot(
        outerNode.x + outerNode.width / 2 - innerNode.x - innerNode.width / 2,
        outerNode.y + outerNode.height / 2 - innerNode.y - innerNode.height / 2,
      ),
      eyeScale: new DOMMatrix(getComputedStyle(logo.querySelector('.logo-prompt')).transform).d,
      nodeScale: new DOMMatrix(getComputedStyle(logo.querySelector('.logo-fork-node')).transform).a,
    });
    await new Promise(requestAnimationFrame);
  }
  return samples;
};

function summarizeLogo(samples) {
  const geometry = {
    width: samples.at(-1).width,
    maximumPromptEscape: Math.max(...samples.map((sample) => sample.promptEscape)),
    maximumNodeDrift: Math.max(...samples.map((sample) => sample.pulseDrift)),
    maximumHeadPivotDrift: Math.max(...samples.map((sample) => sample.headPivotDrift)),
    minimumEyeScale: Math.min(...samples.map((sample) => sample.eyeScale)),
    maximumNodeScale: Math.max(...samples.map((sample) => sample.nodeScale)),
  };
  assert.ok(geometry.minimumEyeScale < 0.4, 'The motion samples an actual blink.');
  assert.ok(geometry.maximumNodeScale > 1.15, 'The motion samples an actual pulse.');
  assert.ok(geometry.maximumPromptEscape < 1, 'The blinking prompt stays inside the cat face.');
  assert.ok(geometry.maximumNodeDrift < 1, 'The pulsing node stays centered on its inner node.');
  assert.ok(
    geometry.maximumHeadPivotDrift < 1,
    'The head keeps its neck anchor throughout rotation.',
  );
  return geometry;
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    ...(ffmpeg
      ? {
          recordVideo: {
            dir: fileURLToPath(new URL('capture/', output)),
            size: { width: 1440, height: 960 },
          },
        }
      : {}),
  });
  const page = await context.newPage();
  await fixture(page, true);
  await start(page, 'deferred-auth-desktop');
  const visibleAt = Date.now();
  const logoGeometry = page.locator('.startup-mascot .logo-mark').evaluate(sampleLogo);
  await expect(page.locator('.startup-screen')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('.startup-wordmark')).toContainText('GitSomething');
  await expect(page.locator('.startup-graph')).toBeVisible();
  await expect(page.locator('.startup-app')).toHaveAttribute('inert', '');
  await expect(page.locator('.startup-app')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.startup-skip')).toBeFocused();
  assert.equal(
    await page.evaluate(() => {
      document.querySelector('.home-open-repository').focus();
      return document.activeElement.matches('.startup-skip');
    }),
    true,
  );
  await page.keyboard.press('Tab');
  await expect(page.locator('.startup-skip')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.startup-skip')).toBeFocused();
  assert.ok(
    await page.evaluate(() =>
      window.__GITSOMETHING_STARTUP_TEST__.calls.some(
        (call) => call.command === 'github_auth_status',
      ),
    ),
  );
  check(
    'Startup keeps background controls inert and keyboard focus contained while account restoration starts underneath',
  );
  await page.waitForTimeout(250);
  await capture(page, 'desktop-startup.png');
  await homeReady(page);
  report.introVisibleMilliseconds = Date.now() - visibleAt;
  assert.ok(
    report.introVisibleMilliseconds <= 3500,
    'The intro finishes independently of the deferred auth response.',
  );
  await expect(page.locator('.home-open-repository')).toBeFocused();
  assert.equal(await page.locator('.startup-app .logo-mark[data-animating="true"]').count(), 0);
  await page.evaluate(() => window.__GITSOMETHING_STARTUP_TEST__.resolveAuth());
  await page.waitForTimeout(150);
  await capture(page, 'desktop-home.png');
  check(
    'One finite intro hands focus to Home without waiting for auth or replaying background logo entrances',
  );
  report.logoGeometry = [summarizeLogo(await logoGeometry)];
  check(
    'The blinking prompt stays in the face and the branch pulse remains centered throughout motion',
  );
  const video = page.video();
  await context.close();
  if (video) {
    await video.saveAs(fileURLToPath(new URL('startup-intro.webm', output)));
    await video.delete();
    report.video = 'artifacts/startup/startup-intro.webm';
  }

  const skipPage = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await start(skipPage, 'pointer-skip');
  await skipPage.getByRole('button', { name: 'Skip startup animation', exact: true }).click();
  await homeReady(skipPage);
  await expect(skipPage.locator('.home-open-repository')).toBeFocused();
  for (const [width, selector] of [
    [1440, '.home-intro .logo-mark'],
    [390, '.brand .logo-mark'],
  ]) {
    await skipPage.setViewportSize({ width, height: 960 });
    await skipPage.mouse.move(width - 10, 60);
    const mark = skipPage.locator(selector);
    const sample = mark.evaluate(sampleLogo);
    await mark.hover();
    report.logoGeometry.push(summarizeLogo(await sample));
  }
  await skipPage.setViewportSize({ width: 1440, height: 960 });
  check(
    'Prompt, branch pulse, and head anchors stay stable at startup, Home, and small titlebar sizes',
  );
  await skipPage.getByRole('button', { name: 'Try demo workspace', exact: true }).click();
  await skipPage.locator('.monaco-diff-editor').waitFor({ state: 'visible', timeout: 45_000 });
  await expect(skipPage.locator('.startup-screen')).toHaveCount(0);
  const transcript = await skipPage
    .locator('[aria-label="Git and GitHub operations"]')
    .textContent();
  assert.doesNotMatch(transcript, /startup|intro|skip animation/i);
  await skipPage.locator('.brand').click();
  await homeReady(skipPage);
  await skipPage.getByRole('button', { name: 'Continue workspace', exact: true }).click();
  await expect(skipPage.locator('.startup-screen')).toHaveCount(0);
  await skipPage.close();
  check(
    'Pointer Skip dismisses immediately; Home/workspace navigation never replays startup or adds Glass Box activity',
  );

  for (const key of ['Escape', 'Enter', 'Control+k', 'Control+o', 'Control+f', 'Control+`']) {
    const keyboard = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await fixture(keyboard);
    await start(keyboard, `keyboard-${key}`);
    await keyboard.keyboard.press(key);
    await homeReady(keyboard);
    assert.equal(
      await keyboard.locator('.command-dialog,.publish-dialog,.github-account-dialog').count(),
      0,
    );
    assert.equal(
      await keyboard.evaluate(() =>
        window.__GITSOMETHING_STARTUP_TEST__.calls.some((call) =>
          /dialog.*open|open_repository|publish|github_auth_start/.test(call.command),
        ),
      ),
      false,
    );
    await keyboard.close();
  }
  check(
    'Escape, Enter, and supported app shortcuts dismiss startup without opening hidden panels or running commands',
  );

  const reduced = await browser.newPage({
    reducedMotion: 'reduce',
    viewport: { width: 390, height: 844 },
  });
  monitor(reduced, 'reduced-before-mount');
  await reduced.goto(baseURL);
  await homeReady(reduced);
  assert.equal(await reduced.locator('.logo-mark[data-animating="true"]').count(), 0);
  await capture(reduced, 'reduced-home.png');
  await reduced.close();
  const runtimeReduced = await browser.newPage();
  await start(runtimeReduced, 'reduced-during-intro');
  await runtimeReduced.emulateMedia({ reducedMotion: 'reduce' });
  await homeReady(runtimeReduced);
  await runtimeReduced.emulateMedia({ reducedMotion: 'no-preference' });
  await runtimeReduced.waitForTimeout(250);
  await expect(runtimeReduced.locator('.startup-screen')).toHaveCount(0);
  await runtimeReduced.close();
  check(
    'Reduced motion bypasses startup before mount and dismisses an active intro without replaying when preference changes back',
  );

  const hidden = await browser.newPage();
  await start(hidden, 'visibility-fixture');
  await hidden.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await homeReady(hidden);
  await hidden.close();
  check('A simulated background visibility event dismisses startup and cleans up its animation');

  const drop = await browser.newPage();
  await fixture(drop);
  await start(drop, 'native-drop-fixture');
  await drop.waitForFunction(() =>
    [...window.__GITSOMETHING_STARTUP_TEST__.listeners.values()].some(
      (listener) => listener.event === 'tauri://drag-drop',
    ),
  );
  await drop.evaluate(() =>
    window.__GITSOMETHING_STARTUP_TEST__.emit('tauri://drag-drop', {
      paths: ['C:/fixtures/startup-project'],
      position: { x: 200, y: 200 },
    }),
  );
  await expect(drop.locator('.startup-screen')).toHaveCount(0);
  await expect(drop.locator('.publish-dialog')).toBeVisible();
  await expect(drop.getByLabel('Repository name', { exact: true })).toHaveValue('startup-project');
  assert.equal(
    await drop.evaluate(() => Boolean(document.activeElement.closest('.publish-dialog'))),
    true,
  );
  assert.equal(
    await drop.evaluate(() =>
      window.__GITSOMETHING_STARTUP_TEST__.calls.some((call) =>
        /publish|open_repository|github_auth_start/.test(call.command),
      ),
    ),
    false,
  );
  await drop.close();
  check(
    'A mocked native folder drop dismisses startup and preserves the publishing dialog focus without running Git',
  );

  for (const [width, height] of [
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const mobile = await browser.newPage({ viewport: { width, height } });
    await start(mobile, `viewport-${width}x${height}`);
    const geometry = await mobile.evaluate(() => {
      const box = (selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        wordmark: box('.startup-wordmark'),
        graph: box('.startup-graph'),
        skip: box('.startup-skip'),
      };
    });
    for (const box of [geometry.wordmark, geometry.graph, geometry.skip]) {
      assert.ok(
        box.left >= -1 && box.right <= width + 1 && box.top >= -1 && box.bottom <= height + 1,
        `${width}x${height} startup controls fit the viewport.`,
      );
    }
    assert.ok(geometry.documentWidth <= width + 1);
    report.geometry.push(geometry);
    await mobile.waitForTimeout(300);
    await capture(mobile, `startup-${width}x${height}.png`);
    await mobile.locator('.startup-skip').click();
    await homeReady(mobile);
    await mobile.close();
  }
  check('Startup composition and Skip remain usable at 390px, 320px, and short landscape sizes');

  if (report.video && ffmpeg) {
    const times = [0.15, 0.45, 0.85, 1.2, 1.55, 1.9];
    const images = [];
    for (const [index, time] of times.entries()) {
      const imagePath = fileURLToPath(new URL(`frame-${index}.png`, output));
      await run('ffmpeg', [
        '-loglevel',
        'error',
        '-y',
        '-ss',
        String(time),
        '-i',
        fileURLToPath(new URL('startup-intro.webm', output)),
        '-frames:v',
        '1',
        imagePath,
      ]);
      images.push(await readFile(imagePath));
    }
    const strip = await browser.newPage({ viewport: { width: 1260, height: 650 } });
    await strip.setContent(
      `<style>body{margin:0;padding:15px;background:#0d1117;color:#9198a1;font:13px system-ui}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{padding:7px}</style><main>${images.map((image, index) => `<figure><img src="data:image/png;base64,${image.toString('base64')}" alt="Recorded startup frame"><figcaption>Video ${times[index]}s</figcaption></figure>`).join('')}</main>`,
    );
    await capture(strip, 'startup-contact-strip.png');
    await strip.close();
    check('Actual recorded startup frames provide a motion contact strip and WebM preview');
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.providerRequests, []);
  check('All startup checks finish with zero browser errors and zero provider requests');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL('artifacts/startup-report.json', root),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
