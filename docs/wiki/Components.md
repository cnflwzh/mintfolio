# 标准组件

标准组件是可选的。它们提供基本行为和局部样式，主题可直接复用，也可使用同一套公开控制器绘制自己的界面。

所有组件从 `@mintfolio/core/components/<名称>.astro` 导入。

## SeoHead

放在文档 `<head>` 内，传入 `seo={page.seo}`。它渲染 Core 计算的标题、描述、canonical、robots 和 Open Graph 信息。

不要重复渲染另一组相互冲突的 SEO 标签。如果主题自己输出标签，需要保留这些数据及 Core 的索引策略。

## PostArchive

提供搜索、标签和分类筛选、结果数量以及可选“加载更多”。

| 参数 | 类型 | 含义 |
| --- | --- | --- |
| `posts` | `PostSummary[]` | Core 传入的完整公开列表 |
| `tags` | `TaxonomyCount[]` | 可选标签及数量 |
| `categories` | `TaxonomyCount[]` | 可选分类及数量 |
| `filters` | `Partial<PostFilters>` | 可选初始筛选 |
| `language` | `string` | 日期显示语言，默认 zh-CN |
| `pageSize` | 正整数 | 每批条数；省略则显示全部匹配项 |

前三项必传。`theme.taxonomy.tags()` 和 `categories()` 获取对应数据。完整用例见 [Theme API](Theme-API)。

浏览器中的筛选会同步 URL，并处理后退导航。组件以安全 DTO 建立索引，不包含密码文章正文。

## ProtectedArticle

唯一必需参数为 `body`，类型是 `ArticleBody` 中 `kind: 'protected'` 的分支。

提供密码表单、失败提示、解锁正文和重新锁定。页面离开时清除已解锁内容。组件在浏览器调用 Core 的解锁控制器，验证及清理解密结果；无需主题自行处理加密协议。

该组件不接受文章密码。密码由读者输入，构建期只接收密文。

## Image

包装 Astro 的图片组件，接受：

| 参数 | 说明 |
| --- | --- |
| `src` | 字符串 URL 或公开图片元数据 `PublicImage` |
| `alt` | 必填替代文字 |
| `width` / `height` | 必填显示尺寸 |
| `widths/quality/format/layout/fit/position/background/priority` | 转交 Astro 的图片选项 |

普通 HTML 图片属性也会转发。保留本地图片元数据可供 Astro 优化；空 `src` 显示占位图。远程图片的优化与允许域名仍遵守站点的 Astro 配置。

```astro
---
import Image from '@mintfolio/core/components/Image.astro';
const { theme } = Astro.props;
---
<Image src={theme.site.profile.avatar}
  alt={theme.site.profile.name} width={96} height={96} />
```

需要自定义列表、目录、复制按钮或灯箱时，使用 [Theme API 中的共享控制器](Theme-API)。
