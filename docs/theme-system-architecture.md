# Mintfolio 主题系统：架构审查与第一阶段迁移方案

> 历史记录：本文描述第一阶段。当前 npm 包结构、Minimal 兜底及共享 API 以 [Core 与主题包](core-packages.md)、[Theme API](theme-api.md) 和 [第二阶段验收](core-package-verification.md) 为准。

状态：已获授权并按本方案实施第一阶段。本文保留实施前的架构审查与迁移决策；最终实现及验收记录见 [第一阶段验收](theme-system-verification.md)。审查日期：2026-09-10。代码基线：`15eaada`，审查开始时工作区干净。

实施前按目标文件要求，先完成 Current Architecture → Problems → Proposed Theme Architecture → Migration Plan，并独立提交审查文档。下文记录当时提案，接口的准确名称和当前用法以 [Theme API 文档](theme-api.md) 为准。

**建议结论**：保留 Astro、现有内容集合、站点配置和静态部署。把现有页面迁移为 Default Theme，把文件路由缩减为 Core 的入口；以一个小型、可打包的公开 SDK 和构建期 Theme Loader 连接两者。第二个 Minimal Theme 独立输出文字列表和单栏文章，用相同内容、相同 URL 验证布局自由。

## Current Architecture

**实际结构与文档存在差异，迁移必须以源码为准。**

| 部分 | 当前实现与证据 | 对迁移的含义 |
| --- | --- | --- |
| 构建 | `package.json:19` 声明 Astro 7、React 19、Tailwind 4；本机安装的 Astro 为 7.3.2。`astro.config.mjs:8` 使用 React integration、Tailwind Vite plugin 和远程图片白名单，没有配置 SSR adapter | 保留现有静态构建链。React integration 存在，但当前 `src` 未发现 React 组件或 hydration 指令，无需引入 React 状态层 |
| 内容 | `src/content.config.ts:24` 用 Astro glob loader 读取根目录 `content/blog/**/*.md`，通过 `astro/zod` 校验 | AGENTS 示例中的 `src/content/blog` 已不是实际内容路径；不迁移文章，不另建扫描器 |
| 数据层 | `src/lib/posts.ts:17` 集中读取非草稿文章并按日期降序排列；同文件提供分类/标签频率排序、文章链接、加密摘要替换 | 已有 Core Service 雏形，优先提取和复用 |
| 页面路由 | `src/pages/index.astro`、`about.astro`、`blog/index.astro`、`blog/[...slug].astro` | 现有路径为 `/`、`/about`、`/blog`、`/blog/[...slug]`；文章页通过 `getStaticPaths()` 生成 |
| 内容渲染 | `src/pages/blog/[...slug].astro:23` 生成路由，`:33` 调用 `render(post)`，后续直接输出文章、目录、工具和 CSS | 路由、内容处理和最终 UI 集中于同一文件 |
| 搜索与筛选 | `PostCard.astro:18` 把元数据放入 DOM；`postList.ts:54` 从 `.post-card` 读取数据，`:64` 过滤；`postFilters.ts:5` 读写 `q/tag/category` | 搜索范围是标题和展示摘要，标签/分类是条件筛选；不是正文搜索，没有独立搜索索引端点 |
| 列表加载 | 首页和博客页把全部文章卡片输出为 HTML，初始显示数量分别为 6/8，再由浏览器显示更多 | 当前不是构建期分页；第一阶段保留此行为，避免同步改分页和 URL |
| 配置 | `site.config.ts` 配合 `src/utils/types.ts`，含网站、资料、项目、社交和多种展示选项；配置导入本地头像图片 | 需要区分公共内容与 Default Theme 展示配置；配置文件不能简单当作纯 Node 数据模块加载 |
| 配色 | `site.config.ts:5` 的 `theme: 'happyhues'` 没有参与组件选择；`Base.astro:21` 固定导入 happyhues CSS | 现有 theme 字段不是布局主题加载器；运行时的 8 套配色、自动/浅色/深色属于 Default Theme 的能力 |
| 页面框架 | `Base.astro` 输出完整 HTML、head、ClientRouter、字体、全局样式、统计脚本、悬浮按钮等 | Base 是现有主题布局，不适合作为所有主题必须继承的 Core 布局 |
| 状态 | URL 保存筛选；`history.state` 保存列表数量/状态和文章来源；sessionStorage 保存返回目标；localStorage 保存配色和提示状态 | 没有中心状态仓库；多数状态管理是原生 DOM 和浏览器机制 |
| 生命周期 | `scripts/lifecycle.ts:46` 用 `onPage()` 处理初次加载、Astro 页面切换和文章解锁后的挂载，配合 AbortController、disposer、定时器与动画清理 | 可以复用；需要区分通用资源管理与默认主题的选择器、事件 |
| 加密 | `ProtectedArticle.astro:11` 在构建时加密 slot 渲染出的正文和目录 HTML；浏览器校验、解密、DOMPurify 清理、重新锁定 | 已经是核心功能，不能推迟为“将来可能存在”；密码不能成为公开 Theme 数据 |
| SEO 与导出 | Base 管理 title/description/noindex；RSS 和 Sitemap 独立调用文章层、排除加密文章；`public/robots.txt` 为静态资源 | 已有规则要集中表达。源码未见统一 canonical/OG 数据服务；不能把不存在的 SEO 能力当作现成 API |
| 部署 | `.github/workflows/deploy.yml` 执行类型检查、依赖审计、核心单测、构建和浏览器测试；满足 main/secrets 条件时通过 SSH/SCP 发布 `dist` 并检查/重载 nginx | 不需要改变托管架构。本轮只审查仓库声明的流程，没有验证远端部署状态 |

