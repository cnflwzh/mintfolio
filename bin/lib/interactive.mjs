import path from 'node:path';
import * as p from '@clack/prompts';
import { createPost, listPosts, postPath, postTaxonomy, setDraft, slugFromTitle } from './posts.mjs';
import { activeTheme, installTheme, listThemes, packageSpec, useTheme } from './themes.mjs';
import { configFilename, getConfig, setConfig } from './config.mjs';
import { createSite, doctor, setupSite } from './site.mjs';
import { editFile, npm } from './process.mjs';
import { environmentText, runAstro, runCheck } from './commands.mjs';
import { getIn } from './files.mjs';
import { PROJECT_DIR, siteRootOf } from '../../src/shared/layout.mjs';

p.updateSettings({ messages: { cancel: '已取消', error: '出错了' } });
// Prompt text already says which keys to press; the library's English hints are hidden.
const select = opts => p.select({ showInstructions: false, ...opts });
const multiselect = opts => p.multiselect({ showInstructions: false, ...opts });
const confirm = opts => p.confirm({ active: '是', inactive: '否', ...opts });

/** Thrown when the user cancels a prompt; menus return to their parent. */
class Cancelled extends Error {}

/**
 * Whether prompts may be shown. CI, pipes and --no-interactive keep the CLI fully scriptable.
 * @param {string[]} argv Raw arguments, checked for --no-interactive.
 * @returns {boolean}
 */
export function canPrompt(argv = []) {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !p.isCI() && !argv.includes('--no-interactive');
}

/** @template T @param {Promise<T|symbol>} prompt @returns {Promise<T>} The answer, or a Cancelled error on Esc/Ctrl+C. */
async function ask(prompt) {
  const value = await prompt;
  if (p.isCancel(value)) throw new Cancelled();
  return value;
}

const STATUS = { draft: '草稿', scheduled: '定时', publishable: '已发布' };
const BACK = Symbol('back');

/**
 * Ask for everything a new article needs; flags already given are not asked again.
 * @param {string} root Project folder.
 * @param {{title?:string,slug?:string,description?:string,category?:string,tags?:string,date?:string,publish?:boolean}} [given]
 * @returns {Promise<string>} Created filename.
 */
export async function promptNewPost(root, given = {}) {
  const title = given.title ?? await ask(p.text({ message: '文章标题', placeholder: '例如：周末去海边', validate: value => value?.trim() ? undefined : '标题不能为空' }));
  const suggested = slugFromTitle(title);
  const slug = (given.slug ?? await ask(p.text({
    message: '文件名（也是文章地址），可包含子目录',
    placeholder: suggested,
    defaultValue: suggested,
    validate: value => { try { postPath(value || suggested); return undefined; } catch (error) { return error.message; } },
  }))) || suggested;
  const { categories, tags: knownTags } = await postTaxonomy(root);
  let category = given.category;
  if (category === undefined) {
    const NEW = Symbol('new');
    const choice = await ask(select({
      message: '分类',
      options: [...categories.map(value => ({ value, label: value })), { value: NEW, label: '新分类…' }, { value: '', label: '不设置' }],
      maxItems: 10,
    }));
    category = choice === NEW ? await ask(p.text({ message: '新分类名称', validate: value => value?.trim() ? undefined : '请输入名称' })) : choice;
  }
  let tags = given.tags;
  if (tags === undefined) {
    const picked = knownTags.length ? await ask(multiselect({ message: '标签（空格选择，回车确认）', options: knownTags.map(value => ({ value, label: value })), required: false, maxItems: 10 })) : [];
    const extra = await ask(p.text({ message: '其他标签（逗号分隔，可留空）', placeholder: '例如：随笔, 生活', defaultValue: '' }));
    tags = [...picked, ...extra.split(/[,，]/).map(tag => tag.trim()).filter(Boolean)].join(',');
  }
  const description = given.description ?? await ask(p.text({ message: '一句话摘要（可留空）', defaultValue: '' }));
  const publish = given.publish ?? await ask(confirm({ message: '现在就发布吗？选否会保存为草稿', initialValue: false }));
  const filename = await createPost(root, title, { ...given, slug, category, tags, description, publish });
  p.log.success(`已创建${publish ? '文章' : '草稿'}：${path.relative(siteRootOf(root), filename)}`);
  if (await ask(confirm({ message: '用编辑器打开它吗？', initialValue: true }))) await editFile(filename, undefined, root);
  return filename;
}

