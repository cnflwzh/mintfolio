# Core / 主题独立安装验收

验证日期：2026-09-11。实现为 Core 0.1.0、Verdant 0.1.0、Theme API 1.0.0；此处记录本地构建和 tarball 安装结果，没有执行 npm 发布或远程部署。

## 结果

| 验证 | 结果 |
| --- | --- |
| 全仓 Astro / TypeScript 检查 | 0 errors，0 warnings；保留浏览器复制兼容 API 的弃用提示 |
| Core 单元测试 | 19 / 19，包括内容公开策略、加密、导航、组合过滤分页、嵌套设置和解析 |
| 真实 Astro/Vite 导入边界 | 13 / 13，包括公共 Core 组件和控制器，私有 Core 路径、宿主入口、直接/别名/转递导入与 override |
| Verdant 完整生产构建 | 51 HTML 页面 |
| Minimal 完整生产构建 | 51 HTML 页面 |
| 两套构建的一致性 | 51 条相同 HTML 路由；SEO、RSS、Sitemap 与受保护产物策略一致 |
| Verdant 核心浏览器流程 | 17 / 17，含桌面/手机、导航恢复、搜索筛选分页、配色、目录、复制、图片预览、加密与重锁 |
| Minimal 核心浏览器流程 | 2 / 2，含 URL 搜索、文章导航、解锁、刷新重锁及 pagehide/pageshow 恢复 |
| 人工浏览器检查 | Verdant 桌面首页/侧栏/卡片、390px 加密文章解锁后阅读；独立安装 Core 的搜索、手机密码表单、解锁和重锁 |

Verdant 的第一次完整构建在读取一张 Unsplash 图片时失败；直接请求该图片恢复 HTTP 200，重跑完整构建成功。浏览器验证基于成功的完整产物。

## 仓库外的真实包安装

验收脚本 `scripts/verify-engine-package.mjs` 不复制 Core 路由或模拟站点数据，而是在系统临时目录新建站点并安装 npm 生成的 tgz：

1. 仅安装 SDK/Core，确认安装树不存在 Verdant、React 或 Tailwind。
2. 用包内 `mintfolio init` 初始化两次，确认保留已有配置；站点中不存在 `src/pages`。
3. 使用安装后的公开声明检查 Core integration、配置、页面 DTO、嵌套设置推导和列表控制器。
4. Core + Minimal、另装 Verdant、另装 Starter 三阶段分别构建相同普通和加密文章，每次均生成六个 HTML 页面及 RSS/Sitemap。
5. 逐次扫描公开 HTML/JS/JSON/XML/CSS，确认私有描述、正文、目录及密码未出现；从页面提取密文，校验正确密码可以认证并解密。
6. 显式选择不存在的主题必须失败，之后恢复 Starter 配置。

本次保留的实际产物：

- 包与报告：`.cache/engine-packages-vBtYwc/verification.json` 和同目录四个 tgz。
- 独立站点：`C:/Users/cnflw/AppData/Local/Temp/mintfolio-install-IFUFQ4`。
- 独立站点的三份产物快照：`verified-core-only`、`verified-default`、`verified-starter`。
- 边界案例：`.cache/theme-boundaries/run-W24WMa/verification.json`。
- 本站两套完整产物：`.cache/phase2-default-dist`、`.cache/phase2-minimal-dist`。

| 包 | tgz 大小（不含依赖） |
| --- | ---: |
| `@mintfolio/theme-api` | 11,316 bytes |
| `@mintfolio/core` | 45,640 bytes |
| `@mintfolio/theme-verdant` | 869,945 bytes |
| `theme-mintfolio-starter` | 3,272 bytes |

Core 仍依赖 Astro 和契约/解析工具。上述大小只是包自身压缩体积，不表示完整安装大小或页面传输量。

## 当前契约与限制

- Core 负责博客行为和标准可选组件；主题继续控制页面布局、视觉、DOM 适配和自己的存储/历史策略。
- Minimal 是 Core 内置兜底，Verdant 必须另装。缺少可选页面时按页使用 Minimal。
- 搜索、标签、分类通过 `/blog` 查询参数与 archive 控制器运行。原先未被真实路由调用的 `pages.tag/category/search` 声明已移除。
- 没有主题继承；支持显式页面 override。导入边界是构建期契约，不是 npm 代码沙箱。
- 包已经过真实本地安装验证，但尚未发布到公共 npm registry。

接口与输入输出见 [Theme API](theme-api.md)，安装与迁移见 [Core 与主题包](core-packages.md)。
