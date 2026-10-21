const align4 = (length) => Math.ceil(length / 4) * 4;

function versionBlock(key, type, value = Buffer.alloc(0), children = []) {
  const name = Buffer.from(`${key}\0`, 'utf16le');
  const valueOffset = align4(6 + name.length);
  let length = valueOffset + value.length;
  const childOffsets = children.map((child) => {
    length = align4(length);
    const offset = length;
    length += child.length;
    return offset;
  });
  const block = Buffer.alloc(length);
  block.writeUInt16LE(length, 0);
  block.writeUInt16LE(type === 1 ? value.length / 2 : value.length, 2);
  block.writeUInt16LE(type, 4);
  name.copy(block, 6);
  value.copy(block, valueOffset);
  children.forEach((child, index) => child.copy(block, childOffsets[index]));
  return block;
}

export function createWindowsExeFixture({
  normal = 'kernel32.dll',
  delayed,
  legacyDelay = false,
  x86 = false,
  productVersion,
  productVersions,
} = {}) {
  const versions = productVersions ?? (productVersion == null ? null : [productVersion]);
  const bytes = Buffer.alloc(versions ? 0x1000 : 0x400);
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
  bytes.writeUInt32LE(bytes.length - 0x200, 0x188 + 8);
  bytes.writeUInt32LE(0x1000, 0x188 + 12);
  bytes.writeUInt32LE(bytes.length - 0x200, 0x188 + 16);
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
  if (versions) {
    const fixed = Buffer.alloc(52);
    fixed.writeUInt32LE(0xfeef04bd, 0);
    fixed.writeUInt32LE(0x10000, 4);
    fixed.writeUInt32LE(0x10000, 8);
    fixed.writeUInt32LE(0x10000, 16);
    const tables = versions.map((version, index) =>
      versionBlock(`${(0x409 + index).toString(16).padStart(4, '0')}04b0`, 1, Buffer.alloc(0), [
        versionBlock('ProductVersion', 1, Buffer.from(`${version}\0`, 'utf16le')),
      ]),
    );
    const translation = Buffer.from([0x09, 0x04, 0xb0, 0x04]);
    const payload = versionBlock('VS_VERSION_INFO', 0, fixed, [
      versionBlock('StringFileInfo', 1, Buffer.alloc(0), tables),
      versionBlock('VarFileInfo', 1, Buffer.alloc(0), [
        versionBlock('Translation', 0, translation),
      ]),
    ]);
    bytes.writeUInt32LE(0x1200, dataDirectory + 2 * 8);
    bytes.writeUInt32LE(96 + payload.length, dataDirectory + 2 * 8 + 4);
    for (const offset of [0x400, 0x418, 0x430]) bytes.writeUInt16LE(1, offset + 14);
    bytes.writeUInt32LE(16, 0x410);
    bytes.writeUInt32LE(0x80000018, 0x414);
    bytes.writeUInt32LE(1, 0x428);
    bytes.writeUInt32LE(0x80000030, 0x42c);
    bytes.writeUInt32LE(0x409, 0x440);
    bytes.writeUInt32LE(0x48, 0x444);
    bytes.writeUInt32LE(0x1260, 0x448);
    bytes.writeUInt32LE(payload.length, 0x44c);
    payload.copy(bytes, 0x460);
  }
  return bytes;
}