/**
 * Choose one article from the site.
 * @param {string} root Project folder. @param {string} message Prompt text.
 * @param {(post:object)=>boolean} [filter] Optional subset, e.g. drafts only.
 * @returns {Promise<object|null>} Selected listPosts entry, or null when none match.
 */
export async function pickPost(root, message, filter = () => true) {
  const posts = (await listPosts(root)).filter(filter);
  if (!posts.length) { p.log.info('没有符合条件的文章。'); return null; }
  const options = posts.map(post => ({ value: post, label: post.title, hint: `${STATUS[post.status]} · ${post.date} · ${post.slug}` }));
  return ask(posts.length > 12
    ? p.autocomplete({ message, options, placeholder: '输入标题或文件名搜索', maxItems: 10 })
    : select({ message, options, maxItems: 12 }));
}

async function managePosts(root) {
  const post = await pickPost(root, '选择文章');
  if (!post) return;
  const filename = path.join(siteRootOf(root), postPath(post.slug));
  const action = await ask(select({
    message: `「${post.title}」· ${STATUS[post.status]}`,
    options: [
      { value: 'open', label: '用编辑器打开' },
      post.draft ? { value: 'publish', label: '发布', hint: '取消草稿，参与下一次构建' } : { value: 'draft', label: '设为草稿', hint: '下一次构建时从网站移除' },
      { value: BACK, label: '返回' },
    ],
  }));
  if (action === 'open') await editFile(filename, undefined, root);
  else if (action === 'publish' || action === 'draft') {
    const result = await setDraft(root, post.slug, action === 'draft');
    p.log.success(result.status === 'draft' ? '已设为草稿' : result.status === 'scheduled' ? `已取消草稿，将在 ${result.publishedAt} 之后的构建中发布` : '已取消草稿，下一次构建时发布');
  }
}

/**
 * Pick and switch to a theme; installs npm themes on request.
 * @param {string} root Project folder.
 * @returns {Promise<void>}
 */
export async function chooseTheme(root) {
  const themes = await listThemes(root);
  const OTHER = Symbol('other');
  const options = themes.map(theme => ({ value: theme.name, label: theme.name, hint: theme.selected ? `当前 · ${theme.version}` : theme.version }));
  if (!themes.some(theme => theme.name === '@mintfolio/theme-verdant')) options.push({ value: 'verdant', label: '@mintfolio/theme-verdant', hint: '官方主题，需要安装' });
  options.push({ value: OTHER, label: '安装其他 npm 主题…' });
  let choice = await ask(select({ message: '选择主题', options, initialValue: themes.find(theme => theme.selected)?.name }));
  if (choice === OTHER) choice = await ask(p.text({ message: 'npm 包名', placeholder: '@scope/theme-name', validate: value => { try { packageSpec(value || ''); return undefined; } catch (error) { return error.message; } } }));
  if (!themes.some(theme => theme.name === choice) && choice !== 'minimal') {
    p.log.step(`正在安装 ${choice}…`);
    await installTheme(root, choice, true);
  } else await useTheme(root, choice);
}

/** @param {object} setting Schema entry. @param {unknown} value Current value. @returns {string} Short display of a current value. */
function describe(setting, value) {
  if (setting.type === 'object') return '…';
  if (setting.type === 'array') return `${Array.isArray(value) ? value.length : 0} 项`;
  if (setting.type === 'boolean') return value ? '开' : '关';
  const text = String(value ?? '');
  return text.length > 24 ? `${text.slice(0, 24)}…` : text || '（空）';
}

/** @param {object} setting Schema entry. @param {unknown} current @returns {Promise<unknown>} New value of the setting's type. */
async function promptSetting(setting, current) {
  const message = setting.description ? `${setting.label}：${setting.description}` : setting.label;
  if (setting.type === 'select') return ask(select({ message, options: setting.options.map(value => ({ value, label: String(value) })), initialValue: current }));
  if (setting.type === 'boolean') return ask(confirm({ message, initialValue: Boolean(current) }));
  if (setting.type === 'number') {
    const value = await ask(p.text({ message, initialValue: String(current ?? ''), validate: input => {
      const number = Number(input);
      if (input === '' || !Number.isFinite(number)) return '请输入数字';
      if (setting.min !== undefined && number < setting.min) return `不能小于 ${setting.min}`;
      if (setting.max !== undefined && number > setting.max) return `不能大于 ${setting.max}`;
      return undefined;
    } }));
    return Number(value);
  }
  return ask(p.text({ message, initialValue: String(current ?? '') }));
}