当前主要链路：

```text
content/blog/*.md → Astro Content Collection → src/lib/posts.ts
                                              ↓
site.config.ts ─────────────────────────────→ src/pages/*
                                              ↓
                                Base + 页面模板 + 组件 + CSS
                                              ↓
                                  浏览器脚本从 DOM 建立索引
                                              ↓
                                         dist 静态网站
```

首页约 2,064 行，文章页约 1,022 行，主要包含既有布局和样式。`components/base` 中的 Hero、Navigation、Skills、Projects、Contact 没有在当前 `src` 的页面依赖中被导入；不能仅根据目录名称把它们认定为当前站点的核心组件，更不应为了“组件统一”重新接回页面。

## Problems

**现有 Content / Core / UI 的主要耦合点。**

| 耦合 | 具体位置 | 推荐处理 |
| --- | --- | --- |
| 公开数据等同于 Astro 原始条目 | `lib/posts.ts:3` 的 `BlogPost = CollectionEntry<'blog'>`，PostCard 直接接收它 | Core 内保留原始条目；对外显式构造公开 Post 对象，不能 spread 原始 data 后只删 password |
| 路由入口负责最终渲染 | 首页、博客页、文章页既查询内容又输出 UI | 原页面模板迁入主题；Core 页面只解析路由、准备上下文、调用 renderer |
| Theme 直接读取站点内部配置 | 页面与多个组件相对路径导入 `site.config.ts` | 通过注入的 ThemeContext 获取规范化站点数据和主题设置 |
| URL 规则分散 | `postHref()` 已编码 slug，但首页 `:225/:315` 直接拼 `/blog/${post.id}`；文章标签也自行组装查询参数 | 所有内容链接、taxonomy 链接和导航目的地址由 Core 提供 |
| 搜索算法依赖默认 DOM | `PostItem` 包含 HTMLElement；筛选函数与 `.post-card`、按钮状态混放 | 提取纯数据过滤与 URL 参数转换；保留默认主题的 DOM 显示层 |
| 加密边界位于 UI 组件 | ProtectedArticle 接收原始 password，并把 TOC 与正文作为 UI slot 一起加密 | Core 提前生成安全的文章正文载荷；主题只绘制文章和解锁交互 |
| 全局框架携带视觉要求 | Base 固定 happyhues、隐藏滚动条、主题面板、Hero 提示、ClientRouter；`site.ts:28` 缺少悬浮容器就提前返回 | 整体归 Default Theme；按需提取纯服务，不能把这些容器升级为 Theme Contract |
| 通用配置带有布局名称 | `sidebar.sections`、`home.hotContent`、`article.footerImage` | 第一阶段做兼容映射，后续逐步归入默认主题设置；不强制其他主题读取 sidebar |
| SEO/站点信息分散 | Base 固定 `lang="zh-CN"` 和 Analytics ID，博客页硬编码标题描述 | Core 提供 SEO/站点信息；主题决定 head 渲染，可用无视觉结构的 SDK helper |
| 导航恢复依赖框架行为 | `postList.ts:46` 必须在 swap 前恢复高度；`article.ts:21` 使用 Astro history index | Default 保留现有顺序，先不抽象为所有主题的全局路由器 |

