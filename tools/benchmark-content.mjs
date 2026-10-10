import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const defaultCore = fileURLToPath(new URL('..', import.meta.url));
const usage = `Usage: node tools/benchmark-content.mjs [options]
  --counts 100,1000       Public Markdown articles per independent build (default)
  --paragraphs 20         Deterministic mixed Chinese/English paragraphs per article
  --iterations 25         Measured iterations per search case, after 3 warmups
  --output-dir PATH       Parent of a new retained run directory (default: OS temp)
  --core-root PATH        Core checkout containing built dist and installed dependencies
  --label NAME            Report label, e.g. before-routing or final
  --help                 Print options; no files are written
No npm install, source edits, cleanup, network request, or shared fixture build occurs.`;

/** Parse CLI values before creating files. Invalid/unknown flags fail clearly. */
function options(args) {
  const values = { counts: '100,1000', paragraphs: '20', iterations: '25', 'output-dir': os.tmpdir(), 'core-root': defaultCore, label: 'current' };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--help') return null;
    const key = args[i].slice(2);
    assert.ok(args[i].startsWith('--') && Object.hasOwn(values, key), `Unknown option: ${args[i]}`);
    assert.ok(args[i + 1] && !args[i + 1].startsWith('--'), `Missing value for ${args[i]}`);
    values[key] = args[++i];
  }
  const integer = (value, name, maximum) => {
    assert.match(value, /^\d+$/, `${name} must be a positive integer`);
    const number = Number(value);
    assert.ok(Number.isSafeInteger(number) && number > 0 && number <= maximum, `${name} must be 1-${maximum}`);
    return number;
  };
  return {
    counts: [...new Set(values.counts.split(',').map(value => integer(value, 'counts', 10000)))],
    paragraphs: integer(values.paragraphs, 'paragraphs', 200),
    iterations: integer(values.iterations, 'iterations', 1000),
    parent: path.resolve(values['output-dir']), core: path.resolve(values['core-root']), label: values.label,
  };
}

