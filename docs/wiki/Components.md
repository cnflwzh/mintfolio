# 标准组件

标准组件是可选的。它们提供基本行为和局部样式，主题可直接复用，也可使用同一套公开控制器绘制自己的界面。

所有组件从 `@mintfolio/core/components/<名称>.astro` 导入。

## SeoHead

放在文档 `<head>` 内，传入 `seo={page.seo}`。它渲染 Core 计算的标题、描述、canonical、robots 和 Open Graph 信息。

不要重复渲染另一组相互冲突的 SEO 标签。如果主题自己输出标签，需要保留这些数据及 Core 的索引策略。

## PostArchive

提供当前页静态列表、标签/分类链接、全站全文搜索和静态分页。

| 参数 | 类型 | 含义 |
| --- | --- | --- |
| `posts` | `PostSummary[]` | Core 传入的当前页公开列表 |
| `tags` | `TaxonomyCount[]` | 可选标签及数量 |
| `categories` | `TaxonomyCount[]` | 可选分类及数量 |
| `filters` | `Partial<PostFilters>` | 可选初始筛选 |
| `language` | `string` | 日期显示语言，默认 zh-CN |
| `pagination` | `Pagination` | 可选静态分页信息 |
| `pageSize` | 正整数 | 旧参数保留兼容；实际条数由 `site.blog.pageSize` 控制 |

前三项必传。`theme.taxonomy.tags()` 和 `categories()` 获取对应数据。完整用例见 [Theme API](Theme-API)。

浏览器中的筛选会同步 URL，并处理后退导航。SearchPanel 按需加载 Core 的公开全文索引，不包含密码文章正文。

## SearchPanel / Pagination

SearchPanel 可单独放入主题：`<SearchPanel />` 默认读取 `/search-index.json`，支持中文、组合查询、安全高亮、失败重试与旧查询 URL。可传 `endpoint` 和 `placeholder`；endpoint 必须同源。正常分类页上的新搜索默认搜索全站。

Pagination 接收 `pagination={page.pagination}`，输出真实上下页及页码链接；无 JavaScript 也能浏览。

## PostMeta / ArticleLinks

PostMeta 接收 `post`，可选 `language`、`timezone`，呈现日期、更新时间、公开阅读统计、作者和预览标记。

ArticleLinks 接收 `page={page}`（PostPageData），按 Core 提供的数据呈现系列目录、相关文章和相邻文章。

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