**已经可作为 Theme API 基础的代码**：`getPublishedPosts()` 的筛选和排序、`getPostFacets()` 的统计、`postHref()` 的编码规则、受保护摘要策略、`PostFilters`、站点资料/社交/技能/项目类型，以及 XML 转义与文章加密算法。复用的是实现和语义，原始 `CollectionEntry`、DOM 型 `PostItem`、带展示字段的完整 `SiteConfig` 不直接成为稳定公共契约。

**需要新增的抽象**：公开内容 DTO、Core 路由与导航服务、统一内容公开策略、纯搜索数据与匹配函数、页面语义上下文、主题契约/校验/加载、Astro 渲染适配器。缓存若需要，应与一次构建或开发内容更新绑定，第一阶段不增加进程永久缓存。

**暂时不要动**：Markdown 文件及现有 frontmatter、文章 id 和站内 URL、加密算法及密钥派生参数、现有图片管线、部署流程、默认主题 CSS 和交互设计。保留未接入的旧组件，不顺便清理；React、Tailwind、Astro 依赖不因本次架构迁移升级或移除。MDX、评论、i18n、真正静态分页和主题商城均不在第一阶段新增。

## Proposed Theme Architecture

**职责与依赖方向。**

```text
Content / site.config.ts
           ↓
Core：内容、公开策略、路由、URL、taxonomy、SEO、搜索数据
           ↓
Theme Runtime：载入/校验主题，匹配页面 renderer，创建公开上下文
           ↓
Theme：只消费 @mintfolio/theme-api 与注入的 props
           ↓
Astro Rendering Adapter → HTML/CSS/JS → dist

Theme ───→ @mintfolio/theme-api       允许
Theme ───→ Theme 自身组件/资源       允许
Theme ───→ src/core、site.config、原始内容、astro:content   不允许
```

主题提供完整的页面 renderer，可以自行写 `<html>/<head>/<body>`，也可以使用自己的 Layout。Core 不统一包 Base，不注入 Header/Sidebar/Hero/PostCard，不强制启用 ClientRouter。Default 保留当前 ClientRouter；Minimal 可以用普通链接。Core 提供导航目的地址，主题决定展示哪些链接、如何组织和摆放。

公开包拟名 `@mintfolio/theme-api`，先用本地 `file:packages/theme-api` 依赖，不为此把整个项目改成 monorepo。发布能力通过明确的 package exports 和可打包目录建立，包名尚未申请或发布：

- 根入口：纯 TypeScript 数据契约、`defineTheme()`、设置类型；不依赖 Astro CollectionEntry、Node fs 或 DOM。
- `/astro`：Astro PageProps 类型和无布局的 SEO head helper；框架耦合限制在此入口。
- `/client`：浏览器可用的纯筛选、URL 状态转换和安全解锁能力；不能间接导入服务器内容层。

Context 由宿主注入，不在 SDK 中反向导入宿主的 Core。因此第三方作者只需要 SDK、文档和 Starter，不需要复制仓库内部路径。原 `utils/types.ts` 可保留兼容 re-export；可复用的通用类型迁到 SDK，避免重复定义两套模型。

**Theme Contract 与 Manifest。**

第一阶段用可由 Node 读取的 `theme.mjs`，通过 `defineTheme()` 声明元数据。页面字段为显式路径，不在这个文件中直接 import `.astro`。这样加载器先检查 manifest，再由 Astro/Vite 编译页面，不要求 Node 理解 `.astro`。manifest 包含设置 schema 和 capabilities，避免维护互相漂移的两份清单。

```js
// 示例接口，不是本轮新增的可执行模块。
// @ts-check
import { defineTheme } from '@mintfolio/theme-api';

export default defineTheme({
  manifest: {
    id: 'minimal', name: 'Minimal', version: '1.0.0',
    author: 'Mintfolio contributors',
    description: '用于验证独立布局的文字博客主题',
    engine: '^1.0.0', // Theme API/Runtime 版本，不是站点 package.json 版本。
  },
  capabilities: {
    search: true, tags: true, categories: true,
    toc: false, darkMode: false, encryptedPosts: true,
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
    accentColor: { type: 'color', label: '链接颜色', default: '#2255aa' },
  },
});
```

`engine` 使用成熟 semver 实现检查范围，不能通过字符串比较或只比较主版本判断。先保持 1.0 契约候选状态，完成两个主题验证后再确定发布版本。Astro renderer 兼容性用主题包的 peerDependencies 表达，与 Theme API 版本分别验证。