/** Resolve destinations strictly below the newly created run directory. */
function inside(root, ...parts) {
  const filename = path.resolve(root, ...parts);
  const relative = path.relative(root, filename);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Path escapes run directory: ${filename}`);
  return filename;
}

/** Hash actual snapshot files in stable path order, including filenames and bytes. */
async function fingerprint(directory) {
  const hash = createHash('sha256');
  async function visit(folder) {
    const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        hash.update(path.relative(directory, filename).split(path.sep).join('/') + '\0');
        hash.update(await readFile(filename));
        hash.update('\0');
      }
    }
  }
  await visit(directory);
  return hash.digest('hex');
}

/**
 * Freeze Core/SDK source and compiled exports, reuse other already-installed
 * dependencies by directory links. Windows junctions do not require symlink mode.
 * Sources and dependency targets are never edited or removed by this tool.
 */
async function snapshot(root, core) {
  const dependencyRoot = path.join(core, 'node_modules');
  const require = createRequire(path.join(core, 'package.json'));
  const sdk = await realpath(path.join(dependencyRoot, '@mintfolio', 'theme-api'));
  const modules = inside(root, 'node_modules');
  const coreCopy = inside(root, 'packages', 'core');
  const sdkCopy = inside(root, 'packages', 'theme-api');
  await mkdir(modules, { recursive: true });
  for (const [source, destination, entries] of [[core, coreCopy, ['package.json', 'src', 'dist', 'bin']], [sdk, sdkCopy, ['package.json', 'src', 'dist']]]) {
    await mkdir(destination, { recursive: true });
    for (const entry of entries) await cp(path.join(source, entry), path.join(destination, entry), { recursive: true });
  }
  const link = async (source, destination) => {
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(await realpath(source), destination, process.platform === 'win32' ? 'junction' : 'dir');
  };
  for (const entry of await readdir(dependencyRoot, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
    if (entry.name.startsWith('@')) {
      for (const child of await readdir(path.join(dependencyRoot, entry.name), { withFileTypes: true })) {
        if (entry.name === '@mintfolio' && ['core', 'theme-api'].includes(child.name)) continue;
        if (child.isDirectory() || child.isSymbolicLink()) await link(path.join(dependencyRoot, entry.name, child.name), inside(root, 'node_modules', entry.name, child.name));
      }
    } else await link(path.join(dependencyRoot, entry.name), inside(root, 'node_modules', entry.name));
  }
  await link(coreCopy, inside(root, 'node_modules', '@mintfolio', 'core'));
  await link(sdkCopy, inside(root, 'node_modules', '@mintfolio', 'theme-api'));
  const corePackage = JSON.parse(await readFile(path.join(coreCopy, 'package.json'), 'utf8'));
  const sdkPackage = JSON.parse(await readFile(path.join(sdkCopy, 'package.json'), 'utf8'));
  const astroRoot = path.dirname(require.resolve('astro/package.json'));
  const astroPackage = JSON.parse(await readFile(path.join(astroRoot, 'package.json'), 'utf8'));
  const astroBin = typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro;
  return {
    cli: path.join(astroRoot, astroBin), searchModule: path.join(sdkCopy, 'dist', 'search.js'),
    versions: { core: corePackage.version, themeApi: sdkPackage.version, astro: astroPackage.version },
    hashes: { coreSnapshotSha256: await fingerprint(coreCopy), themeApiSnapshotSha256: await fingerprint(sdkCopy), packageLockSha256: createHash('sha256').update(await readFile(path.join(core, 'package-lock.json'))).digest('hex') },
  };
}

/** Stable public content only: fixed dates, 5 categories, 10 topics and 5 series. */
function article(index, paragraphs) {
  const id = String(index).padStart(6, '0');
  const date = new Date(Date.UTC(2020, 0, 1) + (index % 366) * 86400000).toISOString().slice(0, 10);
  const content = [`---`, `title: "工程记录 ${id}"`, `pubDate: ${date}`, `description: "公开内容基准文章 ${id}，用于检查构建与搜索规模。"`, `category: "分类-${index % 5}"`, `tags: ["topic-${index % 10}", "benchmark"]`, `series: "series-${index % 5}"`, `seriesOrder: ${index}`, `---`, '', `## 内容发布 ${id}`, '', `这篇文章的唯一正文标记是 marker${id}。`, ''];
  for (let paragraph = 0; paragraph < paragraphs; paragraph += 1) {
    if (paragraph % 5 === 0) content.push(`### 实践步骤 ${paragraph + 1}`, '');
    content.push(`工程记录第 ${index} 篇的第 ${paragraph + 1} 段讨论内容发布与长期维护。文章应提供清楚的导航、可访问的链接和稳定的阅读体验。We compare content publishing, static rendering, search relevance, and predictable build costs. A useful benchmark keeps inputs deterministic while changing the amount of public content.`, '');
  }
  content.push('```js', `const example = ${index}; // fenced code does not belong in searchable prose`, '```', '');
  return content.join('\n');
}

