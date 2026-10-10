#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliVersion, createSite, doctor, requireThemeConfigRuntime, setupSite } from './lib/site.mjs';
import { createPost, listPosts, setDraft } from './lib/posts.mjs';
import { activeTheme, initThemeSettings, installTheme, listThemes, packageSpec, useTheme } from './lib/themes.mjs';
import { configFilename, configSchema, getConfig, setConfig } from './lib/config.mjs';
import { display, exists, findSite } from './lib/files.mjs';
import { editFile, npm } from './lib/process.mjs';
import { environmentText, runAstro, runCheck } from './lib/commands.mjs';
import { canPrompt, chooseTheme, pickPost, promptNewPost, setupMenu, siteMenu } from './lib/interactive.mjs';
import { PROJECT_DIR } from '../src/shared/layout.mjs';

const help = {
  main: `Mintfolio — 站点、文章、主题和配置管理

用法：mintfolio                 打开交互菜单（推荐）
      mintfolio [--cwd <目录>] <命令>

  create <目录> [--theme verdant]  创建站点并安装依赖
  init [--theme verdant]          把当前目录变成站点，已有文章保持原样
  upgrade [--version <版本>]       更新当前站点的 Core
  dev / build / preview / sync     开发、构建、预览或同步内容
  post new|list|publish|draft       创建和管理文章
  theme list|current|install|use   安装和切换主题
  theme init|check                 写入主题设置模板、校验主题
  config get|set|path|edit|schema   查看、修改或打开配置
  doctor                          检查站点环境与已安装版本
  check [--json]                  校验环境、主题、内容链接和图片
  --version                       显示 CLI 版本

使用 mintfolio <命令> --help 查看用法。命令缺少参数时会在终端里逐项询问；
--no-interactive（或在 CI、管道中运行）时不询问，直接报错。
站点根目录只放文章；站点资料、主题、独立页面和依赖都在 ${PROJECT_DIR}/ 中。
在站点任意子目录都可运行；--cwd / -C 指定其他站点。`,
  create: `用法：mintfolio create <空目录> [--theme <主题>] [--registry <URL>]

创建站点：文章放在该目录，配置和依赖安装到 ${PROJECT_DIR}/；--theme 可同时安装并启用主题。
--registry 只配置新站点的 @mintfolio 仓库，例如本地仓库地址。`,
  init: `用法：mintfolio init [--theme <主题>] [--registry <URL>]
把当前目录变成站点：创建 ${PROJECT_DIR}/，安装 Core，补齐 site.config.ts、theme.config.mjs 和示例页面。
已有的 Markdown 文章保持原样；只有目录里还没有文章时才添加示例文章。`,
  upgrade: '用法：mintfolio upgrade [--version <版本或标签>]\n从当前站点配置的 npm 仓库更新 Core，默认 latest。更新后请重新启动开发服务。',
  post: `用法：mintfolio post <操作>

  new [标题] [--slug <ID>] [--description <摘要>] [--category <分类>]
             [--tags <逗号分隔标签>] [--date YYYY-MM-DD] [--publish]
  list [--draft | --scheduled | --publishable] [--json]
  publish [ID]     将 draft 设为 false，到期后可参与构建
  draft [ID]       将 draft 设为 true

新文章默认是草稿，存放在站点根目录；ID 支持 notes/hello 等子目录。
在终端中省略标题或 ID 时会逐项询问或让你从列表中选择。
不会覆盖同名文件。publish 不执行构建或部署。
--published 是 --publishable 的兼容别名，表示非草稿且已到发布日期。
列表显示草稿、定时和可参与构建三种状态；同次列表使用同一检查时间。
示例：mintfolio post new "我的第一篇文章" --slug first-post --tags 随笔,生活`,
  theme: `用法：mintfolio theme <操作>

  list [--json]                   列出内置和已安装主题
  current                         显示当前配置中选定的主题
  install <包名[@版本]> [--use]    安装主题，可同时启用
  use [主题]                      选择 minimal、已安装包或本地主题目录，
                                  并把该主题带注释的设置写入 settings
  init                            settings 为空时写入当前主题的完整设置模板
  check [主题]                    校验清单、设置和页面路径

主题和主题设置都在 ${PROJECT_DIR}/theme.config.mjs；切换主题前的设置会保存在备份中。
verdant 是 @mintfolio/theme-verdant 的别名。
示例：mintfolio theme install verdant --use`,
  config: `用法：mintfolio config <操作> <site|theme>

  get <范围> [字段]               查看配置；theme 返回合并默认值后的设置
  set <范围> <字段> <值> [--json]  修改单项，保存前校验并备份
  path <范围>                     显示配置路径
  edit <范围> [--editor <程序>]    用编辑器打开配置
  schema <范围>                   查看可用字段和限制

theme 设置写在 theme.config.mjs 的 settings 中；get/schema 可加 --theme <主题> 查看其他主题。
字段用点号访问，例如 sidebar.quote.enabled；数组下标也用点号。
字符串直接填写；布尔值用 true/false，数组和对象用 JSON。
site 值按源文件读取；动态表达式显示为 $expression，不执行导入。
修改会保留周围注释，并在 ${PROJECT_DIR}/.backups 中备份原文件。

示例：mintfolio config set site site.title "我的博客"
      mintfolio config set theme initialPalette 3
      mintfolio config set theme sidebar.quote.enabled true`,
  doctor: '用法：mintfolio doctor [--json]\n检查 Node、当前站点 Core/Astro、主题与配置，不修改文件。',
  dev: '用法：mintfolio dev [--drafts] [Astro 参数]\n--drafts 仅在本地开发时显示草稿和未来文章，不写入生产构建。其他参数（如 --port）传给 Astro；--config 和 --root 由 Core 指定。',
  build: `用法：mintfolio build [Astro 参数]\n生成静态站点到 ${PROJECT_DIR}/dist，始终排除草稿和未到发布日期的文章；不接受 --drafts。`,
  preview: '用法：mintfolio preview [Astro 参数]\n预览已经生成的生产文件；不接受 --drafts。',
  sync: '用法：mintfolio sync [Astro 参数]\n同步内容并生成 Astro 类型；不接受 --drafts。',
  check: '用法：mintfolio check [--json]\n先检查环境与主题并运行 Astro sync，再检查 Markdown 的链接、图片、锚点和地址冲突。\n--json 将完整结果输出为一个 JSON 对象，Astro 日志写入 stderr。错误返回非零状态；警告不阻止构建。',
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

/**
 * A globally installed CLI hands the command to the Core installed in the site,
 * so every site runs the CLI version its own package.json locks.
 * @param {string} cwd Working directory. @param {string[]} argv Original arguments.
 * @returns {Promise<number|null>} Child exit code, or null when this CLI is already the site's.
 */
async function delegate(cwd, argv) {
  if (process.env.MINTFOLIO_DELEGATED) return null;
  let root;
  try { root = await findSite(cwd); } catch { return null; }
  const local = path.join(root, 'node_modules/@mintfolio/core/bin/mintfolio.mjs');
  if (!await exists(local) || await realpath(local) === await realpath(fileURLToPath(import.meta.url))) return null;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [local, ...argv], { cwd, stdio: 'inherit', env: { ...process.env, MINTFOLIO_DELEGATED: '1' }, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

/** @param {string[]} argv Raw process arguments. @returns {Promise<void>} Dispatch one command and propagate failures. */
async function main(argv) {
  const original = argv;
  const interactive = canPrompt(argv);
  argv = argv.filter(arg => arg !== '--no-interactive');
  let cwd = process.cwd();
  if (['--cwd', '-C'].includes(argv[0])) {
    if (!argv[1]) throw new Error('--cwd 需要目录。');
    cwd = path.resolve(argv[1]);
    argv = argv.slice(2);
  }
  let [command, ...args] = argv;
  if (['--version', '-v', 'version'].includes(command)) { console.log(await cliVersion()); return; }
  if (['help', '--help', '-h'].includes(command)) { printHelp(args[0] || 'main'); return; }
  if (command !== 'create') {
    const code = await delegate(cwd, original);
    if (code !== null) { process.exitCode = code; return; }
  }
  if (command === undefined) {
    if (!interactive) { printHelp(); return; }
    let root;
    try { root = await findSite(cwd); }
    catch (error) {
      if (!error.message.includes(PROJECT_DIR)) throw error;
      if (error.message.includes('旧的站点布局')) throw error;
      await setupMenu(cwd);
      return;
    }
    await siteMenu(root);
    return;
  }
  const aliases = { 'theme:add': 'install', 'theme:init': 'init', 'theme:check': 'check' };
  if (Object.hasOwn(aliases, command)) { args.unshift(aliases[command]); command = 'theme'; }
  if (command === 'new') { command = 'post'; args.unshift('new'); }

  if (command === 'create') {
    const parsed = options(args, { theme: { type: 'string' }, registry: { type: 'string' } });
    if (parsed.values.help) return printHelp(command);
    if (!parsed.positionals.length && interactive) { await setupMenu(cwd); return; }
    count(parsed.positionals, 1, 1, command);
    await createSite(path.resolve(cwd, parsed.positionals[0]), parsed.values);
    return;
  }
  if (command === 'init') {
    const parsed = options(args, { theme: { type: 'string' }, registry: { type: 'string' } });
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 0, 0, command);
    const root = await setupSite(cwd, parsed.values);
    console.log(`站点已就绪：${path.dirname(root)}`);
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
    if (args.includes('--help') || args.includes('-h')) return printHelp(command);
    const draftFlags = args.filter(arg => /^--drafts(?:=|$)/.test(arg));
    if (draftFlags.length && command !== 'dev') throw new Error('--drafts 仅适用于 mintfolio dev。');
    if (draftFlags.some(arg => arg !== '--drafts')) throw new Error('草稿预览请使用 mintfolio dev --drafts，不需要附加值。');
    const root = await findSite(cwd);
    await runAstro(root, command, args.filter(arg => arg !== '--drafts'), { drafts: draftFlags.length > 0 });
    return;
  }
  if (command === 'post') {
    const [action, ...rest] = args;
    if (!action || action === '--help' || action === '-h') return printHelp(command);
    const definitions = action === 'new' ? { slug: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, tags: { type: 'string' }, date: { type: 'string' }, publish: { type: 'boolean' } }
      : action === 'list' ? { draft: { type: 'boolean' }, scheduled: { type: 'boolean' }, publishable: { type: 'boolean' }, published: { type: 'boolean' }, json: { type: 'boolean' } } : {};
    const parsed = options(rest, definitions);
    if (parsed.values.help) return printHelp(command);
    if (!['new', 'list', 'publish', 'draft'].includes(action)) throw new Error(`未知文章操作：${action}`);
    const root = await findSite(cwd);
    if (action !== 'list' && !parsed.positionals.length && interactive) {
      if (action === 'new') { await promptNewPost(root, parsed.values); return; }
      const post = await pickPost(root, action === 'publish' ? '发布哪篇草稿？' : '把哪篇文章设为草稿？', post => post.draft === (action === 'publish'));
      if (!post) return;
      parsed.positionals.push(post.slug);
    }
    count(parsed.positionals, action === 'list' ? 0 : 1, action === 'list' ? 0 : 1, command);
    if (action === 'new') console.log(`已创建${parsed.values.publish ? '文章' : '草稿'}：${await createPost(root, parsed.positionals[0], parsed.values)}`);
    else if (action === 'list') {
      const states = [parsed.values.draft && 'draft', parsed.values.scheduled && 'scheduled', (parsed.values.publishable || parsed.values.published) && 'publishable'].filter(Boolean);
      if (states.length > 1) throw new Error('--draft、--scheduled 和 --publishable（或 --published）不能同时使用。');
      const posts = (await listPosts(root)).filter(post => !states.length || post.status === states[0]);
      if (parsed.values.json) console.log(JSON.stringify(posts, null, 2));
      else if (!posts.length) console.log('没有匹配的文章。');
      else {
        const labels = { draft: '草稿', scheduled: '定时', publishable: '可参与构建' };
        for (const post of posts) console.log(`${labels[post.status]}  ${post.publishedAt}  ${post.slug}  ${post.title}`);
      }
    } else {
      const result = await setDraft(root, parsed.positionals[0], action === 'draft');
      const message = result.status === 'draft' ? '已设为草稿'
        : result.status === 'scheduled' ? `已取消草稿，发布日期尚未到达（${result.publishedAt}）；到期后需重新构建`
        : '已取消草稿，可参与下一次构建';
      console.log(`${message}：${result.filename}`);
      if (result.backup) console.log(`备份：${result.backup}`);
    }
    return;
  }
  if (command === 'theme') {
    const [action, ...rest] = args;
    if (!action || action === '--help' || action === '-h') return printHelp(command);
    const parsed = options(rest, action === 'install' ? { use: { type: 'boolean' } } : action === 'list' ? { json: { type: 'boolean' } } : {});
    if (parsed.values.help) return printHelp(command);
    if (action === 'sync') throw new Error('theme sync 已移除：主题设置统一写在 theme.config.mjs 的 settings 中。');
    if (!['list', 'current', 'install', 'use', 'init', 'check'].includes(action)) throw new Error(`未知主题操作：${action}`);
    const root = await findSite(cwd);
    if (action === 'use' && !parsed.positionals.length && interactive) { await requireThemeConfigRuntime(root); await chooseTheme(root); return; }
    const required = ['install', 'use'].includes(action);
    count(parsed.positionals, required ? 1 : 0, ['install', 'use', 'check'].includes(action) ? 1 : 0, command);
    if (action === 'list') {
      const themes = await listThemes(root);
      if (parsed.values.json) console.log(JSON.stringify(themes, null, 2));
      else for (const theme of themes) console.log(`${theme.selected ? '*' : ' '} ${theme.name}  ${theme.version}`);
    } else if (action === 'current') console.log((await activeTheme(root)).selector);
    else if (action === 'install') await installTheme(root, parsed.positionals[0], parsed.values.use);
    else if (action === 'use') { await requireThemeConfigRuntime(root); await useTheme(root, parsed.positionals[0]); }
    else if (action === 'init') {
      const result = await initThemeSettings(root);
      console.log(result.created ? `已写入主题设置模板：${result.filename}` : `settings 已有内容，保持不变：${result.filename}`);
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
    if (['set', 'edit', 'path'].includes(action) && parsed.values.theme) throw new Error('theme.config.mjs 只保存当前主题的设置；修改其他主题请先运行 mintfolio theme use <主题>。');
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
      else await editFile(filename, parsed.values.editor, root);
    }
    return;
  }
  if (command === 'doctor' || command === 'check') {
    const parsed = options(args, { json: { type: 'boolean' } });
    if (parsed.values.help) return printHelp(command);
    count(parsed.positionals, 0, 0, command);
    const root = await findSite(cwd);
    if (command === 'doctor') {
      const result = await doctor(root);
      console.log(parsed.values.json ? JSON.stringify(result, null, 2) : environmentText(result));
      return;
    }
    await runCheck(root, { json: parsed.values.json });
    return;
  }
  throw new Error(`未知命令：${command}\n运行 mintfolio --help 查看可用命令。`);
}

try { await main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`[mintfolio] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = error.exitCode || 1;
}
