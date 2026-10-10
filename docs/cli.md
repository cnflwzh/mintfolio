# Mintfolio 命令行

CLI 随 `@mintfolio/core` 发布，包提供 `mintfolio` 可执行命令。支持 Windows、macOS 和 Linux，要求 Node.js >= 22.12.0。

## 安装和入口

推荐全局安装一次，之后在任何站点里直接使用 `mintfolio`：

```sh
npm install -g @mintfolio/core
mintfolio --help
mintfolio --version
```

全局安装只提供入口；每个站点仍在 `_mintfolio/` 中独立安装并锁定自己的 Core、Astro 和主题。在站点里运行全局 `mintfolio` 时，它会把命令交给该站点安装的 Core 执行，因此不同站点可以使用不同版本。`mintfolio doctor` 可查看站点的版本。已有站点可使用 `mintfolio upgrade` 更新 Core；更新前先停止开发服务，更新后重新启动。

不想全局安装时，可以在 `_mintfolio/` 中运行 `npx mintfolio …` 或 `npm run dev`。

命令会从当前目录向上找到站点，因此在站点根目录、文章子目录或 `_mintfolio/` 里都能运行。`mintfolio --cwd <站点目录> ...` 或 `mintfolio -C <站点目录> ...` 可指定站点；该选项放在命令前。

## 交互菜单

直接运行 `mintfolio`（不带参数）会打开菜单，用方向键选择、回车确认、Esc 返回：

- 写一篇新文章：依次询问标题、文件名、分类、标签、摘要和是否立即发布，分类和标签可从已有内容中选择，创建后可直接用编辑器打开。
- 管理文章：从列表（文章多时可输入搜索）中选择，发布、设为草稿或打开编辑。
- 本地预览、构建网站、检查内容。
- 主题与外观：按主题提供的字段逐项调整设置（例如配色），或切换、安装主题。
- 站点资料：修改标题、简介、所在地等常用字段；社交链接、项目等列表在编辑器中修改。
- 更多：预览构建结果、环境检查、升级 Core。

在还不是站点的目录里运行，会提示把当前目录变成站点或新建站点目录。

所有功能仍然可以通过完整命令使用。命令缺少必要参数时（例如 `mintfolio post new`、`mintfolio post publish`、`mintfolio theme use`、`mintfolio create`），会在终端中逐项询问或让你从列表里选择，已经给出的参数不会再问。在 CI、管道中，或加上 `--no-interactive` 时不会询问，缺少参数直接报错，适合脚本使用。

## 新站点与日常运行

```sh
mintfolio create my-blog
mintfolio create my-blog --theme verdant
cd my-blog
mintfolio dev
mintfolio dev --drafts
mintfolio build
mintfolio preview
mintfolio check
mintfolio check --json
mintfolio doctor --json
```

`create` 需要空目录：在其中创建 `_mintfolio/`、安装 Core、生成站点配置和 `/links` 独立页面，并在根目录放一篇示例文章；可同时安装并启用主题。

已经有一个放着 Markdown 笔记的目录时，在其中运行 `mintfolio init`（可加 `--theme verdant`）。它创建 `_mintfolio/` 并安装 Core，已有的文章、配置和同名 npm scripts 都不会被覆盖；目录里已经有文章时不会添加示例文章。若安装中断，重新运行 `mintfolio init` 即可继续。

`dev/build/preview/sync` 的附加参数传给 Astro，例如 `mintfolio dev --port 4322`；`--config` 和 `--root` 由 Core 指定，不能手动传入。`dev --drafts` 是 Core 的专用选项，只在此次开发服务中显示草稿和未来文章；其余参数继续传给 Astro。`build`、`preview` 和 `sync` 不接受 `--drafts`，并清除继承的草稿预览环境变量。`preview` 只查看已有生产文件。CLI 不自动部署站点。

`check` 先检查站点/主题和执行 Astro sync，再检查站点根目录中的文章和 `_mintfolio/pages` 中的页面。缺失文章链接、图片和重复地址是错误，返回非零退出状态；可能受主题插件影响的锚点、Markdown 源文件链接、已有页面目录内的未知地址是警告。日志包含 `文件:行:列 CODE 说明`，不输出文章正文或密码。检查包含草稿、未来文章和密码文章，忽略外链、代码示例及无法确认的主题路由。自定义 loader/base、网络资源及最终渲染结果需另行验证；生产构建仍使用 `build`。

