import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { inspectWindowsExe } from './inspect-windows-exe.mjs';
import { createWindowsExeFixture as fixture } from './fixtures/windows-exe.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'gitsomething-pe-audit-'));
const files = [];
after(async () => {
  await Promise.all(files.map((file) => unlink(file)));
  await rmdir(directory);
});

async function inspect(bytes) {
  const file = path.join(directory, `${files.length}.exe`);
  files.push(file);
  await writeFile(file, bytes);
  return inspectWindowsExe(file);
}

test('reads x64 normal and delay imports without loading the executable', async () => {
  const report = await inspect(fixture({ delayed: 'shell32.dll' }));
  assert.equal(report.architecture, 'x86_64');
  assert.equal(report.machine, 0x8664);
  assert.equal(report.bytes, 0x400);
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.imports, ['kernel32.dll']);
  assert.deepEqual(report.delayImports, ['shell32.dll']);
  assert.deepEqual(report.unsupportedImports, []);
});

test('flags VC runtime, Git, WebView2 loader and unknown DLL sidecars', async () => {
  for (const name of [
    'VCRUNTIME140.dll',
    'MSVCP140.dll',
    'libgit2.dll',
    'WebView2Loader.dll',
    'unknown.dll',
  ]) {
    assert.deepEqual((await inspect(fixture({ normal: name }))).unsupportedImports, [
      name.toLowerCase(),
    ]);
  }
});

test('flags unsupported delay imports even when normal imports are system-only', async () => {
  assert.deepEqual((await inspect(fixture({ delayed: 'libssh2.dll' }))).unsupportedImports, [
    'libssh2.dll',
  ]);
});

test('allows Windows API-set and extension-set contracts explicitly', async () => {
  for (const name of ['api-ms-win-crt-runtime-l1-1-0.dll', 'ext-ms-win-ntuser-window-l1-1-0.dll']) {
    const report = await inspect(fixture({ normal: name }));
    assert.deepEqual(report.unsupportedImports, []);
    assert.equal(report.dependencyClassification[0].classification, 'windows-api-set');
  }
});

test('supports legacy virtual-address delay descriptors in PE32', async () => {
  const report = await inspect(fixture({ delayed: 'user32.dll', legacyDelay: true, x86: true }));
  assert.equal(report.architecture, 'x86');
  assert.deepEqual(report.delayImports, ['user32.dll']);
});

test('rejects truncated and non-PE input with bounded errors', async () => {
  await assert.rejects(inspect(Buffer.alloc(12)), /DOS header/);
  await assert.rejects(inspect(Buffer.alloc(64)), /MZ signature/);
  const bytes = fixture();
  bytes.writeUInt32LE(0xfffffff0, 0x3c);
  await assert.rejects(inspect(bytes), /outside the file/);
});

test('rejects malformed optional headers and mismatched architecture', async () => {
  const short = fixture();
  short.writeUInt16LE(2, 0x94);
  await assert.rejects(inspect(short), /truncated optional header/);
  const mismatch = fixture();
  mismatch.writeUInt16LE(0x14c, 0x84);
  await assert.rejects(inspect(mismatch), /formats disagree/);
  const excessiveDirectories = fixture();
  excessiveDirectories.writeUInt32LE(17, 0x98 + 108);
  await assert.rejects(inspect(excessiveDirectories), /truncated data-directory table/);
});

test('rejects section bytes extending beyond the file', async () => {
  const bytes = fixture();
  bytes.writeUInt32LE(0x300, 0x188 + 16);
  await assert.rejects(inspect(bytes), /section raw data/);
});

test('rejects unmapped and zero-filled import RVAs', async () => {
  const unmapped = fixture();
  unmapped.writeUInt32LE(0x3000, 0x98 + 112 + 8);
  await assert.rejects(inspect(unmapped), /does not map to one section/);
  const unbacked = fixture();
  unbacked.writeUInt32LE(0x400, 0x188 + 8);
  unbacked.writeUInt32LE(0x1300, 0x98 + 112 + 8);
  await assert.rejects(inspect(unbacked), /not backed by file bytes/);
});

test('rejects descriptors without a terminator and invalid name pointers', async () => {
  const unterminated = fixture();
  unterminated.writeUInt32LE(20, 0x98 + 112 + 12);
  await assert.rejects(inspect(unterminated), /unterminated import descriptor/);
  const missing = fixture();
  missing.writeUInt32LE(1, 0x200);
  missing.writeUInt32LE(0, 0x200 + 12);
  await assert.rejects(inspect(missing), /missing import DLL name pointer/);
});

test('rejects DLL names without a bounded ASCII terminator', async () => {
  const bytes = fixture();
  bytes.fill(0x41, 0x280);
  await assert.rejects(inspect(bytes), /unterminated import DLL name/);
});

test('rejects DLL input and invalid delay attributes', async () => {
  const dll = fixture();
  dll.writeUInt16LE(0x2002, 0x96);
  await assert.rejects(inspect(dll), /not a DLL/);
  const delay = fixture({ delayed: 'kernel32.dll' });
  delay.writeUInt32LE(2, 0x240);
  await assert.rejects(inspect(delay), /delay-import attributes/);
});

