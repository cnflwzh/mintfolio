import { astroEntry, run } from './process.mjs';
import { astroArgs, prepareRuntime } from './runtime.mjs';
import { doctor } from './site.mjs';
import { checkContent } from './content-check.mjs';
import { siteRootOf } from '../../src/shared/layout.mjs';

/**
 * Run one Astro command against the project folder with Core's generated config.
 * @param {string} root Project folder (_mintfolio).
 * @param {'dev'|'build'|'preview'|'sync'} command Astro command.
 * @param {string[]} [args] Extra Astro arguments such as --port.
 * @param {{drafts?:boolean,stdio?:'inherit'|'stderr'}} [options] Draft preview only applies to dev.
 * @returns {Promise<void>} Rejects when Astro exits with a failure.
 */
export async function runAstro(root, command, args = [], options = {}) {
  const config = await prepareRuntime(root);
  // Preview intent is explicit per command. Never inherit it into a build.
  const drafts = command === 'dev' && options.drafts;
  await run(process.execPath, [astroEntry(root), ...astroArgs(command, args, config)], root, { stdio: options.stdio, env: { MINTFOLIO_PREVIEW_DRAFTS: drafts ? '1' : undefined } });
}

/** @param {object} result doctor() output. @returns {string} Human-readable environment summary. */
export function environmentText(result) {
  return `环境检查通过\n站点：${siteRootOf(result.root)}\nNode ${result.node} · Core ${result.core} · Astro ${result.astro}\n主题：${result.theme} ${result.themeVersion}\n配置：${result.config}`;
}

/**
 * Check the environment, run Astro sync, then inspect article and page sources.
 * @param {string} root Project folder (_mintfolio).
 * @param {{json?:boolean}} [options] JSON mode keeps stdout to one document and sends Astro logs to stderr.
 * @returns {Promise<{status:'ok'|'error',environment:object,sync:object,content:object}>}
 *   Sets process.exitCode on errors; warnings do not fail.
 */
export async function runCheck(root, options = {}) {
  const json = Boolean(options.json);
  const result = { status: 'ok', environment: null, sync: { status: 'skipped' }, content: null };
  try {
    result.environment = await doctor(root);
    if (!json) console.log(environmentText(result.environment));
  } catch (error) {
    result.status = 'error';
    result.environment = { status: 'error', message: error.message };
  }
  if (result.environment.status === 'ok') {
    try {
      await runAstro(root, 'sync', [], { stdio: json ? 'stderr' : 'inherit' });
      result.sync = { status: 'ok' };
    } catch (error) {
      result.status = 'error';
      result.sync = { status: 'error', message: error.message };
    }
  }
  // Source diagnostics still help when Astro rejects a collection schema.
  try {
    result.content = await checkContent(siteRootOf(root));
    if (result.content.errors.length) result.status = 'error';
  } catch {
    result.status = 'error';
    result.content = { errors: [{ code: 'CONTENT_CHECK_FAILED', file: '.', line: 1, column: 1, message: '无法读取文章或页面目录，请检查路径及访问权限。' }], warnings: [], counts: null };
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    if (result.environment.status === 'error') console.error(`环境检查失败：${result.environment.message}`);
    if (result.sync.status === 'error') console.error(`Astro sync 失败：${result.sync.message}`);
    for (const item of result.content.errors) console.error(`${item.file}:${item.line}:${item.column} ${item.code} ${item.message}`);
    for (const item of result.content.warnings) console.warn(`${item.file}:${item.line}:${item.column} ${item.code} ${item.message}`);
    console.log(`内容检查：${result.content.counts?.files ?? 0} 个文件，${result.content.errors.length} 个错误，${result.content.warnings.length} 个警告。`);
  }
  if (result.status === 'error') process.exitCode = 1;
  return result;
}
