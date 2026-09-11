<p align="center"><img src="docs/assets/mintfolio-icon.png" width="112" height="112" alt="Mintfolio" /></p>

# Mintfolio

把个人主页和博客放在一起，用 Markdown 写文章，用主题决定它们的样子。

Mintfolio 基于 Astro。站点目录保存你的资料、文章和图片；引擎负责文章路由、搜索数据、RSS、Sitemap 和密码文章。换一个主题，内容仍然留在原处。

[使用教程](https://github.com/cnflwzh/mintfolio/wiki/Getting-Started) · [命令参考](docs/cli.md) · [开发主题](https://github.com/cnflwzh/mintfolio/wiki/Theme-Development) · [更新记录](CHANGELOG.md) · [反馈问题](https://github.com/cnflwzh/mintfolio/issues)

![Verdant 主题的个人主页](docs/assets/home-desktop.webp)

*上图使用 Verdant 主题和示例资料。只安装引擎时，默认使用文字为主的 Minimal。*

## 能做什么

- 用 Markdown 管理文章，支持分类、标签、标题与摘要搜索。
- 在主页展示个人资料、技能、项目和社交链接。
- 为单篇文章设置密码，在浏览器中解锁正文。
- 通过命令行新建草稿、安装主题、修改配置并构建网站。
- 输出静态文件，部署到普通 Web 服务器或静态托管平台。

Core 自带 Minimal；[Verdant](https://github.com/cnflwzh/mintfolio-theme-verdant) 提供文章卡片、八套配色、明暗模式、目录和阅读工具。第三方主题可以从两个 Astro 页面开始，再逐步补齐自己的布局。

## 开始使用

需要 **Node.js >= 22.12.0**。项目仍在持续开发中。

~~~sh
npm install -g @mintfolio/core
mintfolio create my-blog
cd my-blog
mintfolio dev
~~~

打开终端显示的地址。编辑 site.config.ts 填写资料，文章放在 content/blog。

想使用上图的 Verdant：

~~~sh
mintfolio theme install verdant --use
~~~

## 写第一篇文章

~~~sh
mintfolio post new "我的第一篇文章" --slug first-post
~~~

打开 content/blog/first-post.md 写正文。新文章默认是草稿，准备好后再发布并构建：

~~~sh
mintfolio post publish first-post
mintfolio build
mintfolio preview
~~~

post publish 修改本地草稿状态；build 生成 dist；部署时上传 dist 中的内容。[写作教程](https://github.com/cnflwzh/mintfolio/wiki/Writing) 介绍日期、封面、嵌套目录和密码文章。

## 常用操作

| 想做什么 | 命令或文件 |
| --- | --- |
| 修改网站标题 | mintfolio config set site site.title "我的博客" |
| 编辑个人资料 | site.config.ts |
| 调整主题设置 | mintfolio config edit theme |
| 查看主题配置项 | mintfolio config schema theme |
| 检查环境 | mintfolio doctor |
| 查看命令帮助 | mintfolio --help |

[配置教程](https://github.com/cnflwzh/mintfolio/wiki/Configuration) 说明内容与显示设置的区别、备案号、图片和配置优先级。

## 界面

![文章阅读](docs/assets/article-reading.webp)

<p><img src="docs/assets/home-mobile.webp" width="280" alt="手机上的 Verdant 首页" /> <img src="docs/assets/encrypted-mobile.webp" width="280" alt="手机上的密码文章" /></p>

## 开发状态

当前重点是完善写作流程、主题接口和跨平台安装。0.x 阶段仍可能调整接口；升级前请保留源文件与锁文件，并阅读版本说明。

目前需要知道的几件事：

- 草稿在开发和生产构建中都不会公开显示。
- 搜索匹配标题和公开摘要，不搜索全文；标签、分类与搜索共用博客归档页。
- Minimal 目前不显示备案号；Verdant 的首页和普通页面支持 icp 字段。
- 密码文章的正文和目录会被加密，标题、图片等信息仍公开。
- CLI 负责本地操作与构建，部署由你选择的托管平台完成。

## 仓库

| 仓库 | 内容 |
| --- | --- |
| [mintfolio](https://github.com/cnflwzh/mintfolio) | 项目入口、CLI、博客引擎与 Minimal |
| [mintfolio-theme-verdant](https://github.com/cnflwzh/mintfolio-theme-verdant) | Verdant 主题 |
| [mintfolio-theme-api](https://github.com/cnflwzh/mintfolio-theme-api) | 主题的公共类型与契约 |
| [mintfolio-theme-starter](https://github.com/cnflwzh/mintfolio-theme-starter) | 可直接修改的主题起点 |

想贡献代码，从 [CONTRIBUTING.md](CONTRIBUTING.md) 开始。发现安全问题，请按 [SECURITY.md](SECURITY.md) 私下报告。

## 许可证

[GPL-3.0-only](LICENSE)。第三方依赖和资源保留各自许可证，见 [第三方声明](THIRD_PARTY_NOTICES.md)。
