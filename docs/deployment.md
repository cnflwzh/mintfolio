# 静态部署与子目录

Mintfolio 在构建时生成静态文件。部署服务负责把文件放到公开地址、提供 HTTP 响应与 HTTPS；Core 和 CLI 不会自动创建托管项目、上传产物或配置服务器。

## 先构建，再部署

在站点目录运行：

```sh
npm ci
npx mintfolio check
npx mintfolio build
npx mintfolio preview
```

默认输出目录是 `_mintfolio/dist/`。在 CI 中安装依赖和构建时，把工作目录设为 `_mintfolio`（例如 GitHub Actions 的 `working-directory: _mintfolio`）。`preview` 用来查看这次构建的结果，生产环境由你选择的静态托管服务或 Web 服务器提供文件。保留站点源码和锁文件，上传本次构建的完整产物。

## 域名根目录与子目录

不设置 Astro `base` 时，默认是 `/`，原有域名根目录部署方式保持兼容。

若网站要发布在 `https://example.com/blog-site/`，添加可选的 `_mintfolio/astro.config.mjs`，只写标准 Astro `base`。Core 会把它与自己生成的配置合并，不需要也不应再引入 Mintfolio integration：

```js
export default {
  base: '/blog-site/',
};
```

当前建议使用 `/blog-site/` 这类 ASCII 部署目录。使用本地 Astro 7.3.2 验证中文 `base` 时，页面可以生成，但正文导入图片的优化阶段出现路径不匹配并导致构建失败；这是本轮实际发现的限制。中文文章 slug、标签和独立页路径在 ASCII `base` 下已验证可用。Core 会统一比较 Unicode 与编码形式的前缀，但这不能代替构建器的图片处理兼容性。

主题仍由 `theme.config.mjs` 选择。其他 Astro 选项（例如 Markdown 或远程图片设置）也写在同一个可选文件中。

`site.config.ts` 中的 `site.url` 用来计算公开绝对地址。对于上面的 `base`，可以填写域名 origin，也可以填写一致的完整子目录地址：

| `site.url` | 结果 |
| --- | --- |
| `https://example.com` | 公开站点地址为 `https://example.com/blog-site/` |
| `https://example.com/blog-site/` | 使用同一公开站点地址，不重复添加前缀 |
| `https://example.com/other/` | 与 Astro `base` 冲突，构建报错 |

修改现有配置中的 `site.url` 即可；最小配置示例为：

```ts
import { defineSiteConfig } from '@mintfolio/core/config';

export default defineSiteConfig({
  site: {
    title: '我的博客',
    url: 'https://example.com',
  },
});
```

`base` 是构建设置。修改它或公开域名后，必须重新构建并部署完整产物；仅移动服务器目录不会更新已经生成的链接、索引和 SEO。让托管服务的 `/blog-site/` 路径对应这次 `dist` 的内容。

## 链接与资源如何处理

Core 的首页、文章、分页、标签、分类、系列和独立页 URL 会包含部署前缀。配置和内容中可以继续写站内根路径：

| 来源 | 子目录部署时的处理 |
| --- | --- |
| 站点导航 `/blog` | 生成指向 `/blog-site/blog` 的链接 |
| 头像、文章封面 `/images/cover.webp` | 使用 `/blog-site/images/cover.webp` |
| Markdown 正文中的根路径图片与链接 | 添加当前 `base` |
| Verdant 推荐文章图片、文末插图和推荐工具的站内根路径 | 由主题添加同一前缀 |
| 已含 `/blog-site/` 的资源路径 | 保持单个前缀 |
| 外部 HTTP(S) URL、协议相对 URL | 保持原地址 |

主题自带的字体、图标等资源通过构建器的导入路径处理。第三方主题应直接使用 Core 提供的 URL；主题自行输出的私有资源路径需要适配 Astro `import.meta.env.BASE_URL`，并避免重复添加前缀。

文章 `slug` 和 `aliases` 仍填写站点内的逻辑路径，例如 `slug: first-post`、`aliases: ['/blog/old-name']`。Core 为公开地址加上 `base`；别名在这个例子中对应 `/blog-site/blog/old-name`，跳转目标也使用部署后的地址。

## 完整上传一次构建的产物

文章 HTML、CSS、JavaScript、图片、字体及以下文件需要一起部署，目录结构保持不变：

| 公开地址示例 | 用途 |
| --- | --- |
| `/blog-site/search-index.json` | 浏览器全文搜索使用的静态索引 |
| `/blog-site/rss.xml`、`/blog-site/atom.xml`、`/blog-site/feed.json` | 订阅输出 |
| `/blog-site/sitemap.xml` | 搜索引擎可使用的站点地图 |
| `/blog-site/robots.txt` | 本次构建生成的爬虫配置，域根处理见下文 |
| 各文章、归档、独立页与别名 HTML | 页面内容、页面 SEO 和旧地址跳转 |

只替换文章 HTML 会让搜索、订阅、Sitemap 或别名继续指向旧内容。发布时使用同一次构建的整套 `dist`；具体上传和切换版本的方法由托管服务决定。别名使用静态 HTML 跳转，服务器级 HTTP 301 需要另行配置。

## 404 与 robots.txt 的托管边界

生成的 `404.html` 提供错误页面内容。不存在的地址是否返回 HTTP 404，由托管服务的错误页规则决定。应配置服务在找不到子目录内的页面时显示该错误页，并保留正确的 404 状态；页面上写着“404”不能代替 HTTP 状态。

爬虫入口位于域名根目录的 `/robots.txt`。子目录里的 `/blog-site/robots.txt` 不能替代该入口。部署在共享域名或子目录时，请由域名维护者将需要的规则合并到域根 `robots.txt`，并从那里引用本博客的 Sitemap，例如：

```text
Sitemap: https://example.com/blog-site/sitemap.xml
```

保留域名上其他网站已经使用的规则。Core 只生成当前站点的静态文件，不会修改域根服务器配置或其他站点的 `robots.txt`。

## 阅读交互与发布检查

公开 Markdown 正文的表格在构建时就包含可聚焦的横向滚动区域，无需 JavaScript。宽表格可横向滚动；使用键盘时，可通过 Tab 聚焦该区域后按左右方向键查看。主题负责区域的视觉样式。

密码文章仍需 JavaScript 才能在浏览器中解锁。全文搜索、代码复制、图片预览等浏览器交互也需要相应脚本；公开文章正文与静态导航可以直接阅读和访问。

正式发布前，在实际部署前缀下检查首页、深层文章、独立页、图片、全文搜索、订阅、Sitemap、别名与不存在的地址；同时检查关闭 JavaScript 时的公开正文，以及密码文章的解锁与重新锁定。这里说明的是配置和检查方法，不代表这些项目已在某个托管平台完成验收。

需要评估内容量、构建耗时和搜索成本时，参阅 [内容规模与搜索性能验收](performance.md)。其中的基准工具是可选维护检查，不是每次部署的必需步骤。内容发布规则见 [博客功能与日常写作](wiki/Blogging-Features.md)。
