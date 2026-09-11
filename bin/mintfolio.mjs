#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { initialize } from './lib/init.mjs';
import { cliVersion, createSite, doctor, requireThemeConfigRuntime } from './lib/site.mjs';
import { createPost, listPosts, setDraft } from './lib/posts.mjs';
import { activeTheme, installTheme, listThemes, packageSpec, readSelection, useTheme } from './lib/themes.mjs';
import { configFilename, configSchema, getConfig, setConfig } from './lib/config.mjs';
import { display, exists, findSite } from './lib/files.mjs';
import { astroEntry, editFile, npm, run } from './lib/process.mjs';
import { createThemeConfig, reportThemeConfigs, syncThemeConfigs } from './theme-config.mjs';

const help = {
  main: `Mintfolio — 站点、文章、主题和配置管理

用法：mintfolio [--cwd <目录>] <命令>

  create <目录> [--theme default]  创建站点并安装依赖
  init                            补齐当前站点的初始化文件
  upgrade [--version <版本>]       更新当前站点的 Core
  dev / build / preview / sync     开发、构建、预览或同步内容
  post new|list|publish|draft       创建和管理文章
  theme list|current|install|use   安装和切换主题
  theme init|sync|check            生成和校验主题配置
  config get|set|path|edit|schema   查看、修改或打开配置
  doctor                          检查站点环境与已安装版本
  check                           校验主题并同步 Astro 内容
  --version                       显示 CLI 版本

使用 mintfolio <命令> --help 查看用法。
在站点子目录也可运行；--cwd / -C 指定其他站点。
旧的 theme:add/theme:init/theme:sync/theme:check 命令继续有效。`,
  create: `用法：mintfolio create <空目录> [--theme <主题>] [--registry <URL>]

安装 Core，生成站点文件；--theme 可同时安装并启用主题。
--registry 只配置新站点的 @mintfolio 仓库，例如本地仓库地址。`,
  init: '用法：mintfolio init\n在已安装 Core 的当前目录补齐初始化文件，保留已有内容和 npm scripts。',
  upgrade: '用法：mintfolio upgrade [--version <版本或标签>]\n从当前站点配置的 npm 仓库更新 Core，默认 latest。更新后请重新启动开发服务。',
  post: `用法：mintfolio post <操作>

  new <标题> [--slug <ID>] [--description <摘要>] [--category <分类>]
             [--tags <逗号分隔标签>] [--date YYYY-MM-DD] [--publish]
  list [--draft | --published] [--json]
  publish <ID>     将 draft 设为 false，下一次构建可见
  draft <ID>       将 draft 设为 true

新文章默认是草稿，存放在 content/blog；ID 支持 notes/hello 等目录。
标题含空格时请加引号。不会覆盖同名文件。publish 不执行部署。
示例：mintfolio post new "我的第一篇文章" --slug first-post --tags 随笔,生活`,
  theme: `用法：mintfolio theme <操作>

  list [--json]                   列出内置和已安装主题
  current                         显示当前配置中选定的主题
  install <包名[@版本]> [--use]    安装主题并生成配置，可同时启用
  use <主题>                      选择 minimal、已安装包或本地主题目录
  init [主题]                     生成完整配置，保留已有文件
  sync                            补齐已安装主题的配置
  check [主题]                    校验清单、配置和页面路径

verdant 是 @mintfolio/theme-default 的别名；default / happyhues 继续兼容。
示例：mintfolio theme install default --use`,
  config: `用法：mintfolio config <操作> <site|theme>

  get <范围> [字段]               查看配置；theme 返回合并默认值后的设置
  set <范围> <字段> <值> [--json]  修改单项，保存前校验并备份
  path <范围>                     显示配置路径
  edit <范围> [--editor <程序>]    用编辑器打开配置
  schema <范围>                   查看可用字段和限制

theme 范围可加 --theme <主题> 编辑未启用主题。
字段用点号访问，例如 sidebar.quote.enabled；数组下标也用点号。
字符串直接填写；布尔值用 true/false，数组和对象用 JSON。
site 值按源文件读取；动态表达式显示为 $expression，不执行导入。
修改会保留周围注释，并在 .mintfolio/backups 中备份原文件。

示例：mintfolio config set site site.title "我的博客"
      mintfolio config set theme initialPalette 3
      mintfolio config set theme sidebar.quote.enabled true`,
  doctor: '用法：mintfolio doctor [--json]\n检查 Node、当前站点 Core/Astro、主题与配置，不修改文件。',
  check: '用法：mintfolio check\n检查站点和主题，然后运行 Astro sync 校验内容并生成类型；不代替生产构建。',
};

