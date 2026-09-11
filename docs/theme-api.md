# Mintfolio Theme API

Mintfolio 的布局主题是一个独立模块：Core 负责内容公开策略、URL、路由、SEO 和受保护文章的密文，主题只负责用公开数据渲染页面。主题可以拥有任意 HTML、CSS 和浏览器交互，不需要也不能继承默认主题的布局。

`@mintfolio/core` 0.2.x 提供完整引擎和主题公共入口，内部依赖 `@mintfolio/theme-api` 1.x 契约层。各组件独立发布。组件关系见 [Core 与主题包](core-packages.md)。

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
    engine: '^1.0.0',
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

搜索、标签和分类共用 `/blog?q=…&tag=…&category=…` 与 `archive` renderer，由浏览器控制器执行组合过滤。它们不是独立页面槽位；清单中的 `pages.tag/category/search` 会报错，防止接受一个不会被路由调用的 renderer。主题应使用提供的 URL，避免自行注册冲突端点。

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

查询只匹配标题与公开摘要，忽略大小写；tag/category 按显示标签精确匹配。`theme` 含有构建期函数，不能整体序列化给客户端。

`page` 是带 `kind` 的联合：`HomePageData` 有 `posts`；`PostPageData` 有 `post`、`body`、`previous`、`next`；`ArchivePageData` 有完整 `posts` 和初始 `filters`；`StaticPageData` 有 `id` 与 `profile`；列表/404 页面也都有 `title`、`description`、`url` 与 Core 生成的 `seo`。可将 `seo` 传给 `SeoHead.astro`，或等价地在主题自己的 `<head>` 中渲染 canonical、robots、描述和 Open Graph 数据。

## 静态归档筛选

静态构建的 Astro frontmatter 不会因 `?q=`、`?tag=` 或 `?category=` 重新执行。v1 的这些查询参数全部解析到已有 `/blog` 路由；它们不是独立搜索或 taxonomy 端点。`archive` renderer 应输出构建时得到的安全 DTO，在浏览器中使用纯 SDK 函数筛选，并保留原始 DTO 用于展示：

```ts
import { createSearchEntry, readFiltersFromUrl, searchPosts, writeFiltersToUrl } from '@mintfolio/core/client';

const filters = readFiltersFromUrl(window.location.href);
const matching = searchPosts(posts.map(createSearchEntry), filters);
const next = writeFiltersToUrl(filters, new URL(window.location.href));
history.replaceState(history.state, '', next.toString());
```

`createSearchEntry()` 仅生成已小写化的标题、摘要和 taxonomy 匹配数据，仍保留 `id` 和 `url`。`searchPosts()` 与 `filterPosts()` 不排序、不分页、不修改输入，也不会读取正文；前者接收 SearchEntry，后者接收 PostSummary。`readFiltersFromUrl()` 不读取 `window`，所以也能测试或在服务端使用；`writeFiltersToUrl()` 返回一个新 URL 并保留无关参数和 hash。

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
  filters={page.filters} language={theme.site.language} pageSize={10} />
```

该组件提供搜索框、分类/标签选择、结果数量和可选加载更多。`pageSize` 省略时显示所有匹配结果；需为正整数。它使用 `post.url`，查询变化同步 URL，浏览器返回时重新读 URL。基础样式仅作用于组件。

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

站点 `theme.config.mjs` 可以是 `export default {}`：没有主题选择时使用 Core 自带 Minimal。也可显式选择 `minimal`、相对主题目录或已安装 npm 包。Verdant 必须单独安装，通过 `@mintfolio/theme-verdant` 选择；`verdant` 是其简写，不会自动安装。

npm 包通过 `exports` 导出 `./theme`。显式包名无法解析时构建失败。`MINTFOLIO_THEME` 切换到不同主题时读取新主题自己的配置文件及默认 settings，并忽略原主题的内联 settings/overrides；与原主题名相同则保留原配置。

### 主题专属配置文件（Core >= 0.1.1）

站点根目录的 `theme-<manifest.id>.config.mjs` 直接导出该主题的设置对象。Core 只读取当前主题的文件，并使用原有设置 schema 校验。生效顺序为清单默认值 → 专属文件 → `theme.config.mjs.settings`；对象递归合并，数组整组替换。开发服务监听专属文件的变化。文件是原生 ESM，图片使用 public 路径或 URL。

主题作者可在 npm package.json 中声明：

```json
{
  "mintfolio": { "configTemplate": "./config/theme-verdant.config.mjs" },
  "files": ["theme.mjs", "config", "pages", "styles"]
}
```

路径相对于主题包根目录，必须指向包内 `.mjs` 文件并纳入打包白名单。模板导出合法设置对象，可以保留详细注释和空数组的条目示例；不要读取宿主文件。Verdant 提供完整模板和公开设置类型。没有自定义模板的主题可通过 `theme:init` 从清单自动生成带字段说明的完整默认配置。

`npx mintfolio theme:add <npm-package>` 负责安装并立即生成配置，`verdant` 为官方主题简写；它不自动更换站点当前选择。`theme:init [theme]` 手动生成指定主题配置，`theme:sync` 为直接依赖中声明了模板的主题补齐文件。`init/dev/build/sync` 也会自动补齐。任何已有文件都会保留，升级不会覆盖用户改动；新设置依旧由清单默认值补齐。

直接使用 `npm install <theme>` 时，配置在下一次运行 Core 或执行 `theme:init` 时生成。配置生成不依赖 npm 的依赖生命周期脚本；主题包只拥有模板，宿主文件写入和读取由 Core 负责。

`overrides.pages` 是相对项目根目录的显式 `.astro` 覆盖，例如 `{ pages: { archive: './my-theme/archive.astro' } }`。覆盖同样必须在项目内，不能指向 Core、路由或主题 Runtime。没有隐式同名文件覆盖，也没有 `extends`/主题继承。

独立作者可从 [Theme Starter](https://github.com/cnflwzh/mintfolio-theme-starter) 开始。主题包应包含 `type: "module"`、`exports: { "./theme": "./theme.mjs" }`、完整的 `files` 白名单，以及 `@mintfolio/core: ^0.2.0` 与 `astro: ^7.3.2` 的 peerDependencies。主题使用底层 SDK 时额外声明该依赖。开发与包职责见 [组件说明](core-packages.md)。


## 本地检查

各仓库独立执行检查，无需编译相邻仓库源码：

| 仓库 | 命令与范围 |
| --- | --- |
| MintfolioThemeAPI | `npm test` 编译公开契约并检查搜索、加密纯函数 |
| MintfolioCore | `npm test` 编译公共 ESM/声明，运行核心单测和实际 Astro/Vite 导入边界检查 |
| MintfolioThemeVerdant / MintfolioThemeStarter | `npm run check` 检查主题 Astro 和 TypeScript |
| PersonalSite | `npm run check` 检查站点；`npm run build` 使用已安装的包构建 |
| PersonalSite | `npm run test:theme-package` 从 vendor 包在仓库外验证三种真实安装 |

在消费站点运行 `npx mintfolio theme:check` 可以校验所选 manifest、settings、renderer 路径和覆盖路径。它不替代 Astro renderer 的类型检查与静态构建。站点的 dev/build/check 不编译 SDK/Core 源码；更新依赖先在所属仓库打包，再刷新消费仓库的 vendor 与锁文件。
