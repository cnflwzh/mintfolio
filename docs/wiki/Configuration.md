# 站点配置

站点内容放在 `site.config.ts`，主题外观放在主题自己的配置文件。切换主题后，文章、个人资料和站点 URL 继续由同一份站点配置提供。

## 最小配置

```ts
import { defineSiteConfig } from '@mintfolio/core/config';

export default defineSiteConfig({
  site: {
    title: '我的小站',
    url: 'https://example.com',
    description: '记录代码、阅读与生活',
    language: 'zh-CN',
  },
  profile: {
    name: '林间',
    avatar: '/images/avatar.webp',
    bio: '在这里记录正在做的事',
    location: '杭州',
    signature: '慢慢写，认真生活。',
  },
  social: [
    { platform: 'github', url: 'https://github.com/example', icon: 'github' },
  ],
  contact: { email: 'hello@example.com', social: ['github'] },
});
```

`site.title` 和绝对 HTTP(S) 地址 `site.url` 必填；其他内容由 helper 补齐默认值。正式部署前务必设置正确 URL，它参与 canonical、RSS 与 Sitemap 的生成。

## 可选内容

| 字段 | 结构与用途 |
| --- | --- |
| `profile` | 名称、头像、简介、所在地、签名 |
| `social` | `platform/url/icon` 社交链接列表 |
| `skills` | `{ category, items: [{ name, level }] }` 技能分组 |
| `projects` | `{ title, description, link?, repo?, tags }` 项目列表 |
| `contact` | `email` 与要展示的社交平台 ID 列表 |
| `icp` | 可选备案号；是否展示由主题决定 |

主题可能只渲染其中一部分；字段存在不代表每个页面都会显示它。Verdant 的具体显示选项见其配置模板。

## 图片

将图片放到 `public/images` 后，可通过 `/images/文件名.webp` 引用。站点 TypeScript 配置也可导入 `src/assets` 内的图片，让 Astro 保留图片元数据。

主题专属配置是原生 ESM，图片使用 public 路径或 URL。不要在该文件里直接导入未经处理的图片文件。

更多外观设置与合并规则见[主题管理](Themes)。

分页、时区、作者注册表、导航、SEO 与订阅配置见 [博客功能](Blogging-Features)。这些属于 Core 的站点配置；主题设置只控制视觉与布局。