/**
 * Browse the active theme's settings schema and edit one value at a time.
 * Lists stay in the editor, where their structure is visible.
 * @param {string} root Project folder.
 */
export async function editThemeSettings(root) {
  const keys = [];
  while (true) {
    const active = await activeTheme(root);
    let schema = active.definition.settings;
    for (const key of keys) schema = schema[key].properties;
    if (!Object.keys(schema).length) { p.log.info('当前主题没有可调整的设置。'); return; }
    const values = getIn(active.settings, keys) ?? {};
    const key = await ask(select({
      message: keys.length ? `主题设置 › ${keys.join(' › ')}` : `主题设置 · ${active.definition.manifest.name}`,
      options: [...Object.entries(schema).map(([name, setting]) => ({ value: name, label: setting.label || name, hint: describe(setting, values[name]) })), { value: BACK, label: keys.length ? '← 上一级' : '← 返回' }],
      maxItems: 12,
    }));
    if (key === BACK) { if (!keys.length) return; keys.pop(); continue; }
    const setting = schema[key];
    if (setting.type === 'object') { keys.push(key); continue; }
    if (setting.type === 'array') {
      p.note(`列表类设置（例如 ${[...keys, key].join('.')}）请在 theme.config.mjs 中直接编辑，模板里有示例。`, setting.label);
      if (await ask(confirm({ message: '现在打开 theme.config.mjs 吗？' }))) await editFile(await configFilename(root, 'theme'), undefined, root);
      continue;
    }
    try {
      const value = await promptSetting(setting, values[key]);
      await setConfig(root, 'theme', [...keys, key].join('.'), typeof value === 'string' ? value : JSON.stringify(value));
      p.log.success(`${setting.label} 已更新`);
    } catch (error) {
      if (error instanceof Cancelled) continue;
      p.log.error(error.message);
    }
  }
}

const SITE_FIELDS = [
  ['site.title', '网站标题'], ['site.description', '网站描述'], ['site.url', '正式网址'], ['site.language', '语言'],
  ['profile.name', '作者名'], ['profile.bio', '个人简介'], ['profile.location', '所在地'], ['profile.signature', '个性签名'],
  ['contact.email', '联系邮箱'], ['icp', 'ICP 备案号'],
];

async function editSite(root) {
  while (true) {
    const options = [];
    for (const [key, label] of SITE_FIELDS) {
      let value;
      try { value = await getConfig(root, 'site', key); } catch { value = ''; }
      const dynamic = value && typeof value === 'object';
      options.push({ value: key, label, hint: dynamic ? '使用表达式，请在编辑器中修改' : describe({}, value), disabled: dynamic });
    }
    options.push({ value: 'edit', label: '用编辑器打开 site.config.ts', hint: '社交链接、项目、作者等列表' }, { value: BACK, label: '← 返回' });
    const key = await ask(select({ message: '站点资料', options, maxItems: 14 }));
    if (key === BACK) return;
    if (key === 'edit') { await editFile(await configFilename(root, 'site'), undefined, root); continue; }
    let current = '';
    try { current = String(await getConfig(root, 'site', key)); } catch {}
    try {
      const value = await ask(p.text({ message: SITE_FIELDS.find(([name]) => name === key)[1], initialValue: current }));
      await setConfig(root, 'site', key, value);
      p.log.success('已保存');
    } catch (error) {
      if (error instanceof Cancelled) continue;
      p.log.error(error.message);
    }
  }
}

/** @param {string} root Project folder. @returns {Promise<string>} Menu hint summarising articles. */
async function postSummary(root) {
  try {
    const posts = await listPosts(root);
    const drafts = posts.filter(post => post.status === 'draft').length;
    return `${posts.length} 篇${drafts ? `，${drafts} 篇草稿` : ''}`;
  } catch (error) { return `读取失败：${error.message}`; }
}

/**
 * The menu shown by `mintfolio` without arguments inside a site.
 * @param {string} root Project folder.
 * @returns {Promise<void>} Resolves when the user leaves or starts a long-running server.
 */
