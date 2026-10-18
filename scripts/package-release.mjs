import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectWindowsExe } from './inspect-windows-exe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let options;

try {
  options = parseOptions(process.argv.slice(2));
  await prepare();
} catch (error) {
  console.error(`Release preparation failed: ${error.message}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const parsed = { dryRun: false };
  const names = new Map([
    ['--installer', 'installer'],
    ['--exe', 'exe'],
    ['--target', 'target'],
    ['--source-revision', 'sourceRevision'],
    ['--format', 'format'],
    ['--installer-proof', 'installerProof'],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    const name = names.get(flag);
    const value = args[++index];
    if (!name || !value || value.startsWith('--') || parsed[name]) {
      throw new Error(`Unsupported, missing, or repeated argument: ${flag}`);
    }
    parsed[name] = value;
  }
  if (parsed.target && parsed.target !== 'x86_64-pc-windows-msvc') {
    throw new Error('This release packager supports only Windows x64.');
  }
  parsed.format ??= 'installer';
  if (!['installer', 'portable', 'full'].includes(parsed.format)) {
    throw new Error('--format must be installer, portable, or full.');
  }
  if (parsed.format === 'portable' && parsed.installer) {
    throw new Error('--installer requires --format installer or full.');
  }
  if (parsed.sourceRevision && !/^[a-f0-9]{40}$/i.test(parsed.sourceRevision)) {
    throw new Error('--source-revision requires a complete 40-character commit hash.');
  }
  return parsed;
}

async function prepare() {
  const [packageJson, packageLock, config, cargo, cargoLock] = await Promise.all([
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('src-tauri/tauri.conf.json'),
    readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'),
    readFile(path.join(root, 'src-tauri/Cargo.lock'), 'utf8'),
  ]);
  const version = packageJson.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error('The package version is not a supported release version.');
  }
  const cargoPackage = cargo.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const cargoVersion = cargoPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const lockedCrate = cargoLock
    .split('[[package]]')
    .find((entry) => /^\s*name\s*=\s*"gitsomething"\s*$/m.test(entry));
  const lockedVersion = lockedCrate?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const versions = [
    config.version,
    cargoVersion,
    lockedVersion,
    packageLock.version,
    packageLock.packages?.['']?.version,
  ];
  if (versions.some((entry) => entry !== version)) {
    throw new Error(
      'Synchronize the package, npm lockfile, Cargo manifest/lockfile, and Tauri versions first.',
    );
  }
  if (
    config.productName !== 'GitSomething' ||
    (options.format !== 'portable' && !config.bundle?.targets?.includes('nsis'))
  ) {
    throw new Error('Expected the GitSomething product and requested bundle configuration.');
  }
  if (
    config.bundle?.windows?.certificateThumbprint ||
    config.bundle?.windows?.signCommand ||
    config.bundle?.windows?.azureSignParams
  ) {
    throw new Error(
      'Signing configuration changed. Verify signatures and update the unsigned manifest policy before packaging.',
    );
  }

  const tag = `v${version}`;
  const releaseDir = path.join(root, 'src-tauri/target', options.target ?? '', 'release');
  const installerName = `GitSomething_${version}_x64-setup.exe`;
  const appName = `GitSomething_${version}_windows-x64.exe`;
  const fullFiles = [
    {
      source: options.installer
        ? path.resolve(options.installer)
        : path.join(releaseDir, 'bundle/nsis', installerName),
      name: installerName,
      kind: 'windows-installer',
      executable: true,
    },
    {
      source: options.exe ? path.resolve(options.exe) : path.join(releaseDir, 'gitsomething.exe'),
      name: appName,
      kind: 'windows-application',
      executable: true,
    },
    {
      source: path.join(root, 'docs/releases', `${tag}.md`),
      name: 'RELEASE_NOTES.md',
      kind: 'release-notes',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-app-icon.svg'),
      name: 'GitSomething-app-icon.svg',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-app-icon-1024.png'),
      name: 'GitSomething-app-icon-1024.png',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/github-oauth-logo-256.png'),
      name: 'GitSomething-github-oauth-logo-256.png',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/github-oauth-logo-512.png'),
      name: 'GitSomething-github-oauth-logo-512.png',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-wordmark-dark.svg'),
      name: 'GitSomething-wordmark-dark.svg',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-wordmark-light.svg'),
      name: 'GitSomething-wordmark-light.svg',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-release-banner.png'),
      name: 'GitSomething-release-banner.png',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-release-banner.svg'),
      name: 'GitSomething-release-banner.svg',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-mark-animated.svg'),
      name: 'GitSomething-mark-animated.svg',
      kind: 'brand',
    },
    {
      source: path.join(root, 'public/brand/gitsomething-logo-preview.html'),
      name: 'GitSomething-logo-preview.html',
      kind: 'brand',
    },
  ];
  const files =
    options.format === 'installer'
      ? [fullFiles[0]]
      : options.format === 'portable'
        ? [fullFiles[1]]
        : fullFiles;
  const notes = await readFile(fullFiles[2].source, 'utf8');
  if (
    !notes.startsWith(`# GitSomething ${version}\n`) &&
    !notes.startsWith(`# GitSomething ${version}\r\n`)
  ) {
    throw new Error('Release notes must start with the matching GitSomething version heading.');
  }
  for (const file of files) {
    const metadata = await stat(file.source);
    if (!metadata.isFile() || metadata.size === 0) {
      throw new Error(`Missing or empty release input: ${path.relative(root, file.source)}`);
    }
    if (file.executable) {
      const handle = await open(file.source, 'r');
      try {
        const header = Buffer.alloc(2);
        await handle.read(header, 0, 2, 0);
        if (
          path.extname(file.source).toLowerCase() !== '.exe' ||
          header.toString('ascii') !== 'MZ'
        ) {
          throw new Error(`Expected a Windows executable: ${path.basename(file.source)}`);
        }
      } finally {
        await handle.close();
      }
    }
  }
  const application = await inspectWindowsExe(fullFiles[1].source);
  if (application.architecture !== 'x86_64' || application.unsupportedImports.length) {
    throw new Error(
      `The portable application must be Windows x64 with only system DLL imports. Unexpected dependencies: ${application.unsupportedImports.join(', ') || application.architecture}`,
    );
  }
  let installerVerification;
  let installerSha256;
  if (options.format !== 'portable') {
    installerSha256 = await sha256(fullFiles[0].source);
    if (options.installerProof) {
      const proof = JSON.parse(await readFile(path.resolve(options.installerProof), 'utf8'));
      if (
        proof.status !== 'passed' ||
        proof.version !== version ||
        proof.installer?.sha256 !== installerSha256 ||
        proof.installer?.bytes !== (await stat(fullFiles[0].source)).size ||
        proof.application?.sha256 !== application.sha256 ||
        proof.application?.bytes !== application.bytes ||
        proof.application?.architecture !== 'x86_64'
      ) {
        throw new Error(
          'Installer verification must pass for this version, setup file, and audited application bytes.',
        );
      }
      installerVerification = {
        method: 'disposable Windows CI installation, shortcuts, payload hash, and uninstall',
        status: proof.status,
        installerSha256,
        applicationSha256: application.sha256,
      };
    } else if (!options.dryRun) {
      throw new Error(
        'Installer staging requires --installer-proof from scripts/verify-windows-installer.ps1 on a disposable Windows CI runner.',
      );
    }
  }
  const output = path.join(root, 'artifacts/releases', tag);
  const allowed = new Set([...files.map((file) => file.name), 'manifest.json', 'SHA256SUMS.txt']);
  const existing = await readdir(output).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (existing.some((name) => !allowed.has(name))) {
    throw new Error(
      'The release directory contains unexpected files; review them before staging assets.',
    );
  }
  if (options.dryRun) {
    console.log(`Validated ${files.length} inputs for GitSomething ${version}; no files written.`);
    if (options.format !== 'portable' && !installerVerification) {
      console.log(
        'Installer inputs only; staging still requires matching installation verification.',
      );
    }
    console.log(`Output: ${output}`);
    return;
  }

  await mkdir(output, { recursive: true });
  const assets = [];
  for (const file of files) {
    const destination = path.join(output, file.name);
    const before = await sha256(file.source);
    if (file.kind === 'windows-application' && before !== application.sha256) {
      throw new Error(
        'The application changed after its dependency audit; retry after the build finishes.',
      );
    }
    if (file.kind === 'windows-installer' && before !== installerSha256) {
      throw new Error(
        'The installer changed after verification; retry with proof for the final build.',
      );
    }
    await copyFile(file.source, destination);
    const copied = await sha256(destination);
    if (before !== copied)
      throw new Error(`Source changed while staging ${file.name}; retry after the build finishes.`);
    assets.push({
      name: file.name,
      kind: file.kind,
      bytes: (await stat(destination)).size,
      sha256: copied,
    });
  }
  const manifest = {
    product: 'GitSomething',
    version,
    tag,
    prerelease: version.includes('-'),
    platform: 'windows',
    architecture: 'x86_64',
    distribution: options.format,
    publicAssets:
      options.format === 'full'
        ? [...files.map((file) => file.name), 'manifest.json', 'SHA256SUMS.txt']
        : files.map((file) => file.name),
    codeSigning: 'unsigned',
    webview: 'Microsoft Edge WebView2',
    webviewProvisioning:
      options.format === 'portable' ? 'system runtime required' : 'installer bootstrapper',
    nativeDependencies: {
      imports: application.imports,
      delayImports: application.delayImports,
      unsupportedImports: application.unsupportedImports,
    },
    bundledApplication: {
      bytes: application.bytes,
      sha256: application.sha256,
      architecture: application.architecture,
    },
    ...(installerVerification ? { installerVerification } : {}),
    githubOAuth:
      'shared public application identifier embedded at build time; access tokens not included',
    ...(options.sourceRevision ? { sourceRevision: options.sourceRevision.toLowerCase() } : {}),
    assets,
  };
  const manifestPath = path.join(output, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const checksums = [
    ...assets.map((asset) => `${asset.sha256}  ${asset.name}`),
    `${await sha256(manifestPath)}  manifest.json`,
  ];
  await writeFile(path.join(output, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');
  console.log(`Prepared ${assets.length} assets, manifest, and SHA-256 checksums: ${output}`);
  if (options.format !== 'full') {
    console.log(
      `Upload only ${files[0].name}; keep manifest.json and SHA256SUMS.txt as build records.`,
    );
  }
  console.log(
    'This is an unsigned preview. Live OAuth and installation verification must be recorded separately.',
  );
}

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
