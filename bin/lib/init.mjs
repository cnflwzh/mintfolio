import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { syncThemeConfigs, reportThemeConfigs } from "../theme-config.mjs";
import { checkedPath } from './files.mjs';

/** Write scaffold files exclusively: initialization never overwrites site content. */
async function writeNew(root, relative, source) {
  const destination = path.resolve(root, relative);
  const within = path.relative(root, destination);
  if (!within || within.startsWith('..') || path.isAbsolute(within)) throw new Error('Invalid scaffold destination');
  await checkedPath(root, destination);
  await mkdir(path.dirname(destination), { recursive: true });
  try { await writeFile(destination, source, { flag: 'wx' }); process.stdout.write(`Created ${relative}\n`); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

/**
 * Scaffold a site without replacing existing files or npm scripts.
 * @param {string} root Existing absolute site directory with Core installed.
 * @returns {Promise<void>} Creates missing config/content files and theme defaults.
 */
export async function initialize(root) {
  await writeNew(root, '.gitignore', 'node_modules/\ndist/\n.astro/\n.mintfolio/\n.cache/\n.env\n.env.*\n');
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
  await writeNew(root, 'src/content.config.ts', `import { createBlogCollection, createPageCollection } from '@mintfolio/core/content';
export const collections = { blog: createBlogCollection(), pages: createPageCollection() };
`);
  await writeNew(root, 'tsconfig.json', JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', 'src/**/*', 'site.config.ts'] }, null, 2) + '\n');
  await mkdir(path.join(root, 'public'), { recursive: true });
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
  await writeNew(root, 'content/pages/links.md', `---
title: "友情链接"
description: "收藏值得阅读的网站。"
---

## 发现更多

- [Astro](https://astro.build/)

本页由 \`content/pages/links.md\` 生成，地址是 \`/links\`；可在站点 navigation 中添加入口。
`);
  const filename = path.join(root, 'package.json');
  const existing = await readFile(filename, 'utf8').catch((error) => { if (error.code === 'ENOENT') return '{}'; throw error; });
  const pkg = JSON.parse(existing);
  pkg.name ??= 'my-mintfolio-blog';
  pkg.private ??= true;
  pkg.type = 'module';
  pkg.scripts = { dev: 'mintfolio dev', build: 'mintfolio build', preview: 'mintfolio preview', ...pkg.scripts };
  await writeFile(filename, JSON.stringify(pkg, null, 2) + '\n');
  reportThemeConfigs(await syncThemeConfigs(root));
  process.stdout.write('Ready. Edit site.config.ts, then run npm run dev.\n');
}
