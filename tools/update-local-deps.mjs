import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Refresh unpublished dependency snapshots without changing release semver ranges.
 * Pass actual npm .tgz files. They are copied into this repository's vendor folder;
 * the lockfile pins their local bytes, so npm ci needs no sibling source checkout.
 */
const root = process.cwd();
const pkgFile = path.join(root, 'package.json');
const original = await readFile(pkgFile, 'utf8');
const pkg = JSON.parse(original);
const inputs = process.argv.slice(2);
if (!inputs.length || inputs.some((entry) => !entry.endsWith('.tgz'))) throw new Error('Pass one or more npm .tgz files');
if (!process.env.npm_execpath) throw new Error('Run through npm run deps:update -- <packages.tgz>');
await mkdir(path.join(root, 'vendor'), {recursive:true});
const files = [];
for (const input of inputs) {
  const name = path.basename(input);
  const target = path.join(root, 'vendor', name);
  if (path.resolve(input) !== target) await copyFile(path.resolve(input), target);
  files.push(`./vendor/${name}`);
}
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.env.npm_execpath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', ...files], {cwd:root,stdio:'inherit',shell:false,windowsHide:true});
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm install failed (${code})`)));
  });
  const lockFile = path.join(root, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockFile, 'utf8'));
  // npm temporarily records file: specs. Keep package.json publishable while the
  // repository lockfile resolves the same versions from checked-in local archives.
  for (const key of ['dependencies','devDependencies','optionalDependencies','peerDependencies','peerDependenciesMeta']) {
    if (pkg[key]) lock.packages[''][key] = pkg[key]; else delete lock.packages[''][key];
  }
  await writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
} finally {
  await writeFile(pkgFile, original);
}
console.log('Local package snapshots and lockfile refreshed; release dependency ranges preserved.');
