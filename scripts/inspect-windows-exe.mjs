import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// This is an import-name audit, not a loader or a signature/trust verifier.
// API-set contracts and UCRT are Windows 10+ components. WebView2 Runtime is
// a separate system prerequisite even when WebView2Loader is statically linked.
const WINDOWS_SYSTEM_DLLS = new Set(
  `advapi32 avrt bcrypt bcryptprimitives cabinet cfgmgr32 clbcatq comctl32
   comdlg32 combase credui crypt32 cryptbase cryptnet cryptsp cryptui d2d1
   d3d11 d3d12 d3dcompiler_47 dbghelp dnsapi dsound dwmapi dwrite dxgi
   dxva2 evr gdi32 gdiplus hid imagehlp imm32 iphlpapi kernel32 kernelbase
   mf mfplat mfreadwrite mfuuid mmdevapi mpr msimg32 msvcrt mswsock
   ncrypt netapi32 normaliz ntdll ole32 oleacc oleaut32 opengl32 powrprof
   profapi propsys psapi rasapi32 rpcrt4 rsaenh secur32 setupapi shell32
   shcore shlwapi sspicli ucrtbase urlmon user32 userenv usp10 uxtheme
   version wevtapi windowscodecs winhttp wininet winmm winspool wintrust
   wldap32 ws2_32 wtsapi32 xinput1_4`
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => `${name}.dll`),
);

function classifyImport(name) {
  if (/^(?:api|ext)-ms-[a-z0-9-]+\.dll$/.test(name)) return 'windows-api-set';
  if (WINDOWS_SYSTEM_DLLS.has(name)) return 'windows-system';
  return 'unsupported-sidecar';
}

