import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { enterDemoWorkspace } from './workspace-fixture.mjs';
import { confirmSlide } from './slide-fixture.mjs';

// Production frontend contracts only. Native operations below are explicit IPC
// fixtures; this suite never creates a repository, pushes commits, or signs in.
const baseURL = process.env.BRANCHLINE_TEST_URL || 'http://127.0.0.1:1431';
const artifacts = new URL('../artifacts/', import.meta.url);
const screenshots = new URL('push-slider/', artifacts);
await mkdir(screenshots, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}),
});
const report = {
  baseURL,
  testedAt: new Date().toISOString(),
  browser: await browser.version(),
  scope: 'Slider interaction, demo Git behavior, and mocked native push/publish IPC contracts',
  checks: [],
  screenshots: [],
  geometry: [],
  errors: [],
  providerRequests: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const slider = (page, name = 'Slide to push') => page.getByRole('slider', { name, exact: true });
const publishSlider = (page) => slider(page, 'Slide to create & push');
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
async function pageFor(surface, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    ...options,
  });
  monitor(page, surface);
  return page;
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL(name, screenshots)), fullPage: true });
  report.screenshots.push(`artifacts/push-slider/${name}`);
}
async function assertToastClear(page, surface, control) {
  const toast = page.locator('.toast[role="status"]');
  await expect(toast).toHaveCSS('opacity', '1');
  const notification = await toast.boundingBox();
  const track = await control.locator('xpath=..').boundingBox();
  assert.ok(notification && track, `${surface}: settled toast and slider must render`);
  const overlaps =
    notification.x < track.x + track.width &&
    notification.x + notification.width > track.x &&
    notification.y < track.y + track.height &&
    notification.y + notification.height > track.y;
  report.geometry.push({ surface, notification, track, overlaps });
  assert.equal(overlaps, false, `${surface}: results must not obscure the push confirmation`);
}
async function revealPublishFooter(page, surface) {
  const confirmation = page.locator('.publish-confirmation');
  await confirmation.evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await expect
    .poll(async () =>
      confirmation.evaluate((element) => {
        const wrapper = element.getBoundingClientRect();
        const dialog = element.closest('.publish-dialog').getBoundingClientRect();
        return wrapper.top >= dialog.top - 1 && wrapper.bottom <= dialog.bottom + 1;
      }),
    )
    .toBe(true);
  const result = await confirmation.evaluate((element) => {
    const rectangle = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    };
    return {
      confirmation: rectangle(element),
      dialog: rectangle(element.closest('.publish-dialog')),
    };
  });
  report.geometry.push({ surface, ...result });
}
async function geometry(page, surface, control) {
  const result = await control.evaluate((thumb) => {
    const track = thumb.closest('.slide-confirm');
    const box = track.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      x: box.x,
      y: box.y,
      right: box.right,
      bottom: box.bottom,
      trackWidth: box.width,
      trackHeight: box.height,
    };
  });
  report.geometry.push({ surface, ...result });
  assert.ok(result.scrollWidth <= result.width + 1, `${surface}: no horizontal document overflow`);
  assert.ok(result.x >= -1 && result.right <= result.width + 1, `${surface}: slider fits viewport`);
  assert.ok(
    result.y >= 0 && result.bottom <= result.height + 1,
    `${surface}: slider remains visible`,
  );
  assert.ok(
    result.trackWidth >= 140 && result.trackHeight >= 36,
    `${surface}: usable slider dimensions`,
  );
}
async function drag(page, control, fraction = 1, { release = true } = {}) {
  await control.scrollIntoViewIfNeeded();
  const track = await control.locator('xpath=..').boundingBox();
  const thumb = await control.boundingBox();
  assert.ok(track && thumb, 'Slider track and thumb must have geometry');
  const distance = await control.evaluate(
    (element) => element.parentElement.clientWidth - element.offsetWidth - 8,
  );
  const start = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
  const end = {
    x: start.x + distance * fraction,
    y: start.y,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 14 });
  if (release) await page.mouse.up();
  return { start, end };
}
async function touchDrag(page, control) {
  await control.scrollIntoViewIfNeeded();
  const track = await control.locator('xpath=..').boundingBox();
  const thumb = await control.boundingBox();
  assert.ok(track && thumb);
  const distance = await control.evaluate(
    (element) => element.parentElement.clientWidth - element.offsetWidth - 8,
  );
  const session = await page.context().newCDPSession(page);
  const x = thumb.x + thumb.width / 2;
  const y = thumb.y + thumb.height / 2;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 0 }],
  });
  for (let step = 1; step <= 12; step++)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (distance * step) / 12, y, id: 0 }],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
