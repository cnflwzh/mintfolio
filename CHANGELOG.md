# 更新记录

## 0.4.0（本地预览，尚未发布到公共 npm）

- 补齐 Theme API 1.2：独立页面查询、系列目录、系列搜索筛选、统一静态分页与搜索/robots/资源 URL、搜索响应类型、页面与设置类型推导；同步 Core 0.4 主题开发文档。

不兼容变更：站点根目录就是文章目录，其他文件都在 `_mintfolio/` 中。升级步骤见 [命令行文档](docs/cli.md#从旧布局升级)。

- 站点根目录及子目录中的 Markdown 都是文章；`_`、`.` 开头的路径和 README 等仓库说明文件除外。站点资料、主题、独立页面（`_mintfolio/pages`）、静态文件、`package.json` 与构建输出都在 `_mintfolio/`。
- 不带参数运行 `mintfolio` 打开交互菜单：写文章、管理文章、预览、构建、按字段调整主题设置、修改站点资料等；在非站点目录会引导创建站点。
- 命令缺少参数时在终端中逐项询问（`post new/publish/draft`、`theme use`、`create`）；CI、管道或 `--no-interactive` 下保持原有报错行为。
- `mintfolio init` 可把已有的笔记目录变成站点，自动安装 Core，已有文章保持原样。
- 全局安装的 `mintfolio` 会把命令交给站点 `_mintfolio/` 中安装的 Core 执行。
- CLI 在运行 Astro 前于 `_mintfolio/.generated/` 生成 Astro 配置和内容集合，站点不再需要 `astro.config.mjs`、`src/content.config.ts` 和 `tsconfig.json`；开发服务器允许读取文章旁的图片。
- 可选的 `_mintfolio/astro.config.mjs` 只用于额外 Astro 设置（如 `base`），由 Core 合并；`--config`、`--root` 由 CLI 指定。
- 主题设置统一写在 `theme.config.mjs` 的 `settings`，不再生成或读取 `theme-*.config.mjs`；`theme use` 写入新主题带注释的模板，原设置保存在备份中。
- 移除 `theme sync`；`theme init` 改为在 `settings` 为空时写入当前主题模板。
- 发现旧布局文件时，命令列出需要处理的文件并停止，避免旧设置被悄悄忽略。
- 备份位于 `_mintfolio/.backups/`，与 `.generated/` 一样自带忽略规则；`site.config.ts` 无需 `tsconfig.json` 即可获得图片导入的类型。

## 0.3.0

- 站点支持 Astro base 子目录部署，统一导航、正文图片、搜索、订阅和 SEO 地址。
- 正文表格在构建时生成可聚焦滚动区域，公开文章关闭 JavaScript 仍可阅读宽表格。
- CLI 将草稿、未来定时和可参与构建状态分开显示；发布时间保留完整 UTC 时间。
- 新增可选 100/1000 篇真实构建与搜索基准工具及部署说明。

- 新增静态分页、标签/分类/系列页面、独立 Markdown 页面和自定义导航。
- 文章支持固定 slug、aliases、更新时间、作者、置顶、系列、阅读统计和相关文章。
- 统一草稿与未来文章发布策略，`dev --drafts` 仅在本地预览，生产输出始终排除。
- 搜索升级为按需加载公开正文索引、组合查询与安全高亮，保留旧查询链接。
- 新增文章级 SEO、JSON-LD、Twitter Card、Atom、JSON Feed、全文订阅和 robots.txt。
- `check` 增加内容、图片、链接和路由冲突诊断；`check --json` 提供结构化结果。
- Theme API 升至 1.1.0，现有主题接入新的页面、分页和文章导航。

## 0.2.0

- 统一 Verdant 的包名、主题 ID、配置文件、类型名称和 CLI 简写。
- 官方主题使用 `@mintfolio/theme-verdant`，设置保存在 `theme-verdant.config.mjs`。


## 0.1.5

- 主题显示名称调整为 Verdant，并增加同名 CLI 简写。
- 整理公开仓库、README、使用教程和主题开发文档。
- 增加 GPL-3.0-only 许可证、贡献说明和私密安全报告入口。

## 0.1.4

- 主题设置无效时仍可定位和打开配置文件。
- 全局 CLI 使用 PATH 中选定的 npm。

## 0.1.2–0.1.3

- 增加站点、文章、主题和配置管理命令。
- 新文章默认为草稿，配置和草稿状态修改前保留备份。

## 0.1.1

- 支持每个主题独立的配置文件，重复初始化和升级保留原有设置。

## 0.1.0

- 博客引擎独立为 npm 包，内置 Minimal，视觉主题独立安装。