/** @param {string[]} args @param {object} [options] @returns {{values:object,positionals:string[]}} Strict argument parsing shared by commands. */
function options(args, options = {}) { return parseArgs({ args, options: { ...options, help: { type: 'boolean', short: 'h' } }, allowPositionals: true, strict: true }); }

/** @param {string[]} positionals @param {number} min @param {number} max @param {string} group */
function count(positionals, min, max, group) {
  if (positionals.length < min || positionals.length > max) throw new Error(`参数数量不正确。\n${help[group]}`);
}

function printHelp(group = 'main') {
  if (!help[group]) throw new Error(`未知命令：${group}`);
  console.log(help[group]);
}

/** @param {string[]} argv Raw process arguments. @returns {Promise<void>} Dispatch one command and propagate failures. */
async function main(argv) {
  let cwd = process.cwd();
  if (['--cwd', '-C'].includes(argv[0])) {
    if (!argv[1]) throw new Error('--cwd 需要目录。');
    cwd = path.resolve(argv[1]);
    argv = argv.slice(2);
  }
  let [command = 'help', ...args] = argv;
  if (['--version', '-v', 'version'].includes(command)) { console.log(await cliVersion()); return; }
  if (['help', '--help', '-h'].includes(command)) { printHelp(args[0] || 'main'); return; }
  const aliases = { 'theme:add': 'install', 'theme:init': 'init', 'theme:sync': 'sync', 'theme:check': 'check' };
  if (Object.hasOwn(aliases, command)) { args.unshift(aliases[command]); command = 'theme'; }
  if (command === 'new') { command = 'post'; args.unshift('new'); }

  if (command === 'create') {
    const parsed = options(args, { theme: { type: 'string' }, registry: { type: 'string' } });
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 1, 1, command);
    await createSite(path.resolve(cwd, parsed.positionals[0]), parsed.values);
    return;
  }
  if (command === 'init') {
    const parsed = options(args);
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 0, 0, command);
    await mkdir(cwd, { recursive: true });
    const root = await realpath(cwd);
    try { createRequire(path.join(root, 'package.json')).resolve('@mintfolio/core/package.json'); }
    catch { throw new Error('当前目录尚未安装 Core。请先 npm install @mintfolio/core，或使用 mintfolio create <目录>。'); }
    await initialize(root);
    return;
  }
  if (command === 'upgrade') {
    const parsed = options(args, { version: { type: 'string' } });
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 0, 0, command);
    const root = await findSite(cwd);
    const target = packageSpec(`@mintfolio/core@${parsed.values.version || 'latest'}`);
    await npm(['install', target.spec, '--no-audit'], root);
    console.log('Core 已更新，请重新启动开发服务。');
    return;
  }
  if (['dev', 'build', 'preview', 'sync'].includes(command)) {
    const root = await findSite(cwd);
    if (!args.includes('--help') && !args.includes('-h') && command !== 'preview') reportThemeConfigs(await syncThemeConfigs(root));
    await run(process.execPath, [astroEntry(root), command, ...args], root);
    return;
  }
  if (command === 'post') {
    const [action, ...rest] = args;
    if (!action || action === '--help' || action === '-h') return printHelp(command);
    const definitions = action === 'new' ? { slug: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, tags: { type: 'string' }, date: { type: 'string' }, publish: { type: 'boolean' } }
      : action === 'list' ? { draft: { type: 'boolean' }, published: { type: 'boolean' }, json: { type: 'boolean' } } : {};
    const parsed = options(rest, definitions);
    if (parsed.values.help) return printHelp(command);
    if (!['new', 'list', 'publish', 'draft'].includes(action)) throw new Error(`未知文章操作：${action}`);
    count(parsed.positionals, action === 'list' ? 0 : 1, action === 'list' ? 0 : 1, command);
    const root = await findSite(cwd);
    if (action === 'new') console.log(`已创建${parsed.values.publish ? '文章' : '草稿'}：${await createPost(root, parsed.positionals[0], parsed.values)}`);
    else if (action === 'list') {
      if (parsed.values.draft && parsed.values.published) throw new Error('--draft 和 --published 不能同时使用。');
      const posts = (await listPosts(root)).filter(post => parsed.values.draft ? post.draft : parsed.values.published ? !post.draft : true);
      if (parsed.values.json) console.log(JSON.stringify(posts, null, 2));
      else if (!posts.length) console.log('没有匹配的文章。');
      else for (const post of posts) console.log(`${post.draft ? '草稿' : '已发布'}  ${post.date}  ${post.slug}  ${post.title}`);
    } else {
      const result = await setDraft(root, parsed.positionals[0], action === 'draft');
      console.log(`${action === 'draft' ? '已设为草稿' : '已标记发布，下次构建生效'}：${result.filename}`);
      if (result.backup) console.log(`备份：${result.backup}`);
    }
    return;
  }
  if (command === 'theme') {
    const [action, ...rest] = args;
    if (!action || action === '--help' || action === '-h') return printHelp(command);
    const parsed = options(rest, action === 'install' ? { use: { type: 'boolean' } } : action === 'list' ? { json: { type: 'boolean' } } : {});
    if (parsed.values.help) return printHelp(command);
    if (!['list', 'current', 'install', 'use', 'init', 'sync', 'check'].includes(action)) throw new Error(`未知主题操作：${action}`);
    const required = ['install', 'use'].includes(action);
    count(parsed.positionals, required ? 1 : 0, ['install', 'use', 'init', 'check'].includes(action) ? 1 : 0, command);
    const root = await findSite(cwd);
    if (action === 'list') {
      const themes = await listThemes(root);
      if (parsed.values.json) console.log(JSON.stringify(themes, null, 2));
      else for (const theme of themes) console.log(`${theme.selected ? '*' : ' '} ${theme.name}  ${theme.version}`);
    } else if (action === 'current') console.log((await activeTheme(root)).selector);
    else if (action === 'install') await installTheme(root, parsed.positionals[0], parsed.values.use);
    else if (action === 'use') { await requireThemeConfigRuntime(root); await useTheme(root, parsed.positionals[0]); }
    else if (action === 'sync') reportThemeConfigs(await syncThemeConfigs(root));
    else if (action === 'init') {
      const selection = await readSelection(root);
      const result = await createThemeConfig(root, parsed.positionals[0] || selection.theme || 'minimal');
      console.log(`${result.created ? '已生成' : '已保留'} ${result.filename}`);
    } else {
      const active = await activeTheme(root, parsed.positionals[0] || process.env.MINTFOLIO_THEME);
      console.log(`主题 ${active.definition.manifest.id} 的清单、配置与页面路径校验通过。`);
    }
    return;
  }
  if (command === 'config') {
    const [action, ...rest] = args;
    if (!action || action === '--help' || action === '-h') return printHelp(command);
    const definitions = { theme: { type: 'string' }, ...(action === 'set' ? { json: { type: 'boolean' } } : {}), ...(action === 'edit' ? { editor: { type: 'string' } } : {}) };
    const parsed = options(rest, definitions);
    if (parsed.values.help) return printHelp(command);
    if (!['get', 'set', 'path', 'edit', 'schema'].includes(action)) throw new Error(`未知配置操作：${action}`);
    count(parsed.positionals, action === 'set' ? 3 : 1, action === 'set' ? 3 : action === 'get' ? 2 : 1, command);
    const [scope, key, raw] = parsed.positionals;
    if (!['site', 'theme'].includes(scope)) throw new Error('配置范围为 site 或 theme。');
    if (scope === 'site' && parsed.values.theme) throw new Error('--theme 只用于 theme 配置。');
    const root = await findSite(cwd);
    if (scope === 'theme') await requireThemeConfigRuntime(root);
    if (action === 'get') console.log(display(await getConfig(root, scope, key, parsed.values.theme)));
    else if (action === 'schema') console.log(display(await configSchema(root, scope, parsed.values.theme)));
    else if (action === 'set') {
      const result = await setConfig(root, scope, key, raw, parsed.values);
      console.log(`${key} = ${display(result.value)}\n文件：${result.filename}`);
      if (result.backup) console.log(`备份：${result.backup}`);
    } else {
      const filename = await configFilename(root, scope, parsed.values.theme);
      if (action === 'path') console.log(filename);
      else {
        if (!await exists(filename) && scope === 'theme') await createThemeConfig(root, parsed.values.theme || (await readSelection(root)).theme || 'minimal');
        await editFile(filename, parsed.values.editor, root);
      }
    }
    return;
  }
  if (command === 'doctor' || command === 'check') {
    const parsed = options(args, command === 'doctor' ? { json: { type: 'boolean' } } : {});
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 0, 0, command);
    const root = await findSite(cwd);
    const result = await doctor(root);
    console.log(parsed.values.json ? JSON.stringify(result, null, 2) : `环境检查通过\n站点：${result.root}\nNode ${result.node} · Core ${result.core} · Astro ${result.astro}\n主题：${result.theme} ${result.themeVersion}\n配置：${result.config}`);
    if (command === 'check') await run(process.execPath, [astroEntry(root), 'sync'], root);
    return;
  }
  throw new Error(`未知命令：${command}\n运行 mintfolio --help 查看可用命令。`);
}

try { await main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`[mintfolio] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = error.exitCode || 1;
}