async function openPublish(page) {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('What would you like to do?').fill('Create');
  await page.keyboard.press('Enter');
  await expect(page.locator('.publish-dialog')).toBeVisible();
}
async function installNativeFixture(page, connected = true) {
  await page.addInitScript(
    ({ connected }) => {
      const callbacks = new Map();
      const listeners = new Map();
      let id = 0;
      const state = {
        connected,
        path: 'C:\\slider-fixture\\orbit',
        branch: 'main',
        pushMode: 'success',
        publishMode: 'success',
        pushes: [],
        publishes: [],
        calls: [],
      };
      window.__PUSH_SLIDER_FIXTURE__ = state;
      const status = () => ({
        configured: true,
        connected: state.connected,
        account: state.connected
          ? {
              login: 'slider-fixture',
              name: 'Slider Fixture',
              email: 'fixture@example.invalid',
              avatarUrl: '',
            }
          : null,
        scopes: state.connected ? ['repo', 'workflow', 'read:user', 'user:email'] : [],
      });
      const emit = (event, payload) => {
        for (const [listenerId, listener] of listeners)
          if (listener.event === event)
            callbacks.get(listener.handler)?.({ event, id: listenerId, payload });
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
          state.calls.push(command);
          if (command === 'github_auth_status') return status();
          if (command === 'github_auth_disconnect') {
            state.connected = false;
            return status();
          }
          if (command === 'plugin:event|listen') {
            const listenerId = ++id;
            listeners.set(listenerId, args);
            return listenerId;
          }
          if (command === 'plugin:event|unlisten') {
            listeners.delete(args.eventId);
            return;
          }
          if (command === 'plugin:dialog|open') return state.path;
          if (command === 'open_repository')
            return {
              path: state.path,
              name: state.path.split('\\').at(-1),
              branch: state.branch,
              files: [],
              guardian: null,
              commits: [
                {
                  id: 'abc123abc123',
                  summary: 'Slider fixture checkpoint',
                  author: 'Fixture',
                  timestamp: 1700000000,
                  parents: [],
                },
              ],
              branches: [{ name: state.branch, target: 'abc123abc123', current: true }],
            };
          if (command === 'push_repository') {
            state.pushes.push(args);
            if (state.pushMode === 'hold')
              await new Promise((resolve, reject) => {
                state.resolvePush = resolve;
                state.rejectPush = reject;
              });
            if (state.pushMode === 'error')
              throw new Error('Fixture push rejected. Fetch before trying again.');
            emit('git:log', {
              id: `push-${state.pushes.length}`,
              operationId: `push-operation-${state.pushes.length}`,
              timestamp: Date.now(),
              status: 'success',
              tokens: [
                { text: 'git', explanation: 'Git' },
                { text: 'push', explanation: 'Upload saved commits' },
                { text: 'origin', explanation: 'Remote repository' },
              ],
            });
            return;
          }
          if (command === 'publish_repository') {
            const request = args.request;
            state.publishes.push({ ...request });
            if (state.publishMode === 'hold')
              await new Promise((resolve, reject) => {
                state.resolvePublish = resolve;
                state.rejectPublish = reject;
              });
            if (state.publishMode === 'error')
              throw new Error('Fixture cloud creation failed. Please retry.');
            for (const step of ['validate', 'init', 'commit', 'remote', 'push'])
              emit('publish:progress', {
                operationId: request.operationId,
                step,
                status: 'success',
              });
            return {
              path: request.path,
              url: `https://github.com/slider-fixture/${request.name}`,
              branch: 'main',
            };
          }
          throw new Error(`Unexpected push slider fixture IPC: ${command}`);
        },
      };
    },
    { connected },
  );
}
const pushCount = (page) => page.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.pushes.length);
const publishCount = (page) => page.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.publishes.length);
async function nativeWorkspace(page) {
  await page.goto(baseURL);
  await page.locator('.home-page .add-repository').click();
  await expect(slider(page)).toBeVisible();
}

