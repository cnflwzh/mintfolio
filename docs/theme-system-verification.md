# 主题系统第一阶段验收

> 历史记录：本文描述第一阶段。当前 npm 包结构、Minimal 兜底及共享 API 以 [Core 与主题包](core-packages.md)、[Theme API](theme-api.md) 和 [第二阶段验收](core-package-verification.md) 为准。

验收日期：2026-09-11。实现基于原有 Astro 站点，保留 `content/blog/` 内容、站点资料、文章 URL 和静态部署方式。当前默认选择与最终 `dist/` 均为 `default`。

## 十项目标

| 目标 | 实现及验收证据 |
| --- | --- |
| 1. 现有 UI 成为 Default Theme | 原页面、Base、组件、CSS、配色和阅读交互迁入 `src/themes/default/`；17 个原有浏览器核心用例通过，人工查看桌面首页、Sidebar、文章卡片和手机文章页 |
| 2. Core 与 Default 解耦 | `src/core/` 负责内容公开策略、URL、SEO 和页面数据；文件路由仅调用选中 renderer；旧 `src/lib/posts.ts` 为指向 Core 的兼容适配器 |
| 3. 建立公开 Theme API | `packages/theme-api/` 提供 ESM、声明文件、文档化 DTO、内容/分类/归档/搜索服务与 Astro PageProps；没有宿主内部导入 |
| 4. 建立 Manifest | 明确 name、id、version、author、description、engine、capabilities、pages、settings；Zod 与 semver 在加载时校验 |
| 5. 建立 Loader | 内置 id、本地目录、npm `./theme` export 均实际验证；引擎不兼容、非法设置、缺失页面和越界 override 被拒绝 |
| 6. 至少两个 Theme | Default 和 Minimal 都完成 51 页生产构建 |
| 7. 使用同一份内容 | 两套产物具有相同的 51 个 HTML 路由和 Core SEO；RSS/Sitemap 一致，比较只忽略静态页面的构建时间 |
| 8. 第二主题布局明显不同 | Minimal 为独立文字列表与单栏文章，无 Default 的 Hero、Sidebar、Card、ClientRouter 或配色系统；人工确认由其自己的宽度与字体控制布局 |
| 9. 切换不改内容 | 通过 `theme.config.mjs` 或临时 `MINTFOLIO_THEME` 选择主题；文章和内容 schema 没有改动 |
| 10. 禁止 Theme 调用 Core internal | 10 个真实 Astro/Vite 依赖边界案例通过；覆盖 renderer、manifest、别名、传递 helper、原始 `astro:content` 和根目录 override；独立安装的 Starter 只使用公开 SDK |

## 实际运行结果

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 96 个文件，0 errors、0 warnings；1 个保留的 `document.execCommand` 兼容复制提示 |
| Core 单元测试 | 16/16 通过：加密认证、导航、公开投影、草稿过滤、分类/归档、搜索、manifest、设置与 loader |
| Default 生产构建 | 51 个 HTML 页面；47 篇已发布文章中包含 1 篇加密演示，RSS 含 46 篇公开文章 |
| Default 浏览器验收 | Edge 17/17 通过，覆盖桌面/手机导航、历史恢复、筛选、加载更多、主题持久化、阅读工具、图片弹窗与加密文章生命周期 |
| Minimal 生产构建与浏览器验收 | 51 个 HTML 页面；Edge 2/2 通过，覆盖文章/归档导航、搜索、解锁、重新锁定、刷新和模拟 BFCache 生命周期 |
| npm 包验证 | SDK 与 Starter 真实打包为 tgz 并安装到独立宿主；公开类型检查和 6 类页面构建通过；验证密文可解密且不泄漏正文、CSS 与 SVG 正确随包输出 |
| 导入边界验证 | 10/10 真实 Astro/Vite 构建案例通过；负例以 `[theme:boundary]` 失败，manifest 私有模块在执行前即被拒绝 |
| 两主题产物比较 | 51 个路由、title/canonical/description/robots、RSS/Sitemap 一致；两个目录内所有产物均不含演示文章的密码、私有摘要、正文或目录文本 |
| 依赖审计 | 本轮新增依赖安装后的 npm audit 为 0 vulnerabilities |

最后的产物比较命令为：

```sh
node scripts/verify-theme-output.mjs dist .cache/minimal-build-final
```

该比较器接受任意两个保留的本站构建目录，只读检查，不要求主题使用相同 HTML 结构或 CSS。`.cache/` 中的构建快照、npm fixture、边界 fixture 和迁移前源文件备份都不会进入 Git。

## 扩展与兼容范围

- 第一版必需 `home`、`post` renderer；可选 `page`、`archive`、`notFound` 缺失时保留相应页面语义。Fallback 样式限定在自己的容器中。
- 第一版标签、分类、搜索沿用 `/blog` 的查询参数；声明 renderer 不会为主题注入新路由。
- `overrides.pages` 已实现。主题继承、商城、GUI、SSR 和正文全文搜索不属于本阶段；`extends` 会明确报错。
- `happyhues` 仍是 Default 的兼容别名。既有 sidebar/home/article 展示选项只在 Core 兼容边界映射给 Default，不成为所有主题的必选结构。
- 已存在加密算法保持不变。Core 在进入主题前把正文与 headings 一同加密；浏览器通过 SDK 解密、验证 envelope 并清理 HTML。主题负责短生命周期的 DOM 和表单。
- Manifest/renderer 检查约束可解析的模块依赖，不是对任意 npm JavaScript 的安全沙箱。更改主题选择或 manifest helper 后应重启开发服务。
- SDK 与 Starter 已验证可打包、可安装，尚未发布到 npm。作者入口见 [Theme API](theme-api.md) 与 [Starter](../examples/theme-starter/README.md)。

新增 `.github/workflows/theme-contract.yml` 为 Linux 上的公共契约、打包与 Minimal 浏览器流程提供独立 CI。原部署 workflow 保持原样。本地验收在 Windows/Edge 完成；本轮没有触发远端 CI、推送或部署，不能把新增的 Linux workflow 视为已运行通过。

实施前的审查与迁移依据保留在 [架构方案](theme-system-architecture.md)。