Capabilities 为已知 boolean 字段，未声明按 false；扩展信息放命名空间字段中，不让拼写错误静默成为新 capability。有加密内容而主题声明不支持 `encryptedPosts` 时构建报错，不能降级成明文。搜索、TOC 等可选展示能力缺失时提示对应功能不可用。声明能力本身不创建路由、安装依赖或启用评论服务。

**Page Contract：语义、数据和合理 fallback。**

| Page kind | 必选 | 第一阶段 Core 地址 | 缺失时 |
| --- | --- | --- | --- |
| `home` | 是 | `/` | 校验失败 |
| `post` | 是 | `/blog/[...slug]` | 校验失败 |
| `page` | 否 | `/about`，使用 `page.id = 'about'` 的站点资料数据 | 使用内置无默认主题依赖的通用 page renderer |
| `archive` | 否 | `/blog`，全文章列表 | 使用内置文字 archive renderer |
| `tag` / `category` | 否 | 保留既有 `/blog?tag=...`、`/blog?category=...` 筛选链接；不新增独立路径 | 为将来的独立 taxonomy 路由保留，届时使用同一列表上下文转交 archive，否则文字列表 |
| `search` | 否 | 保留 `/blog?q=...` | 当前由 archive 的客户端筛选实现；独立搜索页面暂不启用 |
| `notFound` | 否 | 新增 `/404.html` 构建产物 | 内置简洁 404 renderer；托管端仍需配置正确的 404 响应 |

fallback 只替换 renderer，保留请求语义和数据。归档不能 fallback 到只显示欢迎语或最新三篇文章的 home；page 和 404 也不能伪装为首页。内置 fallback 是 Runtime 提供的极小参考渲染层，与 Default 的 Base/CSS/脚本无关；主题可以显式实现可选页面以完全控制它们。

`home`、`post`、`page` 分别有明确 props；`archive/tag/category/search` 共用列表上下文，并保留 `kind` 区分。主题不提供 `getStaticPaths()`、路由 pattern、middleware 或 `injectRoute()` hook。

特别注意：静态 `/blog` 不会根据每个请求的 query 重新执行 Astro frontmatter。第一阶段 URL 查询参数必须继续由浏览器使用公共 search/filter 函数处理，不能声称只靠构建时 `Astro.url.searchParams` 就实现这些页面。API 类型中预留的语义不等于第一阶段已生成对应独立页面。

**公开 Theme API：小而明确。**

以下为契约草案，implementation 阶段应为所有参数、返回值、错误与默认值补全类型注释：

```ts
/** 公开文章摘要：可交给主题和搜索索引，不包含源文件、password、原始正文。 */
interface PostSummary {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly publishedAt: string; // ISO 8601；避免把 Date 对象直接作为浏览器 JSON 契约。
  readonly tags: readonly TaxonomyTerm[];
  readonly category: TaxonomyTerm;
  readonly cover?: PublicImage;
  readonly protected: boolean;
}

/** URL 来自 Core；label 保留原始显示文本。 */
interface TaxonomyTerm {
  readonly id: string;
  readonly label: string;
  readonly url: string;
}

interface PostQuery {
  readonly q?: string;
  readonly tag?: string;
  readonly category?: string;
  readonly offset?: number;
  readonly limit?: number;
}

interface PostQueryResult {
  readonly items: readonly PostSummary[];
  readonly total: number; // 筛选后、分页前数量。
}

interface ThemeContext<Settings> {
  readonly site: PublicSite;
  readonly navigation: readonly NavigationItem[];
  readonly settings: Readonly<Settings>;
  readonly content: {
    /** 构建/服务器端查询；默认全部已发布文章、日期降序；limit/offset 校验为非负整数。 */
    posts(query?: PostQuery): Promise<PostQueryResult>;
    /** 输入稳定文章 id；不存在或为草稿返回 null；输出仍是安全公开数据。 */
    post(id: string): Promise<PostSummary | null>;
  };
  readonly taxonomy: {
    tags(): Promise<readonly TaxonomyCount[]>;
    categories(): Promise<readonly TaxonomyCount[]>;
    archives(): Promise<readonly ArchiveGroup[]>;
  };
  readonly urls: PublicUrlService;
  readonly search: PublicSearchService;
}
```

`PublicSite` 复用现有资料、社交、技能、项目等语义；`PublicImage` 用 `{ src, width?, height?, format? }` 这样的自有结构表达，Astro 图片元数据由适配层转换，保留现有图片优化。`TaxonomyCount` 增加 count，`ArchiveGroup` 提供明确时区下的年月分组及文章摘要；第一阶段可以固定采用 UTC 分组并在 API 中注明，避免构建机器时区影响归档结果。未分类仍使用现有显示语义；未来国际化不在本轮实现。