test('reads exact textual prerelease and build metadata instead of numeric fixed version', async () => {
  for (const version of ['1.0.0-beta.3', '1.0.0-beta.4', '2.3.4-rc.1+build.7']) {
    assert.equal((await inspect(fixture({ productVersion: version }))).productVersion, version);
  }
});

test('returns null when version resource or ProductVersion is absent', async () => {
  assert.equal((await inspect(fixture())).productVersion, null);
  const bytes = fixture({ productVersion: '1.0.0-beta.4' });
  const key = bytes.indexOf(Buffer.from('ProductVersion\0', 'utf16le'));
  bytes.write('AnotherVersion\0', key, 'utf16le');
  assert.equal((await inspect(bytes)).productVersion, null);
});

test('accepts agreeing translations and NSIS empty containers with binary type', async () => {
  const bytes = fixture({ productVersions: ['1.0.0-beta.4', '1.0.0-beta.4'] });
  for (const key of ['StringFileInfo', '040904b0', '040a04b0']) {
    bytes.writeUInt16LE(0, bytes.indexOf(Buffer.from(`${key}\0`, 'utf16le')) - 2);
  }
  assert.equal((await inspect(bytes)).productVersion, '1.0.0-beta.4');
});

test('rejects conflicting ProductVersion translations', async () => {
  await assert.rejects(
    inspect(fixture({ productVersions: ['1.0.0-beta.3', '1.0.0-beta.4'] })),
    /conflicting ProductVersion/,
  );
});

test('rejects conflicting version resources across languages', async () => {
  const bytes = fixture({ productVersion: '1.0.0-beta.3' });
  const other = fixture({ productVersion: '1.0.0-beta.4' });
  bytes.writeUInt32LE(0x800, 0x98 + 112 + 2 * 8 + 4);
  bytes.writeUInt32LE(0x80000300, 0x42c);
  bytes.writeUInt16LE(2, 0x700 + 14);
  bytes.writeUInt32LE(0x409, 0x710);
  bytes.writeUInt32LE(0x320, 0x714);
  bytes.writeUInt32LE(0x411, 0x718);
  bytes.writeUInt32LE(0x330, 0x71c);
  bytes.copy(bytes, 0x720, 0x448, 0x458);
  bytes.writeUInt32LE(0x1600, 0x730);
  const length = other.readUInt16LE(0x460);
  bytes.writeUInt32LE(length, 0x734);
  other.copy(bytes, 0x800, 0x460, 0x460 + length);
  await assert.rejects(inspect(bytes), /conflicting ProductVersion/);
});

test('rejects cyclic and out-of-bounds resource directory entries', async () => {
  const cycle = fixture({ productVersion: '1.0.0-beta.4' });
  cycle.writeUInt32LE(0x80000000, 0x414);
  await assert.rejects(inspect(cycle), /cyclic resource/);
  const outside = fixture({ productVersion: '1.0.0-beta.4' });
  outside.writeUInt32LE(0x80000fff, 0x414);
  await assert.rejects(inspect(outside), /resource tree points outside/);
  const count = fixture({ productVersion: '1.0.0-beta.4' });
  count.writeUInt16LE(0xffff, 0x400 + 14);
  await assert.rejects(inspect(count), /resource tree points outside/);
});

test('rejects invalid resource data mapping and premature data leaves', async () => {
  const mapping = fixture({ productVersion: '1.0.0-beta.4' });
  mapping.writeUInt32LE(0x5000, 0x448);
  await assert.rejects(inspect(mapping), /resource data does not map/);
  const early = fixture({ productVersion: '1.0.0-beta.4' });
  early.writeUInt32LE(0x48, 0x414);
  await assert.rejects(inspect(early), /before the language level/);
});

test('rejects malformed VS_VERSION_INFO blocks and fixed signatures', async () => {
  const short = fixture({ productVersion: '1.0.0-beta.4' });
  short.writeUInt16LE(7, 0x460);
  await assert.rejects(inspect(short), /version-block length/);
  const value = fixture({ productVersion: '1.0.0-beta.4' });
  const key = value.indexOf(Buffer.from('ProductVersion\0', 'utf16le'));
  value.writeUInt16LE(0xffff, key - 4);
  await assert.rejects(inspect(value), /version-block value exceeds/);
  const signature = fixture({ productVersion: '1.0.0-beta.4' });
  signature.writeUInt32LE(0, 0x460 + 40);
  await assert.rejects(inspect(signature), /VS_FIXEDFILEINFO signature/);
});

test('rejects unterminated ProductVersion and hidden child blocks in strings', async () => {
  const bytes = fixture({ productVersion: '1.0.0-beta.4' });
  const key = bytes.indexOf(Buffer.from('ProductVersion\0', 'utf16le'));
  const start = key - 6;
  const end = start + bytes.readUInt16LE(start);
  bytes.writeUInt16LE(0x41, end - 2);
  await assert.rejects(inspect(bytes), /unterminated ProductVersion/);
  const hidden = fixture({ productVersion: '1.0.0-beta.4' });
  hidden.writeUInt16LE(0, key - 4);
  await assert.rejects(inspect(hidden), /version-block|version String/);
});
