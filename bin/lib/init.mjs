import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { checkedPath } from './files.mjs';
import { listPosts } from './posts.mjs';
import { PAGES_DIR, PROJECT_DIR, PUBLIC_DIR, siteRootOf } from '../../src/shared/layout.mjs';

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
 * Scaffold the project folder without replacing existing files or npm scripts.
 * The site root keeps only articles; configuration, pages and static files live
 * in _mintfolio, and Core generates its Astro files there at run time.
 * @param {string} root Project folder (_mintfolio) with Core installed.
 * @returns {Promise<void>} Creates missing config files, a sample page, and a sample article only when the site has none.
 */
export async function initialize(root) {
  await writeNew(root, '.gitignore', 'node_modules/\ndist/\n.astro/\n.cache/\n.env\n.env.*\n');
  await writeNew(root, 'theme.config.mjs', `/**
 * 主题选择与主题设置。
 * theme 留空时使用内置的 Minimal；安装主题后运行 mintfolio theme use <主题>，
 * 会在这里写入 theme 和带注释的 settings。settings 只对当前主题生效。
 */
export default {};
`);
  await writeNew(root, 'site.config.ts', `import { defineSiteConfig } from '@mintfolio/core/config';
export default defineSiteConfig({
  site: { title: '我的博客', description: '记录与分享', url: 'https://example.com', language: 'zh-CN' },
  profile: { name: '作者', bio: '欢迎来到我的博客。' },
});
`);
  await mkdir(path.join(root, PUBLIC_DIR), { recursive: true });
  // A folder of existing notes stays exactly as it is.
  if (!(await listPosts(root)).length) {
    await writeNew(siteRootOf(root), 'hello.md', `---
title: "你好，Mintfolio"
pubDate: 2026-01-01
description: "这是你的第一篇文章。"
category: "随笔"
tags: ["开始"]
---

## 开始写作

站点根目录里的每个 Markdown 文件都是一篇文章，子目录也可以。以 \`_\` 或 \`.\` 开头的文件和目录不会发布。

站点资料、主题和独立页面都在 \`${PROJECT_DIR}/\` 中；运行 \`mintfolio\` 可以通过菜单完成常用操作。
`);
  }
  await writeNew(root, `${PAGES_DIR}/links.md`, `---
title: "友情链接"
description: "收藏值得阅读的网站。"
---

## 发现更多

- [Astro](https://astro.build/)

本页由 \`${PROJECT_DIR}/${PAGES_DIR}/links.md\` 生成，地址是 \`/links\`；可在站点 navigation 中添加入口。
`);
  const filename = path.join(root, 'package.json');
  const existing = await readFile(filename, 'utf8').catch((error) => { if (error.code === 'ENOENT') return '{}'; throw error; });
  const pkg = JSON.parse(existing);
  pkg.name ??= 'my-mintfolio-blog';
  pkg.private ??= true;
  pkg.type = 'module';
  pkg.scripts = { dev: 'mintfolio dev', build: 'mintfolio build', preview: 'mintfolio preview', ...pkg.scripts };
  await writeFile(filename, JSON.stringify(pkg, null, 2) + '\n');
  process.stdout.write('完成。修改 _mintfolio/site.config.ts 后运行 mintfolio dev，或直接运行 mintfolio 打开菜单。\n');
}
