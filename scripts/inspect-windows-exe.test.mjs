import assert from 'node:assert/strict';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { inspectWindowsExe } from './inspect-windows-exe.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'gitsomething-pe-audit-'));
const files = [];
after(async () => {
  await Promise.all(files.map((file) => unlink(file)));
  await rmdir(directory);
});

function fixture({ normal = 'kernel32.dll', delayed, legacyDelay = false, x86 = false } = {}) {
  const bytes = Buffer.alloc(0x400);
  bytes.write('MZ');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80);
  bytes.writeUInt16LE(x86 ? 0x14c : 0x8664, 0x84);
  bytes.writeUInt16LE(1, 0x86);
  bytes.writeUInt16LE(0xf0, 0x94);
  bytes.writeUInt16LE(0x0002, 0x96);
  bytes.writeUInt16LE(x86 ? 0x10b : 0x20b, 0x98);
  if (x86) bytes.writeUInt32LE(0x400000, 0x98 + 28);
  else bytes.writeBigUInt64LE(0x140000000n, 0x98 + 24);
  bytes.writeUInt32LE(0x200, 0x98 + 60);
  const dataDirectory = 0x98 + (x86 ? 96 : 112);
  bytes.writeUInt32LE(16, dataDirectory - 4);
  bytes.write('.rdata', 0x188);
  bytes.writeUInt32LE(0x200, 0x188 + 8);
  bytes.writeUInt32LE(0x1000, 0x188 + 12);
  bytes.writeUInt32LE(0x200, 0x188 + 16);
  bytes.writeUInt32LE(0x200, 0x188 + 20);
  if (normal) {
    bytes.writeUInt32LE(0x1000, dataDirectory + 8);
    bytes.writeUInt32LE(40, dataDirectory + 12);
    bytes.writeUInt32LE(0x1080, 0x200 + 12);
    bytes.write(`${normal}\0`, 0x280);
  }
  if (delayed) {
    bytes.writeUInt32LE(0x1040, dataDirectory + 13 * 8);
    bytes.writeUInt32LE(64, dataDirectory + 13 * 8 + 4);
    bytes.writeUInt32LE(legacyDelay ? 0 : 1, 0x240);
    bytes.writeUInt32LE((legacyDelay ? 0x400000 : 0) + 0x10c0, 0x244);
    bytes.write(`${delayed}\0`, 0x2c0);
  }
  return bytes;
}

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