try {
  const demo = await pageFor('demo-desktop');
  await demo.goto(baseURL);
  await enterDemoWorkspace(demo);
  const demoPushes = () => demo.locator('.glass-command-line').filter({ hasText: 'push' }).count();
  const initialDemoPushes = await demoPushes();
  const demoSlider = slider(demo);
  await expect(demoSlider).toHaveAttribute('aria-valuemin', '0');
  await expect(demoSlider).toHaveAttribute('aria-valuemax', '100');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  await geometry(demo, '1440px-workspace', demoSlider);
  await capture(demo, '1440-workspace.png');
  check(
    'Workspace push is an accessible, clearly labeled confirmation slider inside the desktop toolbar',
  );

  await demoSlider.click();
  await demoSlider.locator('xpath=..').click({ position: { x: 90, y: 12 } });
  await demoSlider.press('Enter');
  await demoSlider.press('Space');
  await drag(demo, demoSlider, 0.55);
  await drag(demo, demoSlider, 0.94);
  assert.equal(await demoPushes(), initialDemoPushes);
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  check('Click, tap, unarmed Enter/Space, and incomplete pointer release cannot push');

  await demoSlider.press('End');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '100');
  assert.equal(await demoPushes(), initialDemoPushes);
  await demoSlider.press('Escape');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  await demoSlider.press('ArrowRight');
  assert.ok(Number(await demoSlider.getAttribute('aria-valuenow')) > 0);
  await demoSlider.press('Home');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  check(
    'Keyboard movement only arms the slider; Home and Escape reset confirmation without running Git',
  );

  await drag(demo, demoSlider, 1, { release: false });
  assert.equal(await demoPushes(), initialDemoPushes);
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '100');
  await demoSlider.dispatchEvent('pointercancel', {
    pointerId: 1,
    pointerType: 'mouse',
    bubbles: true,
  });
  await demo.mouse.up();
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  assert.equal(await demoPushes(), initialDemoPushes);
  check(
    'Reaching the end does not push before release, and pointer cancellation discards an armed drag',
  );

  const aborted = await drag(demo, demoSlider, 1, { release: false });
  await demo.mouse.move(aborted.end.x, aborted.end.y + 180);
  await demo.mouse.up();
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  assert.equal(await demoPushes(), initialDemoPushes);
  check('Releasing a completed drag outside the confirmation area cancels the push');

  await drag(demo, demoSlider, 1, { release: false });
  await demo.setViewportSize({ width: 390, height: 844 });
  await demo.mouse.up();
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  assert.equal(await demoPushes(), initialDemoPushes);
  await demo.setViewportSize({ width: 1440, height: 1000 });
  check('Resizing the track during a drag invalidates confirmation before pointer release');

  await drag(demo, demoSlider);
  await expect.poll(demoPushes).toBe(initialDemoPushes + 1);
  await expect(demo.locator('.toast[role="status"]')).toContainText('Demo push complete');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  await assertToastClear(demo, '1440px-push-result', demoSlider);
  check(
    'A full deliberate drag and release runs exactly one demo Git push and records its equivalent command',
  );
  await demoSlider.focus();
  for (let step = 0; step < 10; step++) await demoSlider.press('ArrowRight');
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '100');
  await demoSlider.press('Space');
  await expect.poll(demoPushes).toBe(initialDemoPushes + 2);
  await demoSlider.press('Enter');
  assert.equal(await demoPushes(), initialDemoPushes + 2);
  check(
    'Ten arrow steps and Space confirm once, then reset so a repeated key cannot trigger another push',
  );
  await demoSlider.press('End');
  await demo.getByRole('button', { name: 'Back to home', exact: true }).click();
  await demo.getByRole('button', { name: 'Continue workspace', exact: true }).click();
  await expect(demoSlider).toHaveAttribute('aria-valuenow', '0');
  check('Leaving and returning to the workspace discards any previously armed push');

  for (const width of [390, 320]) {
    const mobile = await pageFor(`touch-${width}`, {
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await mobile.goto(baseURL);
    await enterDemoWorkspace(mobile);
    const control = slider(mobile);
    await geometry(mobile, `${width}px-workspace`, control);
    const baseline = await mobile
      .locator('.glass-command-line')
      .filter({ hasText: 'push' })
      .count();
    const thumb = await control.boundingBox();
    await mobile.touchscreen.tap(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    assert.equal(
      await mobile.locator('.glass-command-line').filter({ hasText: 'push' }).count(),
      baseline,
    );
    await touchDrag(mobile, control);
    await expect(mobile.locator('.toast[role="status"]')).toContainText('Demo push complete');
    await expect(mobile.locator('.glass-command-line').filter({ hasText: 'push' })).toHaveCount(
      baseline + 1,
    );
    await assertToastClear(mobile, `${width}px-push-result`, control);
    await capture(mobile, `${width}-workspace.png`);
    check(
      `${width}px touch layout fits the slider; a tap is harmless and a full touch slide confirms one demo push`,
    );
    await mobile.close();
  }

  const native = await pageFor('native-contract');
  await installNativeFixture(native);
  await nativeWorkspace(native);
  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.pushMode = 'hold';
  });
  await confirmSlide(native, 'Slide to push');
  await expect.poll(() => pushCount(native)).toBe(1);
  await expect(slider(native)).toHaveAttribute('aria-disabled', 'true');
  await slider(native).press('End');
  await slider(native).press('Enter');
  await slider(native).press('Space');
  assert.equal(await pushCount(native), 1);
  await native.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.resolvePush());
  await expect(slider(native)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(native.locator('.toast[role="status"]')).toContainText('Push complete.');
  assert.deepEqual(await native.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.pushes), [
    { path: 'C:\\slider-fixture\\orbit' },
  ]);
  check(
    'Native push dispatches the existing IPC path once and blocks repeated confirmation while it is pending',
  );

  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.pushMode = 'error';
  });
  await confirmSlide(native, 'Slide to push');
  await expect(native.locator('.toast[role="status"]')).toContainText('Fixture push rejected');
  await expect(slider(native)).toHaveAttribute('aria-valuenow', '0');
  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.pushMode = 'success';
  });
  await confirmSlide(native, 'Slide to push');
  await expect.poll(() => pushCount(native)).toBe(3);
  await expect(native.locator('.toast[role="status"]')).toContainText('Push complete.');
  check(
    'A failed push explains the error and requires a fresh confirmation before a successful retry',
  );

  await slider(native).press('End');
  await native.getByRole('button', { name: 'Back to home', exact: true }).click();
  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.path = 'C:\\slider-fixture\\other';
  });
  await native.locator('.home-page .add-repository').click();
  await expect(slider(native)).toHaveAttribute('aria-valuenow', '0');
  await slider(native).press('Enter');
  assert.equal(await pushCount(native), 3);
  check(
    'Opening another repository invalidates a ready push rather than carrying confirmation into a new context',
  );

  await openPublish(native);
  await expect(native.getByText('Signed in as @slider-fixture', { exact: true })).toBeVisible();
  await native.getByLabel('Repository name', { exact: true }).fill('orbit');
  await confirmSlide(native);
  await expect(
    native.getByText('Choose the folder you want to publish.', { exact: true }),
  ).toBeVisible();
  assert.equal(await publishCount(native), 0);
  await native
    .getByRole('button', { name: 'Drop a folder here, or choose one', exact: false })
    .click();
  await native.getByLabel('Repository name', { exact: true }).fill('');
  await confirmSlide(native);
  assert.equal(await publishCount(native), 0);
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await native.getByLabel('Repository name', { exact: true }).fill('orbit');
  await native.getByLabel('Repository name', { exact: true }).press('Enter');
  assert.equal(await publishCount(native), 0);
  check(
    'Final publishing still validates the folder and required name, and Enter in the form cannot bypass sliding',
  );

  await publishSlider(native).press('End');
  await native.getByLabel('Repository name', { exact: true }).fill('orbit-updated');
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await publishSlider(native).press('End');
  await native.getByRole('button', { name: 'Public', exact: true }).click();
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await publishSlider(native).press('End');
  await native.getByRole('combobox', { name: 'Git provider' }).selectOption('gitlab');
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await native.getByRole('combobox', { name: 'Git provider' }).selectOption('github');
  check('Changing repository name, visibility, or provider resets the final publish confirmation');

  await publishSlider(native).press('End');
  await native.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  await openPublish(native);
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await revealPublishFooter(native, '1440px-publish-footer');
  await geometry(native, '1440px-publish', publishSlider(native));
  await capture(native, '1440-publish.png');
  check(
    'Closing and reopening publishing discards ready state and presents the full final confirmation clearly',
  );

  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.publishMode = 'hold';
  });
  await confirmSlide(native);
  await expect.poll(() => publishCount(native)).toBe(1);
  await expect(publishSlider(native)).toHaveCount(0);
  await native.keyboard.press('Enter');
  assert.equal(await publishCount(native), 1);
  await native.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.resolvePublish());
  await expect(native.getByRole('button', { name: 'Open repository', exact: true })).toBeVisible();
  const request = await native.evaluate(() => window.__PUSH_SLIDER_FIXTURE__.publishes[0]);
  assert.equal(request.path, 'C:\\slider-fixture\\other');
  assert.equal(request.name, 'orbit-updated');
  assert.equal(request.provider, 'github');
  assert.equal(request.private, false);
  assert.equal(request.token, '');
  assert.equal(request.authorName, 'Slider Fixture');
  assert.equal(request.authorEmail, 'fixture@example.invalid');
  check(
    'A final confirmation invokes publishing once, preserves selected metadata, and sends no GitHub credential through IPC',
  );

  await native.getByRole('button', { name: 'Close publishing dialog', exact: true }).click();
  await openPublish(native);
  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.publishMode = 'error';
  });
  await confirmSlide(native);
  await expect(native.getByRole('alert')).toContainText('Fixture cloud creation failed');
  await native.getByRole('button', { name: 'Back to setup', exact: true }).click();
  await expect(publishSlider(native)).toHaveAttribute('aria-valuenow', '0');
  await native.evaluate(() => {
    window.__PUSH_SLIDER_FIXTURE__.publishMode = 'success';
  });
  await confirmSlide(native);
  await expect(native.getByRole('button', { name: 'Open repository', exact: true })).toBeVisible();
  assert.equal(await publishCount(native), 3);
  check(
    'Publishing errors return to an unarmed setup and retry requires another deliberate confirmation',
  );

  for (const width of [390, 320]) {
    const mobile = await pageFor(`publish-${width}`, {
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    await installNativeFixture(mobile);
    await mobile.goto(baseURL);
    await mobile.getByRole('button', { name: 'Publish a local folder', exact: true }).click();
    await mobile
      .getByRole('button', { name: 'Drop a folder here, or choose one', exact: false })
      .click();
    await revealPublishFooter(mobile, `${width}px-publish-footer`);
    await geometry(mobile, `${width}px-publish`, publishSlider(mobile));
    await capture(mobile, `${width}-publish.png`);
    await touchDrag(mobile, publishSlider(mobile));
    await expect(
      mobile.getByRole('button', { name: 'Open repository', exact: true }),
    ).toBeVisible();
    assert.equal(await publishCount(mobile), 1);
    check(
      `${width}px final publishing fits its dialog and confirms safely with a deliberate touch slide`,
    );
    await mobile.close();
  }

  const disconnected = await pageFor('disconnected-contract');
  await installNativeFixture(disconnected, false);
  await disconnected.goto(baseURL);
  await disconnected.getByRole('button', { name: 'Publish a local folder', exact: true }).click();
  await expect(publishSlider(disconnected)).toHaveAttribute('aria-disabled', 'true');
  await publishSlider(disconnected).press('End');
  await publishSlider(disconnected).press('Enter');
  assert.equal(await publishCount(disconnected), 0);
  check('The final GitHub slider remains disabled until the user signs in');

  assert.equal(
    report.providerRequests.length,
    0,
    `Unexpected provider requests: ${report.providerRequests.join(', ')}`,
  );
  assert.equal(report.errors.length, 0, `Browser errors: ${JSON.stringify(report.errors)}`);
  check(
    'All confirmation interactions produce no browser errors and make no real provider requests',
  );
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(
    new URL('push-slider-report.json', artifacts),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser.close();
}