`check --json` 的 stdout 只输出一个 `{ status, environment, sync, content }` JSON 对象；`content` 包含 `errors`、`warnings` 和 `counts`，Astro sync 日志写入 stderr。即使 sync 失败，仍尽量返回内容诊断。该命令不替代编辑器或项目自己的 TypeScript 检查。

## 站点目录

站点根目录就是文章目录，其他东西都在 `_mintfolio/` 里：

```
my-blog/
  hello.md               文章；子目录也可以，例如 travel/beach.md
  travel/beach.md
  images/beach.jpg       文章可以用相对路径引用旁边的图片
  README.md              仓库说明，不会发布
  _mintfolio/
    site.config.ts       站点资料：标题、作者、社交链接、项目、统计等
    theme.config.mjs     当前主题及其设置（settings）
    pages/               独立页面，例如 pages/links.md → /links
    public/              原样发布的静态文件
    package.json         依赖与 npm scripts（node_modules 也在这里）
    dist/                build 的输出
```

站点根目录及子目录中的 `.md` 文件都是文章，以下除外：

- 以 `_` 或 `.` 开头的文件和目录，例如 `_mintfolio/`、`_drafts/`、`.github/`；
- 根目录的仓库说明文件：`README`、`AGENTS`、`CLAUDE`、`CHANGELOG`、`LICENSE`、`CONTRIBUTING`、`SECURITY`、`CODE_OF_CONDUCT`（`.md`，不区分大小写）；
- `node_modules/`。

想暂时放一些不发布的笔记，可以放进 `_` 开头的目录。

Astro 需要的配置和内容集合由 Core 管理：每次运行 `dev`、`build`、`preview`、`sync` 或 `check` 前，CLI 都会在 `_mintfolio/.generated/` 中重新生成它们，不要手动修改。`.generated/`、`.backups/` 自带忽略规则；`node_modules/`、`dist/`、`.astro/` 由 `_mintfolio/.gitignore` 忽略。站点必须通过 `mintfolio` 命令运行，不能直接执行 `astro dev`。

需要额外的 Astro 设置（例如部署子目录的 `base`、远程图片白名单）时，可以添加可选的 `_mintfolio/astro.config.mjs`，只写这些设置，Core 会把它与自己的配置合并：

```js
export default {
  base: '/blog-site/',
  image: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] },
};
```

这个文件里不要引入 `@mintfolio/core`，也不能修改 `srcDir`。

在 CI 中构建时，依赖安装和构建都在 `_mintfolio/` 中进行，例如 GitHub Actions 里给相关步骤加上 `working-directory: _mintfolio`，并上传 `_mintfolio/dist`。

### 从旧布局升级

0.3 及更早的站点把所有文件都放在根目录。新版 Core 发现旧布局时会停止并说明需要处理的文件。按以下步骤调整：

1. 新建 `_mintfolio/`，把 `package.json`、`package-lock.json`、`site.config.ts`、`theme.config.mjs`、`public/`，以及头像等被 `site.config.ts` 引用的文件移进去；删除根目录的 `node_modules/` 后在 `_mintfolio/` 中重新 `npm install`。
2. 把 `content/blog/` 里的文章移到站点根目录，把 `content/pages/` 移为 `_mintfolio/pages/`，然后删除 `content/`。
3. 删除 `src/content.config.ts`（内容集合由 Core 管理）和 `tsconfig.json`。
4. 打开当前主题的 `theme-<主题>.config.mjs`，把 `export default` 后面的对象复制到 `theme.config.mjs` 的 `settings`，然后删除所有 `theme-*.config.mjs`。
5. 删除 `astro.config.mjs`；若其中有 `base`、`image` 等额外设置，只保留这些设置，去掉 `mintfolio()` 和 `theme.config.mjs` 的引入，放到 `_mintfolio/astro.config.mjs`。
6. 更新 CI：安装和构建步骤改在 `_mintfolio/` 中运行，产物目录改为 `_mintfolio/dist`。

## 文章