`PostQuery` 的 q 延续标题/展示摘要匹配，tag/category 延续现有匹配语义；不偷偷新增正文检索。Theme 的模板取公开数据即可，不能自行统计 taxonomy 或手拼文章 URL。日期如何呈现属于主题，分组和 URL 规则属于 Core。

通过 `Astro.props` 注入 `{ theme, page }`；post 另有安全的 `body` 渲染载荷。Context 中的函数只能用于服务器/构建，不把整个对象传给 `client:*` 组件。浏览器仅接收显式构造的 JSON DTO，以及 `/client` 的纯函数。

**内容公开与加密是迁移的关键边界。**

- 原始 `CollectionEntry`、frontmatter password、构建用文件位置只存在 Core。
- 普通文章的 body 由 Core 调用现有 `astro:content.render()` 得到；主题接收编译后的内容与 headings，不读取 Markdown。
- 加密文章的 body 为判别联合的 protected 分支，只含 postId 与加密载荷，不带公开 headings、明文摘要、raw body 或可绕过保护的 Content 组件。
- Core 统一决定：草稿不发布；加密摘要使用现有占位语；RSS/Sitemap 继续排除加密文章；SEO 继续 noindex；搜索数据仅含公开元数据和占位摘要。
- 解锁的视觉界面属于主题；SDK 的浏览器 helper 负责载荷校验、现有 Web Crypto 解密与 DOMPurify 清理。Default 保留现有错误/成功/重新锁定流程和阅读工具，Minimal 实现简单输入框和正文。

当前加密的是带默认主题 DOM 的完整 slot HTML。建议先在 Core 的 Astro adapter 内，用正式 `Astro.slots.render()` 取得编译后的 Markdown，再将“无主题样式的正文 + headings”作为带版本的内容 envelope 加密；低层 `EncryptedArticle` v1、PBKDF2/AES-GCM 算法和参数保持不变。普通正文继续走 Astro 渲染，不另写 Markdown parser。Default 解锁后依据 headings 重建原 TOC，挂载现有阅读工具；重新锁定、导航离开和异步解密取消必须清除正文、目录及其引用。

这个 envelope 是新增的内容适配协议，不应冒充与旧“整块主题 HTML”完全相同。版本需要独立标注，主题切换时重新构建整站；本阶段不做旧密文与新客户端混用。发布沿用当前整站 dist 方式。MDX 的交互组件不能简单承诺可通过字符串渲染保留 hydration，未来启用 MDX 时再扩展 `/astro` 适配契约。该环节是实现前段需要优先验证的技术点。

API 的无视觉 SEO helper 可以由主题放进自己的 head。Core 给出 title/description/lang/canonical/robots 等数据与公开策略；两个内置主题必须使用或等价渲染这些数据。构建产物检查验证 noindex 和无明文泄漏，避免把“主题自觉”当成核心策略保证。

**Theme Settings 与配置兼容。**

schema 第一阶段只支持 string、boolean、number、select、color；每项包含 label、default，可选 description；number 校验有限数值/min/max，select 校验 options 与 default 的成员关系，color 先明确支持十六进制格式。运行时使用现有 Zod 技术栈验证 schema 和实际设置，schema 类型推导为主题 Settings，配置输入按 unknown 校验，不靠 TypeScript 类型断言跳过校验。

优先级为：schema defaults → 旧字段兼容映射 → 用户显式 settings。未知设置键和类型错误报告带主题 id、字段路径的错误；不静默吞掉错拼字段。复杂的精选文章/推荐工具数组属于配置数据，不强塞进第一版五种 primitive 控件；第一阶段由兼容适配器提供默认主题专属配置，其契约不强制其他主题实现 sidebar。

建议新增很小的 `theme.config.mjs`，仅保存主题选择、primitive settings 和显式 overrides；由 `astro.config.mjs` 与 `site.config.ts` 引用同一份选择：

```js
// 第一阶段在这里切换 default / minimal，未来可填已安装包名。
export default {
  theme: 'default',
  settings: {},
  overrides: { pages: {} },
};
```

原因：现有 `site.config.ts` 会 import PNG；Astro 的配置初始化阶段不能无条件依赖应用的图片编译链。分离仅限构建启动所需的主题选择，不复制第二份站点数据。`site.config.ts` 的 theme 字段引用该值，其他站点/内容配置仍保留原位置；新增配置检查应防止两处选择不一致。旧 `happyhues` 作为 `default` 的兼容别名并提示迁移；旧主题配色 localStorage key 由 Default 继续读取。布局主题切换是站长修改配置后重新构建，访问者的配色开关继续是 Default 内部功能。

**Theme Loader 与 Virtual Module。**

仅引入一个宿主私有的 `virtual:mintfolio/theme`，供 Core 路由/dispatcher 取得选中 renderer 和已校验设置。主题作者通过普通 SDK imports 和 props 开发，不需要理解虚拟模块，也不提供可读取整个内部配置的 virtual module。

加载顺序建议为：

1. Core integration 读取唯一主题选择，解析内置 `default/minimal`、显式本地主题路径或已安装 npm 包的公开 `./theme` export。
2. 读取 `theme.mjs`，校验 manifest、engine、capabilities、settings 和 required pages；先检查，再编译页面。
3. 相对页面路径按 manifest 所在目录解析；用户 override 路径按站点项目根目录解析。检查实际文件、扩展名、解析后归属，防止主题页面路径跨进宿主 Core。
4. 生成含字面量静态 import 的虚拟模块。由 Astro/Vite 编译 `.astro`；浏览器不做任意字符串动态 import，不扫描所有 node_modules 页面，也不打包未选主题的完整资源图。
5. Core 已有文件路由选择相应 renderer；Theme 没有注入核心路由的接口。
6. 主题 manifest 与选择文件加入 dev watch，变更后重载并重新校验；清理 manifest 模块缓存或通过开发加载机制读取新值，避免仅重启 Vite 却仍取旧 Node ESM 缓存。页面与资源按正常 Vite 模块依赖更新。

