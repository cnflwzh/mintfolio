# Google Analytics：站点配置与主题无关

Google Analytics 由 Core 管理。站点配置放在 site.config.ts，所有主题和页面覆盖共用同一套注入逻辑，不需要主题导入统计组件。

~~~ts
import { defineSiteConfig } from '@mintfolio/core/config';

export default defineSiteConfig({
  site: { title: '我的博客', url: 'https://example.com' },
  analytics: {
    google: {
      measurementId: 'G-XXXXXXXXXX',
      // enabled: false, // 暂时关闭统计；配置 ID 后默认启用
    },
  },
});
~~~

measurementId 必须是 G- 开头的大写字母/数字 ID，前后空格会被去除。ID 是公开配置，不是 API 密钥。
不配置 analytics.google 时不加载统计；enabled:false 同样不加载。

## 何时启用

- mintfolio dev：不注册统计中间件，不注入统计脚本。
- 生产构建：通过 Core 中间件对 HTML 页面加入统计引导脚本。
- localhost、*.localhost、127.0.0.1 和 ::1 上预览生产产物：客户端也跳过 Google 初始化和加载，避免普通本地预览污染统计。
- 生产产物部署在其他地址：按生产配置统计；如需关闭，请使用 enabled:false 重新构建。
- JSON、RSS、Atom、robots.txt、重定向响应和 HEAD 请求不注入。
- 自定义中间件已经压缩的响应不作 HTML 改写，避免损坏内容。

中间件同样参与静态预渲染，因此切换 Minimal、Verdant 或其他主题都不需要复制统计代码。

## 避免重复页面浏览

Core 只初始化一次 gtag.js 和一次 gtag('config', measurementId)：
- Google 标签自动发送首个 page_view。
- 使用 Astro ClientRouter 的主题，由 GA4 Enhanced Measurement 跟踪浏览器历史变化。
- Core 不再在 astro:page-load、popstate 或 History API 上额外发送手动 page_view。
- ClientRouter 重复执行引导脚本时，window 上的初始化标记阻止重复加载及重复 config。
- 静态响应中已有 Core 标记时不重复注入。若发现主题/用户代码仍直接加载 gtag.js，生产构建会报迁移错误，避免两套实现并存。

在 GA4 管理后台对应的 Web 数据流中，启用“增强型衡量 → 网页浏览 → 基于浏览器历史记录事件的网页更改”。
如果这项被关闭，完整页面加载仍有统计，但客户端导航不会由 Google 自动记录。
不要同时配置第二套手动 page_view、GTM 页面浏览标签或另一个主题统计脚本。Core 无法替你修改远端 GA4/GTM 的设置。

参考：
- https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
- https://developers.google.com/analytics/devguides/collection/ga4/views
- https://docs.astro.build/en/guides/middleware/

## 从 Verdant analyticsId 迁移

1. 将 theme.config.mjs 内联 settings.analyticsId 或独立 theme-verdant.config.mjs 的 analyticsId 移到 site.config.ts 的 analytics.google.measurementId。
2. 删除旧主题字段；新版 Verdant 不声明它，也不加载 Google 标签。
3. 同步使用包含本次迁移的 Theme API、Core 和 Verdant 发布包。先构建/发布 Theme API，再构建 Core，最后更新主题和站点依赖。
4. 生产构建后部署。旧安装包不会因为源码仓库已修改就自动支持新配置。

命令行也支持：

~~~sh
mintfolio config set site analytics.google.measurementId G-XXXXXXXXXX
mintfolio config set site analytics.google.enabled false
~~~

Theme API 的 AnalyticsConfig/GoogleAnalyticsConfig 与 PublicSite.analytics 仅定义公开数据契约。主题可以读取公开配置，但不得据此自行加载脚本。
