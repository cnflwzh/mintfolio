# Mintfolio Theme API

Mintfolio 的布局主题是一个独立模块：Core 负责内容公开策略、URL、路由、SEO 和受保护文章的密文，主题只负责用公开数据渲染页面。主题可以拥有任意 HTML、CSS 和浏览器交互，不需要也不能继承默认主题的布局。

`@mintfolio/core` 0.4.x 提供完整引擎和主题公共入口，内部依赖 `@mintfolio/theme-api` 1.x 契约层。各组件独立发布。组件关系见 [Core 与主题包](https://github.com/MintfolioBlog/mintfolio/blob/main/docs/core-packages.md)。

## 公开入口与边界

| 入口 | 用途 |
| --- | --- |
| `@mintfolio/core/theme` | `defineTheme`、清单、嵌套设置、公开 DTO 和上下文类型 |
| `@mintfolio/core/astro` | `PageProps`、页面、正文与 SEO 类型 |
| `@mintfolio/core/search` | 纯搜索、组合筛选及 URL 参数函数 |
| `@mintfolio/core/client` | 共享列表、生命周期、解锁、目录、图片预览和复制行为 |
| `@mintfolio/core/components/*` | 可选 `PostArchive.astro`、`ProtectedArticle.astro`、`SeoHead.astro`、`Image.astro` |

底层 `@mintfolio/theme-api` 的根入口、`/astro`、`/search`、`/client` 仍可使用，Core 对这些契约提供稳定门面。其 `/crypto` 是内容适配器用的低层加密工具，不负责 HTML 清理，普通主题无需调用。

主题只能导入面向主题的公开入口及自身模块、资源和 Astro 渲染原语。`@mintfolio/core`、`/config`、`/content` 是宿主入口，主题不能调用。Theme Runtime 在导入 manifest 和编译 renderer 前检查依赖图，拒绝主题导入 `site.config.ts`、Core 包的 `src/server`/`src/engine`/`src/routes`、旧 `src/core`、旧 `src/lib`/`src/utils`、`src/pages`、内容目录、`astro:content` 或 `virtual:mintfolio/*`；显式页面 override 遵守同一规则。检查会覆盖直接、别名和转递导入，也会检查 manifest 的直接和转递依赖。这是构建时的开发契约，不是执行 npm 包的安全沙箱。

## 声明主题

每个主题根目录必须有 `theme.mjs`，并通过 `defineTheme()` 返回一个静态清单。`home` 和 `post` 是必需语义页面；其余 renderer 都是可选的。路径以清单目录为基准，必须以 `./` 开始并指向主题内的 `.astro` 文件。

```js
import { defineTheme } from '@mintfolio/core/theme';

export default defineTheme({
  manifest: {
    id: 'paper',
    name: 'Paper',
    version: '1.0.0',
    author: 'Example author',
    description: 'A quiet reading theme.',
    engine: '^1.2.0',
  },
  capabilities: {
    search: true,
    tags: true,
    categories: true,
    encryptedPosts: true,
  },
  pages: {
    home: './pages/home.astro',
    post: './pages/post.astro',
    archive: './pages/archive.astro',
    page: './pages/page.astro',
    notFound: './pages/not-found.astro',
  },
  settings: {
    maxWidth: { type: 'number', label: '正文宽度', default: 760, min: 480, max: 1200 },
    accentColor: { type: 'color', label: '强调色', default: '#2255aa' },
  },
});
```

`id` 使用小写连字符命名；`version` 是精确 semver；`engine` 是 Theme API/Runtime 的 semver 范围，不是站点或 Astro 的版本。`author` 与 `description` 是必填字段。`capabilities` 中未声明的能力默认为 `false`。包含加密文章的站点不能选择未声明 `encryptedPosts: true` 的主题。

可声明的页面为 `home`、`post`、`page`、`archive`、`notFound`。`home`/`post` 必需；缺少其余页面时，Core 按页使用内置 Minimal。Core 持有 `/`、`/about`、`/blog`、`/blog/[...slug]`、`/404`、RSS 和 Sitemap 路由。

标签、分类、系列及静态分页使用独立 URL，共用 `archive` renderer。旧 `/blog?q=…&tag=…&category=…` 链接由全站搜索组件继续支持。它们不是独立页面槽位；清单中的 `pages.tag/category/search` 会报错，防止接受一个不会被路由调用的 renderer。主题应使用提供的 URL，避免自行注册冲突端点。

设置支持 `string`、`boolean`、`number`、`select`、`color`、`object`、`array`。每项均有 `label` 和 `default`；number 可定义边界，select 定义字符串选项，color 使用十六进制。object 定义 `properties`，array 定义 `items`。对象递归补齐默认值；数组显式替换并保留顺序。未知键或错误值会按路径报错，包括数组下标。`InferSettings` 推导完整嵌套类型。

```js
settings: {
  sidebar: {
    type: 'object', label: '侧栏', default: {},
    properties: {
      enabled: { type: 'boolean', label: '显示', default: true },
      links: {
        type: 'array', label: '链接', default: [],
        items: {
          type: 'object', label: '链接', default: {},
          properties: {
            label: { type: 'string', label: '文字', default: '' },
            url: { type: 'string', label: '地址', default: '' },
          },
        },
      },
    },
  },
}
```

需要 React/Tailwind 的主题在清单中声明 `build: { react: true, tailwind: true }`，并在主题包内安装对应 `@astrojs/react`/React 与 `@tailwindcss/vite`/Tailwind 依赖。Core 从选中主题的包位置加载工具链。主题不能注册任意 Core hooks；主题继承不受支持。

## 页面 props 与公开数据

每个 renderer 都接收 `{ theme, page }`。让 Astro 校验调用契约时，在页面声明 `Props`，而非把 `Astro.props` 断言成任意类型：

```astro
---
import type { InferSettings } from '@mintfolio/core/theme';
import type { HomePageData, PageProps } from '@mintfolio/core/astro';
import definition from '../theme.mjs';

interface Props extends PageProps<InferSettings<typeof definition.settings>, HomePageData> {}
const { theme, page } = Astro.props;
---
<h1>{theme.site.title}</h1>
<ul>
  {page.posts.map((post) => <li><a href={post.url}>{post.title}</a></li>)}
</ul>
```

`theme.site` 是扁平的公开站点投影：`title`、`description`、`url`、`language`、`profile`、`social`、`skills`、`projects`、`contact` 和可选 `icp`。它不包含旧布局配置或导入的宿主模块。`theme.navigation` 是 `{id, label, url}` 列表，主题可以重排或省略这些链接。

`PostSummary` 还提供可选 `updatedAt`、`wordCount`、`readingMinutes`、`pinned`、`authors`、`series`、`seo` 和本地 `preview`。受保护文章不提供正文统计。

`PostSummary` 提供 `id`、`url`、`title`、`description`、ISO 字符串 `publishedAt`、`tags`、`category`、可选 `cover` 与 `protected`。每个 taxonomy term 都有 Core 生成的 `{id, label, url}`。受保护文章的描述是 Core 的公开占位文本；原始内容集合条目、frontmatter 口令和正文永远不会进入这个 DTO。

所有地址由 Core 提供。文章必须链接 `post.url`，标签/分类必须链接 `term.url`，其他页面使用 `theme.urls.home()`、`archive(filters?)`、`page(id)`、`post(id)`、`tag(label)`、`category(label)`、`rss()` 和 `sitemap()`。不要拼接 `/blog/${id}`、`/about` 或查询字符串。

构建/服务端可调用：

```ts
const result = await theme.content.posts({ q: 'astro', tag: '前端', offset: 0, limit: 10 });
// result.items 是公开 PostSummary[]；result.total 是分页前的匹配数。
const one = await theme.content.post('my-post'); // 草稿或不存在时为 null
const tags = await theme.taxonomy.tags();
const categories = await theme.taxonomy.categories();
const months = await theme.taxonomy.archives();
const index = await theme.search.index();
```

`theme.content.posts({q})` 使用公开全文索引，忽略大小写，多词使用 AND；tag/category 按显示标签精确匹配。`theme` 含有构建期函数，不能整体序列化给客户端。

`page` 是带 `kind` 的联合：`HomePageData` 有 `posts`；`PostPageData` 有 `post`、`body`、`previous`、`next`；`ArchivePageData` 有完整 `posts` 和初始 `filters`；`StaticPageData` 有 `id` 与 `profile`；列表/404 页面也都有 `title`、`description`、`url` 与 Core 生成的 `seo`。可将 `seo` 传给 `SeoHead.astro`，或等价地在主题自己的 `<head>` 中渲染 canonical、robots、描述和 Open Graph 数据。

## 1.1 新增页面与内容服务

- `ArchivePageData.posts` 是当前静态页的文章；`pagination` 提供当前页、总页数、上下页与页码链接。不要再次做客户端切片。
- `StaticPageData.body` 为独立 Markdown 页的公开 HTML/标题；内置 about 仍由 `profile` 提供。
- `PostPageData.related` 与 `seriesPosts` 由 Core 排序；主题直接呈现。
- `theme.content.pages()`、`related(id,limit?)`、`taxonomy.series()` 提供页面、关联文章和系列信息。
- 新 URL 服务为 `archivePage(number,filters?)`、`series(label)`、`jsonFeed()`、`atom()`。
- `rankSearchResults` 排相关性，`searchWithHighlights` 返回纯文本片段和 UTF-16 高亮坐标；不输出 HTML。

主题应优先复用 SearchPanel/Pagination/PostMeta/ArticleLinks；[博客功能](Blogging-Features) 包含站点侧配置。

## 静态归档筛选

静态构建的 Astro frontmatter 不会因查询参数重新执行。标签、分类和系列有各自的静态归档路由；q/tag/category/series 查询参数由浏览器全站搜索处理。`page.posts` 只包含当前静态页，完整搜索应加载 `theme.urls.searchIndex()` 返回的 SearchPayload，不能用当前页的文章代替全站索引。下面的 posts 仅用于演示对已提供的摘要进行筛选：

```ts
import { createSearchEntry, readFiltersFromUrl, searchPosts, writeFiltersToUrl } from '@mintfolio/core/client';

const filters = readFiltersFromUrl(window.location.href);
const matching = searchPosts(posts.map(createSearchEntry), filters);
const next = writeFiltersToUrl(filters, new URL(window.location.href));
history.replaceState(history.state, '', next.toString());
```

`createSearchEntry(post, bodyText?)` 保留原文大小写和可选公开正文；受保护文章始终丢弃正文参数。`searchPosts()` 与 `filterPosts()` 不排序、不分页、不修改输入，不会读取文件；前者接收可含正文的 SearchEntry，后者仅过滤 PostSummary 元数据。`readFiltersFromUrl()` 不读取 `window`，所以也能测试或在服务端使用；`writeFiltersToUrl()` 返回一个新 URL 并保留无关参数和 hash。

## 共享控制器与可选组件

主题可以直接组合 Core 的标准组件：

```astro
---
import PostArchive from '@mintfolio/core/components/PostArchive.astro';
const { theme, page } = Astro.props;
const [tags, categories] = await Promise.all([
  theme.taxonomy.tags(), theme.taxonomy.categories(),
]);
---
<PostArchive posts={page.posts} tags={tags} categories={categories}
  filters={page.filters} language={theme.site.language} pagination={page.pagination}
  archiveUrl={theme.urls.archive()} searchEndpoint={theme.urls.searchIndex()} />
```

该组件呈现当前静态页、分类/标签导航和传入的分页链接，搜索由 SearchPanel 懒加载完整公开索引。`pageSize` 仅保留兼容声明，实际静态分页由站点 blog.pageSize 控制。搜索结果与下方当前页列表分别展示。

若需要完全自定义 HTML，使用同一控制器：

```ts
import { createPostListController, createSearchEntry, readFiltersFromUrl } from '@mintfolio/core/client';
const list = createPostListController({
  items: posts, index: createSearchEntry, pageSize: 10,
  initialFilters: readFiltersFromUrl(location.href),
});
const stop = list.subscribe((state) => {
  // 首次订阅立即收到状态；用原始 DTO 渲染 state.visible。
  renderCards(state.visible);
  renderCount(state.total, state.hasMore);
});
list.setFilters({ q: 'Astro', tag: '前端', category: '' });
list.loadMore();
// 卸载时 stop(); list.dispose();
```

`value()` 返回 `filters/matches/visible/total/limit/hasMore/facets`。筛选改变会重置分页；`setLimit()` 支持主题恢复已加载数量。facets 按另一项 taxonomy 计算，忽略 q；`reconcileFacets: true` 可清除不可用选项，默认不清除。控制器不操作 DOM、history、storage 或排序，调用方决定这些策略。

| API | 输入与返回 / 生命周期 |
| --- | --- |
| `onPage(target, setup)` | 选择器或根节点解析函数；setup 收到根节点和 `PageScope`；返回取消函数，支持普通文档、Astro 切换及 BFCache |
| `createPageScope()` | 提供 `signal/add/timeout/frame/dispose`，统一释放事件、计时器和帧回调 |
| `createProtectedArticleController(options)` | ciphertext、postId、渲染/清理回调；返回 `unlock/lock/dispose`，处理异步竞争及页面离开清理 |
| `createTocController(options)` | headings、可选 links、offset 和进度回调；返回 `refresh/scrollTo/dispose` |
| `createLightboxController(options)` | 主题自有 dialog、image、viewport 和按钮；提供缩放、平移、键盘及释放 |
| `copyText(text)` | 异步返回是否复制成功；不提供按钮样式 |
| `extractCodeText/resolveCodeLanguage` | 从代码节点提取原文/语言；工具栏由主题绘制 |

DOM 控制器支持传入 `signal`；可使用 `scope.add(controller.dispose)`。Core 不读取 Verdant 的类名、配色键或页面结构。Verdant 通过适配脚本调用这些控制器，Minimal 和 Starter 则复用标准组件。

## 正文与受保护文章

`PostPageData.body` 是判别联合：公开正文为 `{ kind: 'public', html, headings }`，可以用 `set:html` 输出；受保护正文为 `{ kind: 'protected', postId, payload }`，没有标题目录或明文。payload 的认证明文协议固定为：

```ts
{ version: 1, html: string, headings: Array<{ depth: number; slug: string; text: string }> }
```

主题不得自行解密或假设 payload 内部字段。在浏览器脚本中调用：

```ts
import { unlockArticle } from '@mintfolio/core/client';

const { fragment, headings } = await unlockArticle(body.payload, password, body.postId);
container.replaceChildren(fragment);
```

该 helper 验证密文、认证并解密、检查 version 1 envelope，再由 DOMPurify 清理 HTML，返回短生命周期的 `DocumentFragment` 和纯文本 headings。需要 HTTPS 或 localhost 的安全 Web Crypto 上下文。需要自定义表单时，优先使用 `createProtectedArticleController` 统一处理生命周期和竞争请求。主题负责 `onUnlock` 挂载、`onClear` 清除自己创建的所有节点和引用：成功后清空输入，relock、`pagehide`/导航时清除正文和 headings 引用；异步解锁在页面释放或有更新请求后完成时必须丢弃结果。不要把密码、明文或 headings 写入 localStorage、sessionStorage、history 或其他持久化位置。可按 `ArticleUnlockError.code` 显示本地化错误，而不是解析底层异常。

## 选择、覆盖和作者工作流

站点 `_mintfolio/theme.config.mjs` 可以是 `export default {}`：没有主题选择时使用 Core 自带 Minimal。也可显式选择 `minimal`、相对主题目录或已安装 npm 包。Verdant 必须单独安装，通过 `@mintfolio/theme-verdant` 选择；`verdant` 是其简写，不会自动安装。

npm 包通过 `exports` 导出 `./theme`。显式包名无法解析时构建失败。`MINTFOLIO_THEME` 切换到不同主题时使用新主题的默认 settings，并忽略原主题的 settings/overrides；与原主题名相同则保留原配置。

### 站点中的主题设置（Core >= 0.4）

站点只在 `_mintfolio/theme.config.mjs` 的 `settings` 中保存当前主题的设置，Core 用清单的设置 schema 校验，未填写的字段使用清单默认值；对象递归合并，数组整组替换。开发服务监听该文件的变化。文件是原生 ESM，图片使用 public 路径或 URL。Core 不再生成或读取 `theme-<manifest.id>.config.mjs`。

主题作者可在 npm package.json 中声明设置模板：

```json
{
  "mintfolio": { "configTemplate": "./config/theme-verdant.config.mjs" },
  "files": ["theme.mjs", "config", "pages", "styles"]
}
```

路径相对于主题包根目录，必须指向包内 `.mjs` 文件并纳入打包白名单。模板用 `export default` 导出一个合法设置对象字面量，可以保留详细注释和空数组的条目示例；不要读取宿主文件。Core 只复制这个对象（包括其中的注释），文件开头的说明不会进入站点。没有自定义模板的主题由 Core 从清单自动生成带字段说明的完整默认设置。

`mintfolio theme use <主题>` 切换主题时，把新主题的模板写入站点 `_mintfolio/theme.config.mjs` 的 `settings`，原设置保存在备份中；`mintfolio theme init` 只在 `settings` 为空时写入模板。`theme install`（旧名 `theme:add`）只安装主题包，不生成任何站点文件。主题包只拥有模板，宿主文件写入和读取由 Core 负责。

`overrides.pages` 是相对 Astro 项目根目录 `_mintfolio/`的显式 `.astro` 覆盖，例如 `{ pages: { archive: './my-theme/archive.astro' } }`。覆盖同样必须在项目内，不能指向 Core、路由或主题 Runtime。没有隐式同名文件覆盖，也没有 `extends`/主题继承。

独立作者可从 [Theme Starter](https://github.com/MintfolioBlog/mintfolio-theme-starter) 开始。主题包应包含 `type: "module"`、`exports: { "./theme": "./theme.mjs" }`、完整的 `files` 白名单，以及 `@mintfolio/core: ^0.4.0` 与 `astro: ^7.3.2` 的 peerDependencies。主题使用底层 SDK 时额外声明该依赖。开发与包职责见 [组件说明](https://github.com/MintfolioBlog/mintfolio/blob/main/docs/core-packages.md)。


## 本地检查

各仓库独立执行检查，无需编译相邻仓库源码：

| 仓库 | 命令与范围 |
| --- | --- |
| MintfolioThemeAPI | `npm test` 编译公开契约并检查搜索、加密纯函数 |
| MintfolioCore | `npm test` 编译公共 ESM/声明，运行核心单测和实际 Astro/Vite 导入边界检查 |
| MintfolioThemeVerdant / MintfolioThemeStarter | `npm run check` 检查主题 Astro 和 TypeScript |
| 消费站点根目录 | `mintfolio check --no-interactive` 检查；`mintfolio build --no-interactive` 使用已安装包构建 |

在消费站点运行 `npx mintfolio theme:check` 可以校验所选 manifest、settings、renderer 路径和覆盖路径。它不替代 Astro renderer 的类型检查与静态构建。站点的 dev/build/check 不编译 SDK/Core 源码；更新依赖先在所属仓库打包，再刷新消费仓库的 vendor 与锁文件。

## SDK 1.2 与 Core 0.4

使用本节新增服务的主题声明 `manifest.engine: '^1.2.0'`，并将 Core peerDependency 设为 `^0.4.0`。旧的 `^1.1.0` 清单仍可在新 Runtime 加载；需要新增服务时应提高最低契约版本。SDK 与 Core 使用独立版本号。1.2 是本地开发版本，尚未发布 npm。

### 已有功能与公开接口

| Core 功能 | 主题开发入口 |
| --- | --- |
| 置顶、发布时间、更新时间、阅读时长、作者、封面 | `PostSummary`；受保护正文不提供字数与阅读时长 |
| 标签、分类、系列、按月归档 | `theme.taxonomy.tags/categories/series/archives()`；月份按站点时区分组，没有月归档路由 |
| 筛选与切片 | `theme.content.posts({ q, tag, category, series, offset, limit })`；返回 `{ items, total }`，total 为切片前总数 |
| 系列目录 | `theme.content.series(id)`；精确系列 ID，先按 order 升序、再按发布时间升序，未设置 order 的排后面 |
| 独立 Markdown 页 | `theme.content.pages()` / `page(id)`；未知或不可见 ID 返回 null，生成的 about 不属于 Markdown 集合 |
| 相关文章与文章导航 | `theme.content.related(id, limit)`、`page.related`、`page.previous/next`、`page.seriesPosts` |
| 静态归档分页 | `page.pagination`；可用 `theme.urls.archivePage(number, filters)` 获取路由，页码从 1 开始 |
| 全文搜索 | `theme.search.index()`、`searchWithHighlights`；`SearchPayload` 描述搜索端点的 `{ posts, index }` |
| 部署到子目录 | `theme.urls.searchIndex()`、`robots()`、`asset('/logo.svg')`，其他 URL 方法同样包含部署前缀 |
| SEO、社交卡片、订阅 | `page.seo` 与 SeoHead；`theme.urls.rss/jsonFeed/atom/sitemap()` |
| 加密文章、目录、图片预览、代码复制 | 从 `@mintfolio/core/client` 导入现有控制器，组件从 `@mintfolio/core/components/*` 导入 |
| GA4 | `theme.site.analytics` 只读展示配置，生产脚本由 Core 注入，开发模式关闭，主题不要重复初始化 |

`content.post/page` 使用内容 ID，不使用 frontmatter slug；链接始终使用 DTO 的 url。`urls.post/page` 只负责路由编码，不进行 ID 到 slug 的查询。`posts()` 保持 Core 的置顶、新文章优先顺序，系列目录另用 `series()`。搜索过滤忽略大小写、各条件取交集；`series` 为可选字段，未提供或空字符串不限制系列。

`archivePage` 按 tag、category、series 的顺序选取第一个非空分类生成静态路径，其余条件与 q 保留在查询参数中。这些参数由浏览器搜索处理，不会使静态页面重新构建；链接有效页码须来自已有的 `page.pagination`。`asset` 为根相对静态路径补一次部署前缀，已带前缀、外部 URL 和相对路径保持不变，不检查文件存在性或做图片优化。

公开内容服务仍遵守发布策略：只有显式本地预览才可看到草稿及定时文章；搜索始终排除草稿、定时未发布和 noindex 内容，加密文章索引没有正文。不要序列化整个 theme 上下文，它包含构建期函数。

### 从 manifest 推导页面类型

下面是 `pages/archive.astro` 的完整最小示例，假定清单位于包根目录 `theme.mjs`：

~~~astro
---
import definition from '../theme.mjs';
import type { ThemePageProps } from '@mintfolio/core/astro';
import SeoHead from '@mintfolio/core/components/SeoHead.astro';
import PostArchive from '@mintfolio/core/components/PostArchive.astro';

type Props = ThemePageProps<typeof definition, 'archive'>;
const { theme, page } = Astro.props;
const [tags, categories] = await Promise.all([
  theme.taxonomy.tags(), theme.taxonomy.categories(),
]);
---
<!doctype html>
<html lang={theme.site.language}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <SeoHead seo={page.seo} />
  </head>
  <body>
    <main>
      <h1>{page.title}</h1>
      <PostArchive posts={page.posts} tags={tags} categories={categories}
        filters={page.filters} pagination={page.pagination}
        language={theme.site.language} archiveUrl={theme.urls.archive()}
        searchEndpoint={theme.urls.searchIndex()} />
    </main>
  </body>
</html>
~~~

`PageProps<Settings, PageData>` 原有写法继续支持；`PageDataFor<'post'>` 可以单独取文章页数据类型。`ThemeContent`、`ThemeTaxonomy`、`ThemeSearch` 可以作为自定义组件的服务参数类型。`ThemeConfiguration<Settings>` 的 settings 使用 `ThemeSettingsInput` 允许递归的对象部分覆盖，数组仍须提供完整条目。

### Core 0.4 项目布局和生命周期

站点根目录放文章；`_mintfolio/` 放 package.json、site.config.ts、theme.config.mjs、pages、public 和依赖。`overrides.pages` 从 Astro 项目根 `_mintfolio/` 解析，例如 `./overrides/archive.astro`。主题包内 renderer 路径仍从 theme.mjs 所在目录解析。

设置统一放在 `_mintfolio/theme.config.mjs` 的 settings。主题可在 package.json 声明 `mintfolio.configTemplate`，Core 的 `mintfolio theme use` 会复制模板对象及注释并备份旧配置，`theme init` 仅在 settings 为空时填充。主题不应自行读写宿主配置；旧 `theme-<id>.config.mjs` 已不作为站点运行时设置文件。

浏览器交互从 `@mintfolio/core/client` 导入 `onPage`，在 setup 中使用 `scope.signal` 绑定事件，并用 `scope.add(controller.dispose)` 注册控制器清理，以支持 Astro 页面切换和 BFCache。解锁后正文、目录和密码不可持久化，离开页面或重新锁定时必须清除。SDK 本身不依赖 Core；完整的 DOM 控制器属于 Core 的公共门面，不要从其 src 私有路径导入。