```sh
mintfolio post new "我的第一篇文章" --slug first-post
mintfolio post new "一次旅行" --slug life/travel --description "沿途见闻" --category 生活 --tags 旅行,随笔
mintfolio post new "准备发布的文章" --slug ready --date 2026-09-11 --publish
mintfolio post list
mintfolio post list --draft --json
mintfolio post list --scheduled
mintfolio post list --publishable
mintfolio post list --published --json # --publishable 的兼容别名
mintfolio post publish first-post
mintfolio post draft first-post
```

新文章写在站点根目录，默认 `draft: true`。省略 `--slug` 时按标题生成名称，保留中文；显式 ID 可以包含目录，例如 `life/travel`。同名文件不会被覆盖。`--date` 使用本地当天日期作为默认值。

`publish` 只把草稿字段设为 false，不执行构建或部署。已经到达 `pubDate` 时提示“可参与下一次构建”；日期仍在未来时提示“发布日期尚未到达”，并显示完整 UTC 时间。`draft` 将文章移回草稿状态。修改保留其他 frontmatter 字段、注释及 Markdown 正文，并备份原文件。

`list` 与生产构建使用同一套发布条件，并在一次操作开始时固定检查时间：`draft: true` 是草稿；非草稿且 `pubDate` 晚于检查时间的是定时文章；非草稿且日期小于或等于检查时间的是可参与构建的文章。这些状态不表示网站上已经部署了该文章。`--draft`、`--scheduled`、`--publishable` 分别筛选三种状态；`--published` 保留为 `--publishable` 的兼容别名，也会排除未到期文章。不同状态的筛选参数不能同时使用。

文本列表显示完整 UTC 发布时间。`list --json` 保留原有 `slug`、`title`、`date`、`draft` 字段，增加 `status`（`draft`、`scheduled`、`publishable`）与 ISO UTC 格式的 `publishedAt`；不输出密码或正文。

未来发布日期不会在静态站点上自动触发发布。需要在到期后重新执行构建和部署，也可以由自己的 CI 安排定时构建；Core 不启动后台定时任务。精确到小时的发布日期建议在 frontmatter 使用带时区偏移的 ISO 日期，例如 `pubDate: 2026-10-01T09:00:00+08:00`。`--date YYYY-MM-DD` 适合按日期写作；仅日期的值按 UTC 午夜解析。

常用可选 frontmatter 字段包括 `updatedAt`、`slug`、`aliases`、`pinned`、`series`、`seriesOrder`、`authors` 和 `seo`。`slug` 提供独立于文件名的文章地址，例如 `notes/hello` 对应 `/blog/notes/hello`；`aliases` 是旧站内根路径数组，例如 `["/old-post"]`。CLI 的 `post new --slug` 仍决定文件位置，文章管理命令接收文件 ID；需要固定永久链接时在 frontmatter 单独填写 `slug`。

## 独立页面

将 Markdown 放入 `_mintfolio/pages`，例如 `_mintfolio/pages/links.md` 对应 `/links`。页面至少填写 `title`，可使用 `description`、`slug`、`aliases`、`draft`、`updatedAt` 和 `seo`；无需文章的 `pubDate`。Core 保留的首页、文章归档、关于页、订阅源等地址不能被覆盖。

`blog` 与 `pages` 内容集合由 Core 注册，不需要额外配置。

页面入口由站点 `navigation` 配置控制。配置数组会替换默认导航，因此设置时同时保留需要的首页、归档和关于入口。

## 主题

```sh
mintfolio theme list
mintfolio theme current
mintfolio theme install verdant
mintfolio theme install @example/theme@1.2.3 --use
mintfolio theme use verdant
mintfolio theme use minimal
mintfolio theme use ./my-theme
mintfolio theme init
mintfolio theme check
```

`install` 接收 npm 包名，可附加版本、范围或标签；`verdant` 映射到 `@mintfolio/theme-verdant`。只有加 `--use` 才同时切换。

主题和主题设置都写在 `theme.config.mjs`：

```js
export default {
  theme: '@mintfolio/theme-verdant',
  settings: {
    // 初始配色……
    initialPalette: '1',
  },
};
```

`use` 校验目标主题，把 `theme` 改为新主题，并把新主题带注释的完整设置模板写入 `settings`，便于直接查看和修改全部选项；显式页面 overrides 保持不变。`settings` 只对当前主题生效，切换前的设置会完整保存在 `_mintfolio/.backups/` 的备份中，需要时可从备份复制回来。