export async function siteMenu(root) {
  let title = '';
  try { title = String(await getConfig(root, 'site', 'site.title')); } catch {}
  p.intro(`Mintfolio${title ? ` · ${title}` : ''}`);
  while (true) {
    let action;
    try {
      action = await ask(select({
        message: '想做什么？',
        options: [
          { value: 'new', label: '写一篇新文章' },
          { value: 'posts', label: '管理文章', hint: await postSummary(root) },
          { value: 'dev', label: '本地预览', hint: '边写边看，按 Ctrl+C 结束' },
          { value: 'build', label: '构建网站', hint: `生成 ${PROJECT_DIR}/dist` },
          { value: 'theme', label: '主题与外观' },
          { value: 'site', label: '站点资料' },
          { value: 'check', label: '检查内容', hint: '链接、图片和地址冲突' },
          { value: 'more', label: '更多…' },
          { value: 'exit', label: '退出' },
        ],
      }));
    } catch (error) {
      if (error instanceof Cancelled) break;
      throw error;
    }
    if (action === 'exit') break;
    try {
      if (action === 'new') await promptNewPost(root);
      else if (action === 'posts') await managePosts(root);
      else if (action === 'dev') {
        const drafts = await ask(confirm({ message: '同时显示草稿和未到发布日期的文章吗？', initialValue: true }));
        p.outro('正在启动本地预览…');
        await runAstro(root, 'dev', [], { drafts });
        return;
      } else if (action === 'build') {
        await runAstro(root, 'build');
        p.log.success(`构建完成，产物在 ${PROJECT_DIR}/dist。`);
      } else if (action === 'theme') {
        const choice = await ask(select({ message: '主题与外观', options: [
          { value: 'settings', label: '调整主题设置', hint: '配色、首页、侧栏等' },
          { value: 'switch', label: '切换主题' },
          { value: 'edit', label: '用编辑器打开 theme.config.mjs' },
          { value: BACK, label: '← 返回' },
        ] }));
        if (choice === 'settings') await editThemeSettings(root);
        else if (choice === 'switch') await chooseTheme(root);
        else if (choice === 'edit') await editFile(await configFilename(root, 'theme'), undefined, root);
      } else if (action === 'site') await editSite(root);
      else if (action === 'check') await runCheck(root);
      else if (action === 'more') {
        const choice = await ask(select({ message: '更多', options: [
          { value: 'preview', label: '预览构建结果', hint: '查看最近一次 build 的产物' },
          { value: 'doctor', label: '环境检查' },
          { value: 'upgrade', label: '升级 Core', hint: '更新到最新版本' },
          { value: BACK, label: '← 返回' },
        ] }));
        if (choice === 'preview') { p.outro('正在启动构建结果预览…'); await runAstro(root, 'preview'); return; }
        if (choice === 'doctor') p.note(environmentText(await doctor(root)), '环境');
        if (choice === 'upgrade') { await npm(['install', '@mintfolio/core@latest', '--no-audit'], root); p.log.success('Core 已更新。重新运行 mintfolio 即可使用新版本。'); return; }
      }
    } catch (error) {
      if (error instanceof Cancelled) continue;
      p.log.error(error.message);
    }
  }
  p.outro('下次见。');
}

/** @returns {Promise<string|undefined>} Theme to install with a new site, or undefined for Minimal. */
async function initialTheme() {
  const theme = await ask(select({ message: '使用哪个主题？', options: [
    { value: 'verdant', label: 'Verdant', hint: '官方主题，个人主页 + 博客' },
    { value: 'minimal', label: 'Minimal', hint: 'Core 内置的简洁主题' },
  ] }));
  return theme === 'minimal' ? undefined : theme;
}

/**
 * The menu shown outside a site: turn this folder into a site or create a new one.
 * @param {string} cwd Working directory.
 * @returns {Promise<void>}
 */
export async function setupMenu(cwd) {
  p.intro('Mintfolio');
  try {
    const action = await ask(select({
      message: '当前目录还不是 Mintfolio 站点。要怎么做？',
      options: [
        { value: 'here', label: '把当前目录变成站点', hint: `文章留在这里，配置放进 ${PROJECT_DIR}/` },
        { value: 'new', label: '新建一个站点目录' },
        { value: 'exit', label: '退出' },
      ],
    }));
    if (action === 'exit') { p.outro('下次见。'); return; }
    const directory = action === 'here' ? cwd : path.resolve(cwd, await ask(p.text({ message: '新站点目录', placeholder: 'my-blog', validate: value => value?.trim() ? undefined : '请输入目录名' })));
    const theme = await initialTheme();
    const root = action === 'here' ? await setupSite(directory, { theme }) : await createSite(directory, { theme });
    p.outro(`站点已就绪：${siteRootOf(root)}\n${action === 'new' ? `进入该目录后` : ''}运行 mintfolio 打开菜单。`);
  } catch (error) {
    if (error instanceof Cancelled) { p.outro('已取消。'); return; }
    throw error;
  }
}

export { Cancelled, ask };