/** Create a real consuming site using only Core public exports and Minimal. */
async function fixture(runRoot, count, paragraphs) {
  const root = inside(runRoot, `posts-${count}`);
  await mkdir(path.join(root, 'content', 'blog'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  await mkdir(path.join(root, 'public'), { recursive: true });
  const files = {
    'package.json': JSON.stringify({ name: `mintfolio-benchmark-${count}`, private: true, type: 'module', dependencies: { '@mintfolio/core': '*' } }),
    'theme.config.mjs': `export default { theme: 'minimal' };\n`,
    'astro.config.mjs': `import { defineConfig } from 'astro/config';\nimport mintfolio from '@mintfolio/core';\nexport default defineConfig({ integrations: [mintfolio({ theme: 'minimal' })] });\n`,
    'site.config.ts': `import { defineSiteConfig } from '@mintfolio/core/config';\nexport default defineSiteConfig({site:{title:'Content benchmark',description:'Deterministic public Markdown corpus',url:'https://benchmark.example',language:'zh-CN'},profile:{name:'Benchmark author'},blog:{pageSize:10,timezone:'UTC'},feed:{limit:50,content:'summary'}});\n`,
    'src/content.config.ts': `import { createBlogCollection } from '@mintfolio/core/content';\nexport const collections = { blog: createBlogCollection() };\n`,
  };
  for (const [relative, source] of Object.entries(files)) await writeFile(path.join(root, relative), source);
  let markdownBytes = 0;
  for (let index = 0; index < count; index += 1) {
    const source = article(index, paragraphs);
    markdownBytes += Buffer.byteLength(source);
    await writeFile(path.join(root, 'content', 'blog', `post-${String(index).padStart(6, '0')}.md`), source);
  }
  return { root, markdownBytes };
}

/** Measure a fresh Astro build; memory covers this process, including worker threads, but not child processes. */
async function build(root, cli, probe) {
  const memoryFile = path.join(root, 'build-memory.json');
  const started = performance.now();
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', MINTFOLIO_BENCH_MEMORY: memoryFile, MINTFOLIO_THEME: 'minimal' };
  delete env.MINTFOLIO_PREVIEW_DRAFTS;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(probe).href, cli, 'build'], { cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
  const elapsedMs = performance.now() - started;
  await writeFile(path.join(root, 'build.log'), result.output);
  const memory = await readFile(memoryFile, 'utf8').then(JSON.parse).catch(() => null);
  const astroSummary = result.output.match(/(\d+) page\(s\) built in ([^\r\n]+)/);
  // Astro switches from fractional seconds to "1m 10s" for longer builds.
  const durationParts = [...(astroSummary?.[2] ?? '').matchAll(/([\d.]+)(ms|h|m|s)\b/g)];
  const factors = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  const astroReported = astroSummary && durationParts.length ? { htmlPages: Number(astroSummary[1]), elapsedMs: durationParts.reduce((total, part) => total + Number(part[1]) * factors[part[2]], 0), formattedDuration: astroSummary[2].trim() } : null;
  return { exitCode: result.code, signal: result.signal, elapsedMs, astroReported, memory, errorTail: result.code === 0 ? undefined : result.output.split('\n').slice(-35).join('\n') };
}

/** Record percentiles without timing fixture creation, JSON parsing or imports. */
function timings(operation, iterations) {
  for (let index = 0; index < 3; index += 1) operation();
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    operation();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const percentile = fraction => samples[Math.max(0, Math.ceil(samples.length * fraction) - 1)];
  return { iterations, minMs: samples[0], medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: samples.at(-1), meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length };
}

/** Exercise the shipped pure functions and the widget's first-20-result path. */
function searchBench(payload, api, iterations) {
  const queries = [
    { name: 'common-cjk', filters: { q: '内容发布' } },
    { name: 'english-terms', filters: { q: 'content publishing' } },
    { name: 'unique-body', filters: { q: 'marker000000' } },
    { name: 'no-match', filters: { q: 'nonexistentbenchmarktoken' } },
    { name: 'tag-only', filters: { tag: 'topic-0' } },
  ];
  return queries.map(({ name, filters }) => ({
    name, filters, matches: api.rankSearchResults(payload.index, filters).length,
    rank: timings(() => api.rankSearchResults(payload.index, filters), iterations),
    rankAndFirst20Highlights: timings(() => api.searchWithHighlights(api.rankSearchResults(payload.index, filters).slice(0, 20), filters), iterations),
  }));
}

async function main() {
  const selected = options(process.argv.slice(2));
  if (!selected) { console.log(usage); return; }
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || (major === 22 && minor >= 12), 'Node.js >=22.12.0 is required');
  const core = await realpath(selected.core);
  await stat(path.join(core, 'dist', 'public', 'config.js'));
  await mkdir(selected.parent, { recursive: true });
  const parent = await realpath(selected.parent);
  const runRoot = await mkdtemp(path.join(parent, 'mintfolio-benchmark-'));
  const report = { version: 1, label: selected.label, createdAt: new Date().toISOString(), runRoot, sourceCore: core, environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, totalSystemMemoryBytes: os.totalmem() }, corpus: { version: 1, counts: selected.counts, paragraphsPerPost: selected.paragraphs, theme: 'minimal', protectedPosts: 0, images: 0, pageSize: 10 }, results: [] };
  const reportFile = inside(runRoot, 'benchmark.json');
  const save = () => writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
  await save();
  console.log(`[benchmark] Retaining fixtures and results at ${runRoot}`);
  const frozen = await snapshot(runRoot, core);
  report.packages = frozen.versions;
  report.hashes = frozen.hashes;
  await save();
  const probe = inside(runRoot, 'measure-build-memory.mjs');
  await writeFile(probe, `import { writeFileSync } from 'node:fs';\nlet peak = process.memoryUsage().rss;\nconst sample = () => { peak = Math.max(peak, process.memoryUsage().rss); };\nconst timer = setInterval(sample, 100);\ntimer.unref();\nprocess.on('exit', () => {\n  sample();\n  const resourcePeak = process.resourceUsage().maxRSS * 1024;\n  const result = { scope: 'Astro main process including worker threads; excludes child processes', sampleIntervalMs: 100, sampledPeakRssBytes: peak, resourceUsageMaxRssBytes: resourcePeak > 0 ? resourcePeak : null, peakRssBytes: Math.max(peak, resourcePeak) };\n  try { writeFileSync(process.env.MINTFOLIO_BENCH_MEMORY, JSON.stringify(result, null, 2) + '\\n'); } catch {}\n});\n`);
  const api = await import(pathToFileURL(frozen.searchModule).href);
  for (const count of selected.counts) {
    const created = await fixture(runRoot, count, selected.paragraphs);
    console.log(`[benchmark] Building ${count} public Markdown posts with Minimal...`);
    const measured = await build(created.root, frozen.cli, probe);
    const result = { count, fixture: created.root, markdownBytes: created.markdownBytes, build: measured };
    report.results.push(result);
    await save();
    assert.equal(measured.exitCode, 0, `Build failed; see ${path.join(created.root, 'build.log')}\n${measured.errorTail ?? ''}`);
    const indexFile = path.join(created.root, 'dist', 'search-index.json');
    const bytes = await readFile(indexFile);
    const payload = JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.posts.length, count, 'Search payload must contain every generated public article');
    assert.equal(payload.index.length, count, 'Search index must contain every generated public article');
    assert.equal(new Set(payload.index.map(entry => entry.id)).size, count, 'Search IDs must be unique');
    assert.equal(api.rankSearchResults(payload.index, { q: 'marker000000' }).length, 1, 'Unique body query must match exactly one article');
    result.index = { rawBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, gzipLevel: 9, publicDocuments: payload.index.length };
    result.search = searchBench(payload, api, selected.iterations);
    await save();
    console.log(`[benchmark] ${count} posts: wall ${(measured.elapsedMs / 1000).toFixed(2)}s; Astro ${measured.astroReported ? (measured.astroReported.elapsedMs / 1000).toFixed(2) + 's / ' + measured.astroReported.htmlPages + ' pages' : 'summary unavailable'}; main-process peak RSS ${measured.memory ? (measured.memory.peakRssBytes / 1048576).toFixed(1) + ' MiB' : 'unavailable'}; index ${(result.index.rawBytes / 1048576).toFixed(2)} MiB raw / ${(result.index.gzipBytes / 1024).toFixed(1)} KiB gzip`);
    for (const query of result.search) console.log(`[benchmark] ${query.name}: ${query.matches} matches; rank p95 ${query.rank.p95Ms.toFixed(2)}ms; rank+20 highlights p95 ${query.rankAndFirst20Highlights.p95Ms.toFixed(2)}ms`);
  }
  report.completedAt = new Date().toISOString();
  await save();
  console.log(`[benchmark] Complete: ${reportFile}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });