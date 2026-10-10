# 博客功能与日常写作

Core 在构建时读取 Markdown、生成页面与订阅文件。部署后只需要能够托管静态文件的服务；阅读、搜索、文章解锁等交互在浏览器中完成。本页说明内容和配置契约，具体布局及控件由主题呈现。

## 一篇完整的文章

把文章保存到 `content/blog/**/*.md`，例如 `content/blog/notes/start.md`：

```md
---
title: "搭建我的静态博客"
description: "记录写作目录、文章链接和部署方式。"
pubDate: "2026-09-01T09:00:00+08:00"
updatedAt: "2026-09-02T18:30:00+08:00"
slug: "guides/my-blog"
aliases:
  - "/blog/old-start"
category: "开发"
tags: ["Astro", "写作"]
pinned: true
series: "博客搭建笔记"
seriesOrder: 1
authors: ["alice"]
cover: "/images/blog-cover.webp"
draft: false
seo:
  title: "搭建静态博客：目录、链接与部署"
  description: "使用 Mintfolio 管理 Markdown 文章和独立页面。"
  image: "/images/blog-share.webp"
  imageAlt: "博客首页的分享图片"
---

从这里开始写正文。

## 目录和链接

文章内容使用 Markdown。
```

只有 `title` 和 `pubDate` 是文章必填字段。`description` 默认空字符串；建议主动填写便于文章列表、搜索和摘要订阅展示的简短介绍。

| 字段 | 含义 |
| --- | --- |
| `updatedAt` | 手动维护的最后更新时间。用于主题元数据、文章 SEO 和 Sitemap 的 `lastmod`。 |
| `slug` | 与文件名分离的文章路径。上例生成 `/blog/guides/my-blog`。 |
| `aliases` | 需要保留的旧站内地址列表，生成跳转到当前地址的静态页面。 |
| `pinned` | 是否置顶。普通文章列表中置顶文章优先；同组按发布日期倒序。 |
| `series` / `seriesOrder` | 系列名称及系列内顺序。顺序为非负整数，未填写的排在有顺序值的文章之后。 |
| `authors` | 作者 ID 数组，引用站点配置中的作者注册表；未知 ID 会报错。 |
| `category` / `tags` | 单个分类和标签数组，并生成对应静态归档入口。 |
| `cover` | 文章封面路径或 HTTP(S) URL。 |
| `draft` | 草稿标记，默认 `false`；CLI 新建文章默认是草稿。 |
| `password` | 可选非空密码。密码文章的公开摘要由 Core 替换，正文和目录以密文输出。 |
| `seo` | 可选文章级搜索与分享元数据，见下文。 |

Core 从公开文章正文计算 `wordCount` 和 `readingMinutes`，不需要写在 frontmatter 中。统计会跳过代码块等非正文内容，汉字逐字计数，其他字母与数字的连续片段按词计数，按每分钟 240 字词估算，最少 1 分钟。密码文章不生成公开正文统计。

系列页和系列目录依据 `series` 组织内容；Core 还提供按系列、标签及分类计算的相关文章。主题可使用这些数据呈现系列导航和推荐区。

## 草稿、未来文章与时间

```sh
mintfolio dev --drafts
```

只有显式使用这个命令的本地开发会显示草稿和未来日期文章。预览文章标记为 `noindex`；公开搜索索引、订阅与 Sitemap 仍只使用已发布内容。

普通 `mintfolio dev` 和 `mintfolio build` 同时要求 `draft: false` 且 `pubDate` 不晚于当前时间。`build`、`preview` 和 `sync` 不接受 `--drafts`；`preview` 只预览已经生成的生产文件。

建议日期写成带时区的 ISO 8601 字符串，例如 `"2026-09-01T09:00:00+08:00"`，使不同构建机器使用同一时间点。只写日期会按 JavaScript 日期解析规则处理。`blog.timezone` 控制年月归档分组，不会替没有时区的时间补充时区。

未来日期过滤不会让已经部署的静态文件自动变化。需要定时发布时，由你使用的 CI 或托管服务在指定时间重新构建并部署；Core 不启动常驻计时服务。

## 稳定链接和旧地址

`slug` 是相对的逻辑路径，不能以 `/` 开头，不能包含空路径段、`.`、`..`、反斜杠、`?`、`#` 或预先编码的 `%`。可以写 `guides/first-blog`，也可以直接写中文；Core 负责逐段 URL 编码。

文章未填写 `slug` 时沿用内容文件 ID。固定 `slug` 后，移动或重命名源文件不会改变公开地址。若要修改已有公开地址，应把旧地址加入 `aliases`。

`aliases` 使用以单个 `/` 开头的站内根路径，例如 `/blog/old-name`；不接受外部 URL、查询参数、片段、尾部空段或路径穿越。它与 `slug` 的区别是：`slug` 写内容路径，`aliases` 写完整的旧站内路径。

别名生成 HTML 跳转页，包含刷新跳转、canonical 和可点击的新地址。它适用于纯静态托管，不会配置服务器级 HTTP 301。重复地址、占用内置路由或与其他内容/别名冲突时，Core 会中止构建。

## 独立 Markdown 页面

在站点的 `src/content.config.ts` 注册 `pages` 集合：

```ts
import { createBlogCollection, createPageCollection } from '@mintfolio/core/content';

export const collections = {
  blog: createBlogCollection(),
  pages: createPageCollection(),
};
```

默认目录分别是 `content/blog` 和 `content/pages`；需要其他目录时，可传入相对站点根目录的 `base`。

例如 `content/pages/friends.md`：

```md
---
title: "友情链接"
description: "我常读的独立博客。"
slug: "friends"
updatedAt: "2026-09-02T18:30:00+08:00"
draft: false
---

- [朋友的博客](https://example.org/)
```

这会生成 `/friends`。独立页面支持 `title`、`description`、`slug`、`aliases`、`draft`、`updatedAt` 和 `seo`，不需要文章发布日期，也不进入博客文章列表或文章订阅。保留的内置路径（例如 `/about`、`/blog`）不能被自定义页面覆盖。

## 站点配置、菜单和作者

下面可作为 `site.config.ts` 的内容示例：

```ts
import { defineSiteConfig } from '@mintfolio/core/config';

export default defineSiteConfig({
  site: {
    title: 'Alice 的博客',
    url: 'https://blog.example.com',
    description: '关于代码与生活的笔记',
    language: 'zh-CN',
  },
  profile: { name: 'Alice', avatar: '/images/avatar.webp' },
  blog: {
    pageSize: 10,
    timezone: 'Asia/Shanghai',
  },
  authors: [
    {
      id: 'alice',
      name: 'Alice',
      url: 'https://blog.example.com/about',
      avatar: '/images/avatar.webp',
      bio: '写代码，也写文章。',
    },
  ],
  navigation: [
    { id: 'home', label: '首页', url: '/' },
    { id: 'archive', label: '文章', url: '/blog' },
    { id: 'friends', label: '友链', url: '/friends' },
    { id: 'github', label: 'GitHub', url: 'https://github.com/example' },
  ],
  seo: {
    defaultSocialImage: '/images/social.webp',
    twitterSite: '@example',
  },
  feed: {
    limit: 50,
    content: 'summary',
  },
});
```

`blog.pageSize` 默认 10，范围为 1–100。`blog.timezone` 默认 `UTC`，使用有效的 IANA 时区名称。`navigation` 按数组顺序传给主题；不设置时保留首页、全部文章、关于我三个默认入口。菜单只是导航数据，填写 `/friends` 之前仍需创建对应页面。

作者 ID 必须唯一，作者姓名不能为空；作者 `url` 使用完整 HTTP(S) URL。不指定文章作者时，SEO 和订阅使用站点个人资料的姓名。作者注册表提供文章署名与公开元数据，主题决定如何显示。

## 归档与搜索

Core 生成以下独立静态地址：

| 地址示例 | 用途 |
| --- | --- |
| `/blog`、`/blog/page/2` | 文章归档与分页 |
| `/tags/Astro`、`/tags/Astro/page/2` | 标签归档与分页 |
| `/categories/开发` | 分类归档 |
| `/series/博客搭建笔记` | 系列文章归档 |

分类、标签及系列名称会进行 URL 编码。只有内容和页数需要的页面才会生成。现有 `/blog?tag=...`、`/blog?category=...` 查询形式继续用于浏览器筛选。

搜索索引包含公开文章标题、摘要及正文文本，支持正文命中。草稿和未来文章不进入公开索引；密码文章只保留安全公开元数据，密码、原摘要和正文不会进入索引；`seo.noindex` 文章也不进入公开搜索。索引是构建出的静态数据，查询在浏览器执行，不需要搜索后端。主题负责搜索框、结果列表及命中展示。

## SEO 与订阅

文章和独立页面的 `seo` 可设置 `title`、`description`、`image`、`imageAlt`、`canonical`、`noindex`。`canonical` 必须为完整 HTTP(S) URL，一般无需设置；转载等确需指向原文的场景再使用。

Core 生成 canonical、robots、Open Graph、Twitter Card，以及公开可索引文章的 `BlogPosting` JSON-LD。JSON-LD 包含标题、摘要、发布日期、修改时间、作者等公开元数据，不包含文章正文。图片优先使用文章 `seo.image`，其次为封面，最后为 `seo.defaultSocialImage`。

使用公共 `SeoHead` 的主题会渲染这些数据，并添加订阅自动发现链接。密码文章和预览文章强制 `noindex`，不会通过文章级 SEO 覆盖重新公开私密信息。`noindex` 是搜索索引策略，不是访问控制；普通 `noindex` 页面仍可通过地址访问。

| 地址 | 输出 |
| --- | --- |
| `/rss.xml` | RSS 2.0 |
| `/feed.json` | JSON Feed 1.1 |
| `/atom.xml` | Atom 1.0 |
| `/sitemap.xml` | 公开文章、独立页面及静态归档分页的 Sitemap |
| `/robots.txt` | 声明 Sitemap 地址的静态爬虫配置 |

`feed.limit` 默认 50，范围为 1–1000。`feed.content` 默认为 `summary`；改为 `full` 后，三种订阅都输出公开文章的完整语义 HTML。全文使用 Astro 的 Markdown 渲染结果，转换相对链接和图片地址，并清理脚本、事件属性、交互嵌入及布局样式；阅读器不会获得主题的交互控件。

订阅按发布日期倒序，置顶状态不改变订阅时间顺序。密码文章、草稿、未来文章、预览文章和 `seo.noindex` 文章均不进入订阅与 Sitemap。Sitemap 不收录 canonical 指向另一地址的内容，文章 `lastmod` 使用 `updatedAt`，未填写时使用 `pubDate`；不会仅因重新构建就把所有页面标为刚更新。

## 发布前检查

```sh
mintfolio check
mintfolio check --json
mintfolio build
mintfolio preview
```

`check` 先检查环境和主题并同步 Astro 内容类型，再检查默认内容目录中的本地文章链接、锚点、图片和地址冲突。它不联网探测外部网站。明确错误返回非零退出状态；无法确定的锚点等情况可能作为警告报告，便于结合 Markdown 插件和实际页面确认。`--json` 可供 CI 读取结构化诊断。

检查器也会检查草稿、未来文章和密码文章的源文件质量；诊断不输出密码、正文或完整链接目标。目前 CLI 不会自动发现自定义 loader 或自定义内容目录，使用自定义 base 的站点仍需结合实际构建检查这些文件。

这些能力负责内容模型、静态路由和公共数据，并不等于每个主题都会显示所有可选区块。主题开发者可据此实现更新时间、阅读时长、系列目录、相关文章和自定义页面；实际发布前仍应构建并检查所选主题的页面呈现。

格式参考：[JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)、[Astro 全文 RSS 注意事项](https://docs.astro.build/en/recipes/rss/)、[Google 文章结构化数据](https://developers.google.com/search/docs/appearance/structured-data/article)。
独立页面不支持 `password`；该字段会导致校验失败，避免把本应加密的文章误放到公开页面集合。需要密码保护时请使用 blog 集合。标签地址由 Core 编码，路径分隔符和不适用于 Windows 的字符采用稳定的 `~` 转义，主题直接使用 `term.url`。