/** Read PE bytes without executing the file or loading any imported library. */
export async function inspectWindowsExe(filePath) {
  const absolutePath = path.resolve(filePath);
  const bytes = await readFile(absolutePath);
  const fail = (message) => {
    throw new Error(`Invalid Windows executable: ${message}`);
  };
  const check = (offset, length, description) => {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset > bytes.length - length
    )
      fail(`${description} is outside the file.`);
  };
  const u16 = (offset, description) => {
    check(offset, 2, description);
    return bytes.readUInt16LE(offset);
  };
  const u32 = (offset, description) => {
    check(offset, 4, description);
    return bytes.readUInt32LE(offset);
  };
  check(0, 64, 'DOS header');
  if (u16(0, 'DOS signature') !== 0x5a4d) fail('missing MZ signature.');
  const peOffset = u32(0x3c, 'PE header pointer');
  check(peOffset, 24, 'PE and COFF headers');
  if (u32(peOffset, 'PE signature') !== 0x00004550) fail('missing PE signature.');

  const machine = u16(peOffset + 4, 'machine');
  const sectionCount = u16(peOffset + 6, 'section count');
  const optionalSize = u16(peOffset + 20, 'optional-header size');
  const characteristics = u16(peOffset + 22, 'COFF characteristics');
  if (!(characteristics & 0x0002) || characteristics & 0x2000)
    fail('expected an executable, not a DLL.');
  if (sectionCount < 1 || sectionCount > 96) fail('unsupported section count.');
  const optionalOffset = peOffset + 24;
  check(optionalOffset, optionalSize, 'optional header');
  const magic = u16(optionalOffset, 'optional-header magic');
  const is64 = magic === 0x20b;
  if (!is64 && magic !== 0x10b) fail('unsupported optional-header format.');
  const directoryOffset = is64 ? 112 : 96;
  if (optionalSize < directoryOffset) fail('truncated optional header.');
  const architecture = { 0x8664: 'x86_64', 0x14c: 'x86', 0xaa64: 'arm64' }[machine] ?? 'unknown';
  if ((architecture === 'x86' && is64) || (['x86_64', 'arm64'].includes(architecture) && !is64)) {
    fail('machine and optional-header formats disagree.');
  }
  const imageBase = is64
    ? bytes.readBigUInt64LE(optionalOffset + 24)
    : BigInt(u32(optionalOffset + 28, 'image base'));
  const headersSize = u32(optionalOffset + 60, 'header size');
  if (headersSize > bytes.length) fail('header size exceeds the file.');
  const directoryCount = u32(optionalOffset + directoryOffset - 4, 'directory count');
  if (directoryCount > Math.floor((optionalSize - directoryOffset) / 8))
    fail('truncated data-directory table.');
  const sectionOffset = optionalOffset + optionalSize;
  check(sectionOffset, sectionCount * 40, 'section table');
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + index * 40;
    const virtualSize = u32(offset + 8, 'section virtual size');
    const rva = u32(offset + 12, 'section RVA');
    const rawSize = u32(offset + 16, 'section raw size');
    const rawOffset = u32(offset + 20, 'section raw offset');
    if (rawSize) check(rawOffset, rawSize, 'section raw data');
    sections.push({ rva, span: Math.max(virtualSize, rawSize), rawSize, rawOffset });
  }
  const resolveRva = (rva, length, description) => {
    if (!Number.isSafeInteger(rva) || rva < 0 || rva > 0xffffffff || rva + length > 0x100000000) {
      fail(`${description} has an invalid RVA.`);
    }
    if (rva < headersSize && rva + length <= headersSize) {
      check(rva, length, description);
      return { offset: rva, available: headersSize - rva };
    }
    const matches = sections.filter(
      (section) => rva >= section.rva && rva < section.rva + section.span,
    );
    if (matches.length !== 1) fail(`${description} does not map to one section.`);
    const section = matches[0];
    const relative = rva - section.rva;
    if (relative + length > section.rawSize) fail(`${description} is not backed by file bytes.`);
    const offset = section.rawOffset + relative;
    check(offset, length, description);
    return { offset, available: section.rawSize - relative };
  };
  const readDllName = (rva) => {
    const { offset, available } = resolveRva(rva, 1, 'import DLL name');
    const limit = Math.min(available, 261);
    let length = 0;
    while (length < limit && bytes[offset + length] !== 0) {
      const character = bytes[offset + length];
      if (character < 0x21 || character > 0x7e) fail('import DLL name is not printable ASCII.');
      length += 1;
    }
    if (length === 0 || length === limit)
      fail('empty, oversized, or unterminated import DLL name.');
    return bytes.toString('ascii', offset, offset + length).toLowerCase();
  };
  const readImports = (directoryIndex, descriptorSize, delayed) => {
    if (directoryIndex >= directoryCount) return [];
    const entry = optionalOffset + directoryOffset + directoryIndex * 8;
    const rva = u32(entry, 'import directory RVA');
    const size = u32(entry + 4, 'import directory size');
    if (rva === 0 && size === 0) return [];
    if (rva === 0 || size < descriptorSize) fail('invalid import directory.');
    const { offset } = resolveRva(rva, size, 'import directory');
    const names = [];
    for (let relative = 0; relative + descriptorSize <= size; relative += descriptorSize) {
      const descriptor = offset + relative;
      if (bytes.subarray(descriptor, descriptor + descriptorSize).every((value) => value === 0)) {
        return [...new Set(names)].sort();
      }
      let nameRva = u32(descriptor + (delayed ? 4 : 12), 'import DLL name pointer');
      if (delayed) {
        const attributes = u32(descriptor, 'delay-import attributes');
        if (attributes & ~1) fail('unsupported delay-import attributes.');
        if (!(attributes & 1)) {
          const converted = BigInt(nameRva) - imageBase;
          if (converted < 0n || converted > 0xffffffffn)
            fail('invalid delay-import virtual address.');
          nameRva = Number(converted);
        }
      }
      if (nameRva === 0) fail('missing import DLL name pointer.');
      names.push(readDllName(nameRva));
    }
    fail('unterminated import descriptor table.');
  };

  const imports = readImports(1, 20, false);
  const delayImports = readImports(13, 32, true);
  const dependencyClassification = [...new Set([...imports, ...delayImports])]
    .sort()
    .map((name) => ({
      name,
      classification: classifyImport(name),
    }));
  return {
    path: absolutePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    machine,
    architecture,
    format: is64 ? 'PE32+' : 'PE32',
    imports,
    delayImports,
    unsupportedImports: dependencyClassification
      .filter((item) => item.classification === 'unsupported-sidecar')
      .map((item) => item.name),
    dependencyClassification,
    limitations: [
      'Only normal and delay import tables are inspected; runtime LoadLibrary calls are outside this audit.',
      'Windows system classification uses DLL names, not digital signatures or loader resolution.',
      'Microsoft Edge WebView2 Runtime remains a system prerequisite.',
    ],
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: node scripts/inspect-windows-exe.mjs [path/to/gitsomething.exe]');
  } else if (args.length > 1) {
    console.error('Expected at most one executable path.');
    process.exitCode = 1;
  } else {
    try {
      const report = await inspectWindowsExe(
        args[0] ?? 'src-tauri/target/release/gitsomething.exe',
      );
      console.log(JSON.stringify(report, null, 2));
      if (report.architecture !== 'x86_64' || report.unsupportedImports.length > 0)
        process.exitCode = 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