这里采用 Astro 正式的 integration 配置扩展和 watch 能力，Vite 负责虚拟模块；已检查本机 Astro 的公开 integration 类型也包含 `updateConfig` 与 `addWatchFile`。参考 [Astro Integration API](https://docs.astro.build/en/reference/integrations-reference/) 和 [Vite Plugin API](https://vite.dev/guide/api-plugin.html)。内容侧继续使用现有 `render()`，其返回 Content 与 headings 的语义见 [Astro 内容集合文档](https://docs.astro.build/en/guides/content-collections/#rendering-body-content)。避免将仍标注 experimental 的 Astro Container 当作第一阶段核心依赖。

npm 主题包应显式导出 `./theme`，在 package files 中包含 renderer、CSS 与资源，声明 SDK/Astro peerDependencies；正常 import 的图片/CSS/字体交给构建图处理。不要假设依赖包里的 public 目录会自动成为站点 public。确有固定文件名资源需求时，后续增加受控映射并统一放入 `/_themes/<id>/`，检查目标冲突；第一阶段优先普通模块资源，不开放任意复制到根目录的权限。

TypeScript alias 并不等于访问边界。需要 package exports、SDK/客户端入口隔离、解析后 import 依赖图检查共同约束；至少拒绝主题到宿主 Core、site.config、原始 content、`astro:content` 的依赖，包括别名和相对路径。npm 模块在构建时仍是可执行代码，此校验保证的是开发契约，不能声称它构成恶意代码沙箱。

**Override、Inheritance 与 Validator。**

第一阶段实现显式 `overrides.pages` 即可；override 的 renderer 也遵守公共 API 和 props 契约。继承保留下一版本方向，暂不启用 `extends`，遇到该字段给出明确“不支持”错误，避免用户误以为已发生继承。未来启用时再处理父主题定位、循环、engine 兼容、settings 合并和资源归属，不做同名文件自动覆盖。

第一阶段提供共享 `validateTheme()`，构建入口必调用；可用薄命令 `npm run theme:check` 对外暴露（当前尚不存在）。输出结构包含 severity、code、themeId、field/file、message，供未来 GUI/CLI 复用。

第一版覆盖 manifest、semver、required pages、settings 类型/default、capabilities、renderer 文件解析、override 路径、宿主私有依赖、已拥有路由/受控资源目标冲突。页面 `.astro` 的实际类型和编译错误仍由 Astro check/build 检查，不能仅凭路径存在就宣布兼容。SDK 导出带版本和将来的 deprecated 元数据；第一版没有已废弃 API，不伪造“任意动态代码的废弃接口检测”能力。

## Migration Plan

**预计目录。新增服务按真实职责拆分，不为每个名词增加空目录。**

```text
theme.config.mjs                 # 唯一的构建期主题选择/设置/显式 override
packages/theme-api/
  package.json                   # 明确 exports，支持打包而非只靠路径别名
  src/index.ts                   # defineTheme、公共数据和设置类型
  src/client.ts                  # 可序列化搜索数据、纯筛选/URL helper、安全解锁
  src/astro.ts                   # Astro 页面 props 类型
  src/SeoHead.astro               # 不包含布局和默认主题样式
src/core/
  posts.ts                       # 从 lib/posts 迁入/包装，沿用 Astro collection
  site.ts                        # 站点公共投影、旧配置适配
  routing.ts                     # 现有 URL、导航、查询参数
  taxonomy.ts                    # 现有频率统计与年月归档
  search.ts                      # 公开搜索条目，复用一份纯匹配逻辑
  seo.ts                         # 页面 SEO 数据和发布策略
  article.ts                     # 正文/加密载荷准备，复用原加密工具
src/theme/
  integration.mjs                # Astro integration + Vite 虚拟模块
  loader.mjs                     # 内置/本地/npm 解析
  schema.ts                      # Zod 校验，按实际构建方式提供 Node 可载入产物
  context.ts                     # Core services → 公开 ThemeContext
  runtime/                       # Astro dispatch 与内容 slot 适配
  fallbacks/                     # 小型独立 page/archive/404 渲染器
  virtual.d.ts                   # 宿主虚拟模块声明
src/themes/
  default/
    theme.mjs
    pages/                       # 迁入现有首页、关于、归档、文章
    layouts/                     # 现有 Base
    components/                  # 当前 PostCard、ArticleProse 等
    scripts/                     # 默认主题 DOM 交互与导航恢复
    styles/                      # 当前字体、全局 CSS、happyhues
  minimal/
    theme.mjs
    pages/                       # 独立文字首页、文章、归档/关于等
    styles/                      # 不导入 default CSS
src/pages/                       # 保留 Core 文件路由；RSS/Sitemap 仍由 Core 提供
content/blog/                    # 不改文章
docs/theme-api.md                # 实现阶段编写作者指南和错误契约
examples/theme-starter/          # 实现阶段给出可打包主题，使用公开 SDK
tests/theme-runtime.test.mjs     # 核心契约/loader/数据策略测试
```

SDK 的 Node 入口应先有可执行 JS 和 declarations，再由 manifest/loader 引用，不能让 `npm ci && npm run build` 暗中依赖手动生成文件。构建顺序写进 package scripts。原 `lib/posts.ts` 和部分 utils 可暂作兼容 re-export，兼容方向指向新实现，不能同时维护两个内容查询系统。

**最小增量与每步完成标准。**

| 增量 | 工作 | 完成标准 |
| --- | --- | --- |
| M0：方案确认 | 审阅本文的边界、配置入口、加密适配和 fallback 选择 | 确认后才修改业务代码 |
| M1：公共数据边界 | SDK 核心类型、公开文章投影、URL/过滤纯逻辑；旧页面仍运行 | 核心用例证明草稿、密码和原始受保护摘要不会进入公共数据，URL 编码和过滤保持现有语义 |
| M2：Runtime 最小纵向接入 | manifest/loader/validator、Default home/post renderer、Core 路由薄化；优先验证加密 body 适配 | 首页、普通文章、加密文章可构建和阅读；不靠 Theme import Core 实现；尚未接入的页面仍走旧入口 |
| M3：完成 Default Theme | 迁移关于页/归档页、Base、组件、CSS、交互；接入搜索数据、SEO、RSS/Sitemap 共享策略 | 所有现有页面保留 URL、视觉与核心行为；默认主题不再读取宿主内部内容/配置 |
| M4：第二主题与扩展验证 | Minimal 文字列表和无现有 Header/Sidebar/Card 的文章页；显式 override、optional fallback、公开 Starter | 同份文章构建出两套明显不同页面；Minimal 可访问关于/归档、使用查询链接并解锁既有加密文章 |
| M5：完成阶段验收 | SDK 文档、打包 fixture、核心校验及两主题浏览器验收 | 打包后的主题经与外部包相同的 resolver 安装到隔离 fixture，在没有宿主 Core 源码依赖的情况下构建 |

M1–M3 中间态可以逐步接入，但不能把“迁入 themes 目录却继续相对导入 Core”算作阶段完成。M4 的外部主题解析和 M5 的 package fixture 是必要的架构证据；只写两条硬编码 if/else 不足以证明 npm 主题边界。

**验证安排遵守当前仓库要求。**

本轮只有审查文档，不跑测试。实现阶段只为 Core 内容公开策略、URL/搜索语义、主题契约/加载/fallback/设置、加密载荷等核心功能补测试；不新增配色排列、每条 CSS 或源码字符串断言。按相关核心增量完成后统一运行类型检查与对应核心测试，不每搬一个组件就跑全套。

Default 继续使用现有导航、筛选、加载更多、阅读工具、主题切换、加密和前进/后退浏览器测试。Minimal 用自己的语义选择器验证内容一致、链接正确、筛选和解锁可用，不能要求它拥有 `.post-card` 或 `#ui-float-right`。对两个主题分别构建并检查产物无密码/受保护正文/目录泄漏，RSS/Sitemap/SEO 策略一致。人工浏览器检查覆盖默认主题桌面/移动端视觉、第二主题独立布局、正常链接与刷新行为；完成全部所需检查后不重复无关测试。

**第一阶段十项验收。**

1. 当前 UI 完整成为 Default Theme，视觉与现有核心行为保留。
2. Core 控制内容和路由，Default 通过公开上下文取数据。
3. Theme API 有明确类型、参数、输出、公开策略和错误约定。
4. 每个主题有 manifest、engine、capabilities、pages、settings schema。
5. Loader 可解析内置、本地与 npm 包契约，拒绝无效主题。
6. Default 与 Minimal 均可完整构建。
7. 两个主题来自同一份内容集合与站点数据，公开文章集合一致。
8. Minimal 的首页和文章页面明显不同，不依赖现有 Base、Header、Sidebar、Card。
9. 切换主题仅改变主题配置并重新构建，不改 Markdown/frontmatter。
10. 两个主题及 Starter 的依赖检查不访问 Core internal；打包 fixture 实际验证公开 SDK 边界。

**可能的 breaking changes 与迁移风险。**

| 项目 | 影响/风险 | 控制方式 |
| --- | --- | --- |
| theme 字段含义与编辑位置 | 从配色名称变为布局主题，选择入口建议移到 `theme.config.mjs` | `happyhues` 别名、单一来源引用、旧设置兼容映射和清楚的迁移说明 |
| DTO 与原始 BlogPost | `post.data.*`、Date、ImageMetadata 不再是外部主题契约 | Default 使用适配后的 props；旧宿主 import 暂保留兼容，新增 SDK 明确序列化边界 |
| 文件移动 | scoped CSS 标识、相对资源、脚本导入和 TypeScript include 范围可能变化 | 分批迁移与人工 UI 对比；更新 SDK/themes 检查范围，不顺便改样式 |
| 加密内容适配 | 旧载荷内含默认主题 TOC DOM；新 body 协议会影响解锁、TOC、清理 | 保持加密算法；内容 envelope 独立版本；先验证核心链路，检查两主题产物与解锁后生命周期 |
| ClientRouter 和滚动恢复 | 导航状态依赖 history index 和 swap 前的高度恢复 | Default 保持现有机制；不强制 Minimal 使用同一客户端路由层 |
| 全局 CSS/脚本污染 | 新主题可能误带默认配色、隐藏滚动条和按钮逻辑 | 从选中 renderer 的依赖图加载；Minimal 产物和浏览器确认独立 |
| Optional fallback | 错误 fallback 可能丢失列表、about 内容或 404 语义 | 采用语义兼容 renderer，明确告警，不返回首页冒充成功 |
| SEO 统一 | 增加 canonical 或规范 title 可能改变已有 head | 保持 robots/RSS/Sitemap 规则；新增 SEO 字段单独审阅，不同步更换 URL/trailing slash 策略 |
| npm/Windows/Linux | package exports、文件大小写、file URL 和路径分隔符会导致本地成功但 CI 失败 | Node 标准解析与路径 API；本地包 fixture 加 Linux CI 验证 |
| 资源和部署边界 | 发布旧/新脚本混合产物会破坏加密适配；依赖 public 不会自然成为宿主资源 | 每个主题完整构建 dist；正常资源 imports；本轮不改现有部署策略 |

预计不需要的破坏性变更：更换 Astro 或内容引擎、搬动文章目录、更换文章 URL、要求新 frontmatter、替换 nginx 托管或安装数据库。该判断是基于当前源码的迁移方案，不是已经通过两主题运行验证的结论。

**已采用的方案**：按 M1–M5 执行；Default 保留现有网站，Minimal 提供独立布局并附带 Starter；使用小型公开 SDK 和构建期 Loader；保留当前路由；采用显式页面 override，暂不实现继承；已有加密文章属于第一阶段验收范围。
