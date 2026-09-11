import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { exists } from './files.mjs';

/**
 * Execute arguments without a shell, including Windows paths and Unicode titles.
 * @param {string} executable Executable path.
 * @param {string[]} args Literal argument vector; never interpolated shell code.
 * @param {string} cwd Working directory.
 * @returns {Promise<void>} Reject on launch errors, signals or nonzero status.
 */
export async function run(executable, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: 'inherit', shell: false, windowsHide: true });
    const forward = () => child.kill('SIGINT');
    process.once('SIGINT', forward);
    child.once('error', error => { process.removeListener('SIGINT', forward); reject(error); });
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', forward);
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${path.basename(executable)} 退出，状态 ${code ?? signal}。`), { exitCode: code ?? 1 }));
    });
  });
}

/** @returns {Promise<string>} npm's JavaScript entry, for npx, global and direct CLI execution. */
export async function npmEntry() {
  const candidates = [];
  if (process.env.npm_execpath?.endsWith('npm-cli.js')) candidates.push(process.env.npm_execpath);
  // PATH is the user's chosen npm (which may be newer than Node's bundled copy).
  const directories = [...(process.env.PATH || '').split(path.delimiter).filter(Boolean), path.dirname(process.execPath)];
  for (const directory of directories) {
    candidates.push(path.join(directory, 'node_modules/npm/bin/npm-cli.js'), path.join(directory, '../lib/node_modules/npm/bin/npm-cli.js'));
    try {
      const binary = await realpath(path.join(directory, 'npm'));
      if (binary.endsWith('npm-cli.js')) candidates.push(binary);
    } catch {}
  }
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error('找不到 npm。请安装 Node.js/npm，或通过 npx mintfolio 运行。');
}

/** @param {string[]} args npm arguments. @param {string} root Host directory. */
export async function npm(args, root) { await run(process.execPath, [await npmEntry(), ...args], root); }

/** @param {string} root Host root. @returns {string} Astro installed with this site's Core, including nested layouts. */
export function astroEntry(root) {
  const host = createRequire(path.join(root, 'package.json'));
  const core = createRequire(host.resolve('@mintfolio/core/package.json'));
  return path.join(path.dirname(core.resolve('astro/package.json')), 'bin/astro.mjs');
}

/**
 * Open the exact file with an installed GUI editor. An explicit --editor is an
 * executable name/path, not a shell expression. The CLI never invokes a shell.
 * @param {string} filename Checked site file. @param {string|undefined} editor Explicit editor executable.
 * @param {string} root Site root.
 */
export async function editFile(filename, editor, root) {
  const configured = editor || process.env.VISUAL || process.env.EDITOR;
  if (configured) return run(configured, [filename], root);
  if (process.platform === 'win32') return run('notepad.exe', [filename], root);
  if (process.platform === 'darwin') return run('open', ['-t', filename], root);
  return run('xdg-open', [filename], root);
}
