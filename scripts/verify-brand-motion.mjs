// Signed-out browser and offline vector fixtures only. Never attaches to the
// connected native app or records real account/repository metadata.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const baseURL =
  process.env.GITSOMETHING_BRAND_TEST_URL ||
  process.env.BRANCHLINE_TEST_URL ||
  'http://127.0.0.1:1420';
const root = new URL('../', import.meta.url);
const output = new URL('artifacts/brand-motion/', root);
await mkdir(output, { recursive: true });
const shapes = JSON.parse(await readFile(new URL('src/components/brand/logo-shapes.json', root)));
const browser = await chromium.launch({
  headless: true,
  ...(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
    ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }
    : {}),
});
const report = {
  testedAt: new Date().toISOString(),
  baseURL,
  boundary:
    'Signed-out browser app and offline standalone SVG/HTML fixtures. No native IPC, accounts, credentials, provider traffic, or Git mutations.',
  checks: [],
  errors: [],
  providerRequests: [],
  screenshots: [],
};
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
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
async function state(mark) {
  return mark.evaluate((el) => {
    const matrix = (selector) =>
      new DOMMatrix(getComputedStyle(el.querySelector(selector)).transform);
    const head = matrix('.logo-head'),
      eye = matrix('.logo-prompt'),
      node = matrix('.logo-fork-node');
    return {
      animating: el.dataset.animating === 'true',
      angle: (Math.atan2(head.b, head.a) * 180) / Math.PI,
      eye: eye.d,
      node: node.a,
      trace: Number(getComputedStyle(el.querySelector('.logo-trace')).opacity),
    };
  });
}
function assertRest(value) {
  assert.equal(value.animating, false);
  assert.ok(Math.abs(value.angle) < 0.01, 'Head returns to its exact resting angle.');
  assert.ok(Math.abs(value.eye - 1) < 0.001, 'Prompt returns to its unscaled geometry.');
  assert.ok(Math.abs(value.node - 1) < 0.001, 'Branch node returns to its exact scale.');
  assert.ok(value.trace < 0.001, 'Traveling trace disappears at rest.');
}
async function capture(page, name, locator) {
  await page.evaluate(() => document.fonts.ready);
  const path = fileURLToPath(new URL(name, output));
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  report.screenshots.push(`artifacts/brand-motion/${name}`);
}
async function uniqueIDs(page) {
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
  assert.deepEqual(duplicates, [], 'Every SVG title/reference ID is unique within the page.');
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  monitor(page, 'signed-out-app');
  await page.goto(baseURL);
  await page.locator('.home-page').waitFor();
  const mark = page.locator('.brand .logo-mark');
  await expect(mark).toHaveAttribute('data-brand', 'gitsomething');
  await page.waitForTimeout(1300);
  assertRest(await state(mark));
  assert.deepEqual(
    (
      await mark
        .locator('path')
        .evaluateAll((elements) => elements.map((el) => el.getAttribute('d')))
    ).sort(),
    Object.values(shapes).sort(),
  );
  check('Finite app intro returns to exact static artwork and resting geometry');

  await page.mouse.move(700, 60);
  const samplesPromise = mark.evaluate(async (el) => {
    const start = performance.now(),
      samples = [];
    while (performance.now() - start < 1450) {
      const head = new DOMMatrix(getComputedStyle(el.querySelector('.logo-head')).transform);
      const eye = new DOMMatrix(getComputedStyle(el.querySelector('.logo-prompt')).transform);
      samples.push({
        time: performance.now() - start,
        angle: (Math.atan2(head.b, head.a) * 180) / Math.PI,
        eye: eye.d,
        trace: Number(getComputedStyle(el.querySelector('.logo-trace')).opacity),
        animating: el.dataset.animating === 'true',
      });
      await new Promise(requestAnimationFrame);
    }
    return samples;
  });
  await mark.hover();
  for (let index = 0; index < 7; index += 1) {
    await page.waitForTimeout(40);
    await mark.dispatchEvent('pointerover', { pointerType: 'mouse' });
  }
  const samples = await samplesPromise;
  const minimumAngle = Math.min(...samples.map((value) => value.angle));
  const minimumEye = Math.min(...samples.map((value) => value.eye));
  assert.ok(minimumAngle < -5 && minimumAngle >= -6.5);
  assert.ok(minimumEye < 0.35 && minimumEye >= 0.1);
  assert.ok(Math.max(...samples.map((value) => value.trace)) > 0.5);
  assert.ok(
    samples.filter((value) => value.time >= 1200).every((value) => !value.animating),
    'Repeated hover does not queue or restart overlapping sequences.',
  );
  assertRest(await state(mark));
  report.motion = { minimumAngle, minimumEye, sampleCount: samples.length };
  check(
    'Hover produces a brief blink, bounded head rotation, and commit trace without overlapping replays',
  );

  await page.mouse.move(700, 60);
  await mark.hover();
  await page.waitForTimeout(170);
  assert.equal((await state(mark)).animating, true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  assertRest(await state(mark));
  await page.mouse.move(700, 60);
  await mark.hover();
  assertRest(await state(mark));
  check(
    'Enabling reduced motion during animation cancels immediately to rest and prevents hover replay',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(1250);

  await page.getByRole('button', { name: 'Open getting started guide', exact: true }).click();
  await page.locator('.onboarding-dialog').waitFor();
  assert.ok((await page.locator('.logo-mark').count()) >= 3);
  await uniqueIDs(page);
  await page.getByRole('button', { name: 'Close getting started guide', exact: true }).click();
  await page.locator('.onboarding-dialog').waitFor({ state: 'hidden' });
  check('Home, titlebar, and guide logo instances coexist without duplicate accessibility IDs');

  await page.locator('.home-intro .logo-mark').hover();
  await page.getByRole('button', { name: 'Try demo workspace', exact: true }).click();
  await page.locator('.monaco-diff-editor').waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('.home-intro .logo-mark').count(), 0);
  assertRest(await state(mark));
  await page.locator('.brand').click();
  await page.locator('.home-page').waitFor();
  await page.waitForTimeout(1300);
  check(
    'Navigating during logo motion cleans up unmounted instances and keeps the workspace usable',
  );

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const geometry = await page.evaluate(() => {
      const marks = [...document.querySelectorAll('.logo-mark')].map((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      });
      return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, marks };
    });
    assert.ok(geometry.documentWidth <= width + 1);
    assert.ok(
      geometry.marks.every(
        (box) => box.width >= 24 && box.height >= 24 && box.left >= -1 && box.right <= width + 1,
      ),
    );
    await capture(page, `app-${width}.png`);
  }
  check('Animated branding fits Home and titlebar at 1440px, 390px, and 320px without overflow');

  const reduced = await browser.newPage({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 960 },
  });
  monitor(reduced, 'reduced-before-mount');
  await reduced.goto(baseURL);
  await reduced.locator('.home-page').waitFor();
  await reduced.waitForTimeout(350);
  for (const logo of await reduced.locator('.logo-mark').all()) assertRest(await state(logo));
  await reduced.locator('.brand .logo-mark').hover();
  assertRest(await state(reduced.locator('.brand .logo-mark')));
  await reduced.close();
  check('System reduced motion set before mount displays static artwork throughout');

  const offline = await browser.newContext({
    offline: true,
    viewport: { width: 1200, height: 1000 },
  });
  const preview = await offline.newPage();
  monitor(preview, 'offline-preview');
  await preview.goto(new URL('public/brand/gitsomething-logo-preview.html', root).href);
  await expect(preview.locator('#motion-status')).toHaveText('Ready to replay', { timeout: 5000 });
  await uniqueIDs(preview);
  await preview.locator('#speed').selectOption('2');
  await expect(preview.locator('#motion-status')).toHaveText('Playing');
  await preview.locator('#pause').click();
  await expect(preview.locator('#pause')).toHaveAttribute('aria-pressed', 'true');
  const paused = await preview
    .locator('.main-logo')
    .evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .map((animation) => ({ state: animation.playState, time: animation.currentTime })),
    );
  assert.ok(paused.length >= 3 && paused.every((animation) => animation.state === 'paused'));
  await preview.waitForTimeout(150);
  const pausedAgain = await preview
    .locator('.main-logo')
    .evaluate((el) =>
      el.getAnimations({ subtree: true }).map((animation) => animation.currentTime),
    );
  assert.ok(paused.every((animation, index) => Math.abs(animation.time - pausedAgain[index]) < 1));
  await preview.locator('#pause').click();
  await expect(preview.locator('#pause')).toHaveAttribute('aria-pressed', 'false');
  await preview.locator('#theme').click();
  await expect(preview.locator('body')).toHaveClass('light');
  await expect(preview.locator('#theme')).toHaveText('Dark background');
  await preview.locator('#reduce').check();
  await expect(preview.locator('#motion-status')).toHaveText('Static preview');
  assert.equal(
    await preview
      .locator('.main-logo')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  await preview.locator('#replay').click();
  await expect(preview.locator('#motion-status')).toHaveText('Static preview');
  await preview.locator('#theme').click();
  await capture(preview, 'offline-preview.png');
  check('Offline preview replay, speed, pause/resume, light background, and static controls work');

  const sizes = await preview
    .locator('.sizes svg')
    .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128]);
  await capture(preview, 'size-ladder.png', preview.locator('.sizes'));
  await preview.emulateMedia({ reducedMotion: 'reduce' });
  await preview.locator('#reduce').uncheck();
  await preview.locator('#replay').click();
  await expect(preview.locator('#motion-status')).toHaveText('Static preview');
  check('Offline size ladder uses actual pixel sizes and system reduced motion overrides replay');
  await offline.close();

  const animated = await readFile(
    new URL('public/brand/gitsomething-mark-animated.svg', root),
    'utf8',
  );
  const strip = await browser.newPage({ viewport: { width: 1200, height: 260 } });
  monitor(strip, 'standalone-contact-strip');
  const moments = [0, 150, 330, 400, 700, 1100];
  await strip.setContent(
    `<style>body{margin:0;padding:20px;background:#0d1117;color:#9198a1;font:13px system-ui}main{display:flex;gap:20px}figure{margin:0;text-align:center}svg{display:block;width:170px;height:170px}figcaption{margin-top:12px}</style><main>${moments.map((time, index) => `<figure data-time="${time}">${animated.replaceAll('brand-title', `contact-title-${index}`)}<figcaption>${time}ms</figcaption></figure>`).join('')}</main>`,
  );
  await strip.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    for (const figure of document.querySelectorAll('figure')) {
      for (const animation of figure.querySelector('svg').getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(figure.dataset.time);
      }
    }
    await new Promise(requestAnimationFrame);
  });
  await uniqueIDs(strip);
  await capture(strip, 'motion-contact-strip.png');
  check(
    'Standalone vector motion contact strip records finite poses without raster animation assets',
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.providerRequests, []);
  check('All brand checks finish with zero browser errors and zero provider traffic');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    new URL('artifacts/brand-motion-report.json', root),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
