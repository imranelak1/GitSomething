import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createWindowsExeFixture } from './fixtures/windows-exe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const temporaryParent = path.join(root, 'artifacts/releases');
const stagedName = `GitSomething_${version}_windows-x64.exe`;

async function withProject(productVersion, run) {
  await mkdir(temporaryParent, { recursive: true });
  const project = await mkdtemp(path.join(temporaryParent, 'version-regression-'));
  try {
    for (const name of [
      'package.json',
      'package-lock.json',
      'src-tauri/Cargo.toml',
      'src-tauri/Cargo.lock',
      'src-tauri/tauri.conf.json',
      'scripts/package-release.mjs',
      'scripts/inspect-windows-exe.mjs',
      `docs/releases/v${version}.md`,
    ]) {
      const destination = path.join(project, name);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(path.join(root, name), destination);
    }
    const executable = path.join(project, 'candidate.exe');
    const bytes = createWindowsExeFixture({ productVersion });
    await writeFile(executable, bytes);
    const output = path.join(project, 'artifacts/releases', `v${version}`);
    const invoke = (...args) =>
      spawnSync(process.execPath, ['scripts/package-release.mjs', '--exe', executable, ...args], {
        cwd: project,
        encoding: 'utf8',
        timeout: 15_000,
        windowsHide: true,
      });
    await run({ project, bytes, executable, output, invoke });
  } finally {
    // Remove only the newly allocated fixture below this repository's ignored build storage.
    if (
      path.dirname(project) !== temporaryParent ||
      !path.basename(project).startsWith('version-regression-')
    ) {
      throw new Error('Refusing to clean a fixture outside the owned test directory.');
    }
    await rm(project, { recursive: true });
  }
}

test('portable staging preserves matching prerelease bytes and records their embedded version', async () => {
  await withProject(version, async ({ bytes, output, invoke }) => {
    const result = invoke('--format', 'portable');
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.version, version);
    assert.equal(manifest.bundledApplication.productVersion, version);
    assert.deepEqual(manifest.publicAssets, [stagedName]);
    assert.equal(manifest.assets[0].sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(await readFile(path.join(output, stagedName)), bytes);
  });
});

test('portable dry-run rejects a stale prerelease without creating the release directory', async () => {
  const stale = version === '1.0.0-beta.3' ? '1.0.0-beta.2' : '1.0.0-beta.3';
  await withProject(stale, async ({ output, invoke }) => {
    const result = invoke('--format', 'portable', '--dry-run');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /embedded ProductVersion must match/);
    assert.ok(result.stderr.includes(version));
    assert.ok(result.stderr.includes(stale));
    assert.doesNotMatch(result.stdout, /Validated/);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  });
});

test('portable staging refuses an executable without ProductVersion before writing output', async () => {
  await withProject(undefined, async ({ output, invoke }) => {
    const result = invoke('--format', 'portable');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no ProductVersion/);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  });
});

test('default installer dry-run applies the same embedded application version check', async () => {
  await withProject('0.0.0-stale', async ({ project, output, invoke }) => {
    const installer = path.join(project, 'setup.exe');
    await writeFile(installer, createWindowsExeFixture({ x86: true }));
    const result = invoke('--installer', installer, '--dry-run');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /embedded ProductVersion must match/);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  });
});
