# 快速开始

需要 Node.js 22.12.0 或更高版本，以及随 Node.js 安装的 npm。建议使用仍受支持的 Node.js LTS 版本。

## 创建站点

```sh
npm install -g @mintfolio/core
mintfolio create my-blog --theme verdant
cd my-blog
mintfolio dev
```

打开终端显示的预览地址。首次创建会安装依赖、写入站点基础文件，并安装及启用 Verdant。若省略 `--theme verdant`，会使用 Core 自带的 Minimal。

## 认识站点目录

| 路径 | 用途 |
| --- | --- |
| `site.config.ts` | 标题、正式域名、简介和个人资料 |
| `theme.config.mjs` | 当前主题选择、显式覆盖 |
| `theme-verdant.config.mjs` | Verdant 的专属外观设置 |
| `content/blog/` | Markdown 文章 |
| `public/` | 直接复制到构建产物的静态资源 |
| `src/content.config.ts` | 注册 Core 的博客集合 |
| `astro.config.mjs` | 注册 Mintfolio 的 Astro integration |

先将 `site.config.ts` 的标题与 URL 改成自己的，再创建文章：

```sh
mintfolio post new "你好，世界" --slug hello-world
mintfolio post publish hello-world
mintfolio build
mintfolio preview
```

新文章默认是草稿。`publish` 让文章进入下次构建；上传构建结果是独立的[部署步骤](Deployment)。

## 已有站点

在已有 Astro 项目里安装 Core 后，运行 `mintfolio init` 补齐配置。初始化保留已有文件；请检查现有 Astro integration、内容集合与路由是否冲突。

全局 CLI 和站点依赖是两个独立版本。运行 `mintfolio doctor` 查看诊断，使用 `mintfolio upgrade` 更新站点 Core。更新后重启开发服务。