`init` 在 `settings` 为空时写入当前主题的设置模板；已有设置保持不变。没有填写的字段使用主题默认值。

`theme list` 显示内置 Minimal、直接依赖中的主题包及当前本地主题。没有删除或卸载命令；这版聚焦创建、安装、选择和编辑。

兼容旧命令：`theme:add` → `theme install`，`theme:init` → `theme init`，`theme:check` → `theme check`。`theme sync` 已移除，因为不再生成每个主题的独立配置文件。

## 配置

```sh
mintfolio config get site
mintfolio config get site site.title
mintfolio config set site site.title "新的博客名称"
mintfolio config set site profile.bio "记录与分享"
mintfolio config set site blog.pageSize 12
mintfolio config set site blog.timezone Asia/Hong_Kong
mintfolio config set site feed.content full
mintfolio config set site feed.limit 30
mintfolio config set site seo.defaultSocialImage /images/share.png
mintfolio config get theme
mintfolio config set theme initialPalette 3
mintfolio config set theme homePageSize 9
mintfolio config set theme sidebar.quote.enabled true
mintfolio config set theme sidebar.quote.text "保持好奇。"
mintfolio config get theme --theme minimal
mintfolio config schema theme
mintfolio config path theme
mintfolio config edit theme
```

`site` 修改 `site.config.ts`，也识别主题选择配置中明确指定的 `siteConfig` 路径；`theme` 修改 `theme.config.mjs` 中的 `settings`。`get` 和 `schema` 可加 `--theme <主题>` 查看未启用主题的默认值和字段；`set`、`path`、`edit` 只针对当前主题，修改其他主题请先 `theme use`。

字段用点号分隔，例如 `sidebar.quote.enabled`；已存在的数组元素可用 `social.0.url`。数组和对象整体传 JSON，示例：

```sh
mintfolio config set site contact.social '["github","email"]'
mintfolio config set site authors '[{"id":"writer","name":"作者","url":"https://example.com"}]'
mintfolio config set site navigation '[{"id":"home","label":"首页","url":"/"},{"id":"blog","label":"文章","url":"/blog"},{"id":"links","label":"友链","url":"/links"}]'
mintfolio config set theme sidebar.tools '[{"name":"示例工具","description":"工具说明","url":"https://example.com"}]'
```

`blog.pageSize` 接受 1–100 的整数，`blog.timezone` 接受有效的 IANA 时区。`feed.limit` 接受 1–1000，`feed.content` 为 `summary` 或 `full`。作者需要唯一 `id` 和非空 `name`；文章 `authors` 填写对应 ID。导航项需要 `id`、`label` 和站内根路径或 HTTP(S) URL。`config schema site` 可查看完整字段。

默认按照字段类型读取值：配色编号 `3` 保持字符串，文章数量 `9` 是数字，开关 `true` 是布尔值。`--json` 强制将参数作为 JSON；不同终端有自己的引号规则，复杂数组也可通过 `config edit` 修改。

站点配置按语法读取，不执行图片导入、函数或其他表达式；动态叶子会显示为 `{ "$expression": "原表达式" }`。支持直接导出的对象、顶层 `const` 别名、`defineSiteConfig({...})`、TypeScript `as`/`satisfies`。含展开、计算属性或不明确容器的字段不能自动改写，可用 `config edit` 编辑。普通字段修改保留 imports、注释和其他字段，只替换目标值。

主题 `get` 返回合并默认值后的有效设置；`set` 只写入指定字段，保留 `settings` 中的注释和其他字段。

`config edit` 默认在 Windows 使用记事本、macOS 使用默认文本编辑器、Linux 使用 `xdg-open`。可设置 `VISUAL`/`EDITOR`，或传 `--editor <可执行文件路径>`。编辑器选项只接收程序路径，不接受 shell 命令或附加参数。

## 保留与恢复

配置和草稿状态修改前，会将原文件完整备份到 `_mintfolio/.backups/<时间和唯一编号>/`，命令输出具体位置。需要恢复时，把备份复制回对应原路径即可。`.backups/` 自带忽略规则，不会进入 Git。

未知命令、无效配置值、重复文章和失败的 npm/Astro 命令都会以非零状态退出，可用于脚本。CLI 不覆盖已有文章、不移除主题包、不操作 Git 提交，也不自动发布到远程服务器。
