#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

/** Write scaffold files exclusively: initialization never overwrites site content. */
async function writeNew(root, relative, source) {
  const destination = path.resolve(root, relative);
  const within = path.relative(root, destination);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) throw new Error('Invalid scaffold destination');
  await mkdir(path.dirname(destination), { recursive: true });
  try { await writeFile(destination, source, { flag: 'wx' }); process.stdout.write(`Created ${relative}\n`); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

/** A site owns only content/configuration; every route and reusable feature is installed. */
async function initialize(root) {
  await writeNew(root, 'astro.config.mjs', `import { defineConfig } from 'astro/config';
import mintfolio from '@mintfolio/core';
import theme from './theme.config.mjs';
export default defineConfig({ integrations: [mintfolio(theme)] });
`);
  await writeNew(root, 'theme.config.mjs', `/** Omit theme to use Core's Minimal, or select an installed theme package. */
export default {};
`);
  await writeNew(root, 'site.config.ts', `import { defineSiteConfig } from '@mintfolio/core/config';
export default defineSiteConfig({
  site: { title: '我的博客', description: '记录与分享', url: 'https://example.com', language: 'zh-CN' },
  profile: { name: '作者', bio: '欢迎来到我的博客。' },
});
`);
  await writeNew(root, 'src/content.config.ts', `import { createBlogCollection } from '@mintfolio/core/content';
export const collections = { blog: createBlogCollection() };
`);
  await writeNew(root, 'tsconfig.json', JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', 'src/**/*', 'site.config.ts'] }, null, 2) + '\n');
  await writeNew(root, 'content/blog/hello.md', `---
title: "你好，Mintfolio"
pubDate: 2026-01-01
description: "这是你的第一篇文章。"
category: "随笔"
tags: ["开始"]
---

## 开始写作

把 Markdown 文章放到 \`content/blog/\`，Core 会生成文章、归档和订阅源。

安装主题包后，在 \`theme.config.mjs\` 中填写包名即可切换布局。
`);
  const filename = path.join(root, 'package.json');
  const existing = await readFile(filename, 'utf8').catch((error) => { if (error.code === 'ENOENT') return '{}'; throw error; });
  const pkg = JSON.parse(existing);
  pkg.name ??= 'my-mintfolio-blog';
  pkg.private ??= true;
  pkg.type = 'module';
  pkg.scripts = { dev: 'mintfolio dev', build: 'mintfolio build', preview: 'mintfolio preview', ...pkg.scripts };
  await writeFile(filename, JSON.stringify(pkg, null, 2) + '\n');
  process.stdout.write('Ready. Edit site.config.ts, then run npm run dev.\n');
}

const [command = 'help', ...args] = process.argv.slice(2);
try {
  if (command === 'init') await initialize(process.cwd());
  else if (command === 'theme:check') {
    const { loadTheme } = await import('../src/engine/loader.mjs');
    const root = process.cwd();
    const selection = (await import(pathToFileURL(path.join(root, 'theme.config.mjs')).href)).default;
    const theme = args[0] || process.env.MINTFOLIO_THEME || selection.theme;
    const changed = theme !== selection.theme;
    const active = await loadTheme({root,theme,settings:changed?{}:selection.settings,overrides:changed?{}:selection.overrides});
    process.stdout.write(`Theme ${active.definition.manifest.id}: manifest, settings and renderer paths are valid.\n`);
  }
  else if (['dev', 'build', 'preview', 'sync'].includes(command)) {
    // Resolve Astro from this installed package, including nested npm layouts.
    const require = createRequire(import.meta.url);
    const astroRoot = path.dirname(require.resolve('astro/package.json'));
    const child = spawn(process.execPath, [path.join(astroRoot, 'bin/astro.mjs'), command, ...args], { stdio: 'inherit', shell: false, windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1)); });
  } else {
    process.stdout.write('mintfolio init | dev | build | preview | sync | theme:check\n');
    if (!['help', '--help', '-h'].includes(command)) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`[mintfolio] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
