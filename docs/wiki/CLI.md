# Mintfolio 命令行

CLI 随 `@mintfolio/core` 发布，包提供 `mintfolio` 可执行命令。支持 Windows、macOS 和 Linux，要求 Node.js >= 22.12.0。

## 安装和入口

在已安装 Core 的站点里，使用 `npx mintfolio`；全局安装后可直接使用 `mintfolio`：

```sh
npm install -g @mintfolio/core
mintfolio --help
mintfolio --version
```

全局安装只提供命令；每个站点仍独立安装并锁定自己的 Core、Astro 和主题。开发及构建使用该站点安装的 Astro。`mintfolio doctor` 可同时查看 CLI 和站点的版本。已有站点可使用 `mintfolio upgrade` 更新 Core；更新前先停止开发服务，更新后重新启动。

多数命令会从当前目录向上找到站点根目录，因此在 `content/blog` 子目录也能操作。`mintfolio --cwd <站点目录> ...` 或 `mintfolio -C <站点目录> ...` 可指定站点；该选项放在命令前。

## 新站点与日常运行

```sh
mintfolio create my-blog
mintfolio create my-blog --theme verdant
cd my-blog
mintfolio dev
mintfolio build
mintfolio preview
mintfolio check
mintfolio doctor --json
```

`create` 需要空目录，会安装 Core、生成网站配置与示例文章，可同时安装并启用主题。

已有目录按传统流程安装 Core 后，执行 `mintfolio init` 补齐文件。初始化不会覆盖已有配置、文章或同名 npm scripts。若安装中断，可在新目录内继续 `npm install` 和 `mintfolio init`。

`dev/build/preview/sync` 的附加参数传给 Astro，例如 `mintfolio dev --port 4322`。`check` 运行站点/主题检查和 Astro sync；生产构建仍使用 `build`，它们不代替编辑器或项目自己的 TypeScript 检查。CLI 不自动部署站点。

## 文章

```sh
mintfolio post new "我的第一篇文章" --slug first-post
mintfolio post new "一次旅行" --slug life/travel --description "沿途见闻" --category 生活 --tags 旅行,随笔
mintfolio post new "准备发布的文章" --slug ready --date 2026-09-11 --publish
mintfolio post list
mintfolio post list --draft --json
mintfolio post publish first-post
mintfolio post draft first-post
```

新文章位于 `content/blog`，默认 `draft: true`。省略 `--slug` 时按标题生成名称，保留中文；显式 ID 可以包含目录，例如 `life/travel`。同名文件不会被覆盖。`--date` 使用本地当天日期作为默认值。

`publish` 只把草稿字段设为 false，使文章可进入下一次构建；它不会执行部署。`draft` 将文章移回草稿状态。修改保留其他 frontmatter 字段、注释及 Markdown 正文，并备份原文件。`list` 只显示 ID、标题、日期和草稿状态，不输出密码或正文。

CLI 的文章命令采用默认 `content/blog` 目录。自行更换内容集合 loader/base 的站点，应直接管理其自定义目录中的文章。

## 主题

```sh
mintfolio theme list
mintfolio theme current
mintfolio theme install default
mintfolio theme install @example/theme@1.2.3 --use
mintfolio theme use default
mintfolio theme use minimal
mintfolio theme use ./my-theme
mintfolio theme init default
mintfolio theme sync
mintfolio theme check
```

`install` 接收 npm 包名，可附加版本、范围或标签；`default` 和 `happyhues` 都映射到 `@mintfolio/theme-default`。安装后生成完整主题配置，只有加 `--use` 才同时切换。再次生成配置保留已有文件。

`use` 校验目标主题并修改 `theme.config.mjs`，保留显式页面 overrides。旧的内联 `settings` 会先迁移到旧主题自己的配置文件，再清空内联覆盖，因此切回旧主题时仍保留个性化设置。动态内联表达式不能自动迁移，CLI 会明确报错且不切换主题。

`theme list` 显示内置 Minimal、直接依赖中的主题包及当前本地主题。没有删除或卸载命令；这版聚焦创建、安装、选择和编辑。

兼容旧命令：`theme:add` → `theme install`，`theme:init` → `theme init`，`theme:sync` → `theme sync`，`theme:check` → `theme check`。

## 配置

```sh
mintfolio config get site
mintfolio config get site site.title
mintfolio config set site site.title "新的博客名称"
mintfolio config set site profile.bio "记录与分享"
mintfolio config get theme
mintfolio config set theme initialPalette 3
mintfolio config set theme homePageSize 9
mintfolio config set theme sidebar.quote.enabled true
mintfolio config set theme sidebar.quote.text "保持好奇。"
mintfolio config set theme maxWidth 900 --theme minimal
mintfolio config schema theme
mintfolio config path theme
mintfolio config edit theme
```

`site` 修改 `site.config.ts`，也识别主题选择配置中明确指定的 `siteConfig` 路径；`theme` 修改当前主题的专属文件。添加 `--theme <主题>` 可编辑未启用主题。主题配置文件支持要求站点 Core >= 0.1.1，旧版请先 `mintfolio upgrade`。

字段用点号分隔，例如 `sidebar.quote.enabled`；已存在的数组元素可用 `social.0.url`。数组和对象整体传 JSON，示例：

```sh
mintfolio config set site contact.social '["github","email"]'
mintfolio config set theme sidebar.tools '[{"name":"示例工具","description":"工具说明","url":"https://example.com"}]'
```

默认按照字段类型读取值：配色编号 `3` 保持字符串，文章数量 `9` 是数字，开关 `true` 是布尔值。`--json` 强制将参数作为 JSON；不同终端有自己的引号规则，复杂数组也可通过 `config edit` 修改。

站点配置按语法读取，不执行图片导入、函数或其他表达式；动态叶子会显示为 `{ "$expression": "原表达式" }`。支持直接导出的对象、顶层 `const` 别名、`defineSiteConfig({...})`、TypeScript `as`/`satisfies`。含展开、计算属性或不明确容器的字段不能自动改写，可用 `config edit` 编辑。普通字段修改保留 imports、注释和其他字段，只替换目标值。

主题 `get` 返回合并默认值后的有效设置。若旧的 `theme.config.mjs.settings` 正在覆盖某个字段，`set` 会修改该内联字段并输出实际文件路径，避免写入一个会被忽略的值。

`config edit` 默认在 Windows 使用记事本、macOS 使用默认文本编辑器、Linux 使用 `xdg-open`。可设置 `VISUAL`/`EDITOR`，或传 `--editor <可执行文件路径>`。编辑器选项只接收程序路径，不接受 shell 命令或附加参数。

## 保留与恢复

配置和草稿状态修改前，会将原文件完整备份到 `.mintfolio/backups/<时间和唯一编号>/`，命令输出具体位置。需要恢复时，把备份复制回对应原路径即可。新站点的 `.gitignore` 已忽略 `.mintfolio/`；旧站点可把该目录加入自己的忽略文件。

未知命令、无效配置值、重复文章和失败的 npm/Astro 命令都会以非零状态退出，可用于脚本。CLI 不覆盖已有文章、不移除主题包、不操作 Git 提交，也不自动发布到远程服务器。
