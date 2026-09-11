# @mintfolio/core

Mintfolio 的 Astro 博客引擎。Core 包含内容模型、路由、SEO、RSS、Sitemap、加密文章以及可供主题复用的浏览器 API；内置文字优先的 Minimal，可独立构建博客。

## 安装

当前代码已支持 npm tarball 安装，尚未发布到公共 registry。发布后的使用方式为：

```sh
npm install @mintfolio/core
npx mintfolio init
npm run dev
```

`init` 生成站点配置、主题配置、内容集合入口和一篇示例文章，不覆盖已有文件。站点不需要复制 Core 的路由或源码。`mintfolio build` 和 `mintfolio preview` 分别构建及预览。

省略 `theme.config.mjs` 中的 `theme` 字段，或使用 `minimal`，即选择内置 Minimal。显式指定一个不存在的包会报错。Core 不依赖 Default、React 或 Tailwind。

另装一个主题后修改配置：

```sh
npm install @mintfolio/theme-default
```

```js
export default { theme: '@mintfolio/theme-default' };
```

Core >= 0.1.1 可通过 `npx mintfolio theme:add default` 一次完成安装与主题配置生成。它会在站点根目录生成 `theme-default.config.mjs`，其中包含全部可编辑设置和说明；`theme.config.mjs` 继续负责选择主题和页面覆盖。

使用普通 `npm install` 安装主题后，下一次 `mintfolio dev/build/sync` 会补齐主题声明的配置模板。也可运行 `npx mintfolio theme:init default` 立即生成，或 `npx mintfolio theme:sync` 同步已安装主题。`mintfolio init` 会生成 Minimal 的设置文件。重复生成与升级保留已有文件。

只读取当前所选主题的 `theme-<id>.config.mjs`。主题清单默认值、专属配置文件、旧的内联 `theme.config.mjs.settings` 依次覆盖；嵌套对象递归合并、数组整组替换。主题配置文件使用原生 ESM，建议直接导出设置对象，图片使用 public 路径或 URL。

## 公开入口

| 入口 | 调用方 / 用途 |
| --- | --- |
| `@mintfolio/core` | 宿主 Astro integration，自动注入博客路由 |
| `@mintfolio/core/config` | 宿主 `defineSiteConfig` 和内容配置类型 |
| `@mintfolio/core/content` | 宿主 `createBlogCollection()` |
| `@mintfolio/core/theme` | 主题清单、嵌套设置、公开 DTO 与上下文类型 |
| `@mintfolio/core/astro` | 主题 `PageProps`、页面、正文与 SEO 类型 |
| `@mintfolio/core/search` | 纯搜索、筛选及查询参数函数 |
| `@mintfolio/core/client` | 列表状态、生命周期、解锁、目录、阅读进度、图片预览与复制 API |
| `@mintfolio/core/components/PostArchive.astro` | 可选搜索、标签、分类、分页列表组件 |
| `@mintfolio/core/components/ProtectedArticle.astro` | 可选密码表单、解锁与重新锁定组件 |
| `@mintfolio/core/components/SeoHead.astro` | 可选 head 元数据组件 |
| `@mintfolio/core/components/Image.astro` | 可选 Astro 图片适配组件 |

主题只使用面向主题的公开入口，通过 `{ theme, page }` 获取内容；不得导入宿主配置、原始内容或 Core 的 `src/server`、`src/engine`、`src/routes`。Core 的私有文件随包编译，并不构成公共 API。

## 包内职责

```text
src/public/      对外 ESM 与类型门面（编译到 dist）
src/client/      可选无界面的浏览器控制器（编译到 dist）
src/components/  可选 Astro 组件
src/server/      私有内容、URL、SEO、加密和数据投影
src/engine/      私有主题解析、校验、上下文与调度
src/routes/      私有 Astro 路由
src/fallback/    内置 Minimal，仅通过公共 API 使用 Core
bin/            init/dev/build/preview/sync 命令
```

包依赖独立的 `@mintfolio/theme-api` 契约层；应用作者无需额外选择它。主题 API 使用 1.x 契约版本，与 Core 包的 0.1.x 版本分开。

## 独立仓库开发

博客引擎。src/server、engine、routes 是私有实现；public、client、components 提供主题公共 API；fallback 是 Minimal。tests 与 tools/verify-theme-boundaries.mjs 验证核心契约。

```sh
npm ci
npm test
npm pack
```

这个仓库可单独安装，不需要 PersonalSite 或其他源码目录。拆分前历史保留在原 PersonalSite，起点见 MIGRATION.md。 尚未发布的依赖固定在 vendor 和锁文件中；更新方式见 vendor/README.md。
