# 包与仓库

Mintfolio 的组件各自维护 Git 历史，以 npm 包组合。站点只需要安装包，无需复制引擎源码。

| 仓库 | 安装包 | 职责 |
| --- | --- | --- |
| [mintfolio](https://github.com/cnflwzh/mintfolio) | @mintfolio/core | CLI、内容、路由、SEO、Minimal |
| [mintfolio-theme-api](https://github.com/cnflwzh/mintfolio-theme-api) | @mintfolio/theme-api | 公开主题契约 |
| [mintfolio-theme-verdant](https://github.com/cnflwzh/mintfolio-theme-verdant) | @mintfolio/theme-default | Verdant 视觉主题 |
| [mintfolio-theme-starter](https://github.com/cnflwzh/mintfolio-theme-starter) | theme-mintfolio-starter | 主题开发起点 |

Verdant 保留原安装包名和配置文件名，避免影响已有站点。

开发时，各仓库运行 npm ci，再执行自己的测试或检查。更新顺序是 Theme API、Core、主题、站点。公开 API 与私有实现的边界见 [主题 API](theme-api.md)。

站点安装与使用见 [Wiki](https://github.com/cnflwzh/mintfolio/wiki/Getting-Started)。
