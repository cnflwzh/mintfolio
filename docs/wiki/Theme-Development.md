# 从 Starter 创建主题

主题是一个独立 npm 包，负责页面、样式和交互。Core 提供公开内容和路由；不需要复制站点源码。

## 1. 取得模板

在 [Theme Starter 仓库](https://github.com/MintfolioBlog/mintfolio-theme-starter) 选择 **Use this template**，然后克隆自己的仓库并安装：

```sh
git clone https://github.com/your-name/your-theme.git
cd your-theme
npm ci
```

模板包含 `theme.mjs`、首页、文章、归档与普通页面，以及布局、样式、类型检查和 CI。未实现的 404 页面由 Core 的 Minimal 补齐。

修改 `package.json` 的包名、作者、仓库地址与版本，以及 `theme.mjs` 的 ID、显示名、作者、描述。主题 ID 使用稳定的小写连字符名称，用于标识主题；站点设置统一保存在 `_mintfolio/theme.config.mjs`。

## 2. 声明页面和设置

```js
import { defineTheme } from '@mintfolio/core/theme';

export default defineTheme({
  manifest: {
    id: 'paper',
    name: 'Paper',
    version: '1.0.0',
    author: 'Your name',
    description: '简洁的阅读主题',
    engine: '^1.2.0',
  },
  capabilities: { encryptedPosts: true },
  pages: {
    home: './src/pages/home.astro',
    post: './src/pages/post.astro',
  },
  settings: {
    accentColor: {
      type: 'color', label: '强调色', default: '#2255aa',
    },
  },
});
```

`home`、`post` 必需。路径从主题根目录计算，指向包内 Astro 文件。`engine` 是主题契约版本范围，不是 Core 包版本。`encryptedPosts: true` 意味着文章页确实能够处理受保护正文。

更多页面和嵌套设置规则见 [API 参考](Theme-API)。

## 3. 编写首页

以下示例可放入 `src/pages/home.astro`：

```astro
---
import type { HomePageData, PageProps } from '@mintfolio/core/astro';
import SeoHead from '@mintfolio/core/components/SeoHead.astro';

interface Props extends PageProps<{ accentColor: string }, HomePageData> {}
const { theme, page } = Astro.props;
---
<!doctype html>
<html lang={theme.site.language}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <SeoHead seo={page.seo} />
  </head>
  <body style={`--accent: ${theme.settings.accentColor}`}>
    <main>
      <h1>{theme.site.title}</h1>
      <p>{theme.site.description}</p>
      <ul>
        {page.posts.map((post) => (
          <li><a href={post.url}>{post.title}</a></li>
        ))}
      </ul>
    </main>
  </body>
</html>
<style>
  body { max-width: 48rem; margin: auto; padding: 2rem; font-family: system-ui; }
  a { color: var(--accent); }
</style>
```

使用 `post.url` 和 `theme.urls` 生成的地址。公开 DTO 已经过 Core 的草稿与受保护内容策略处理；不要直接读取文章集合。

## 4. 渲染文章与交互

文章页先判断 `page.body.kind`：

```astro
{page.body.kind === 'public'
  ? <div set:html={page.body.html} />
  : <ProtectedArticle body={page.body} />}
```

`ProtectedArticle` 从 `@mintfolio/core/components/ProtectedArticle.astro` 导入。完整布局可参考 Starter 的文章页；它会同时渲染 Core 提供的 SEO 数据。

需要自定义解锁表单、图片预览或目录时，使用公开客户端控制器。通过 `onPage` 和 `scope.signal` 注册事件，离开页面时释放控制器，防止 Astro 页面切换后重复绑定。接口及生命周期见 [API 参考](Theme-API)。

## 5. 提供配置模板

在包内建立 `config/theme-paper.config.mjs`：

```js
export default {
  // 链接与强调元素使用的颜色。
  accentColor: '#2255aa',
};
```

然后在 `package.json` 声明 `"mintfolio": { "configTemplate": "./config/theme-paper.config.mjs" }`，并把 `config` 放入 `files` 白名单。站点切换到你的主题时，Core 会把这个对象（包括其中的注释）写入站点 `theme.config.mjs` 的 `settings`。

## 6. 验证真正的 npm 包

```sh
npm run check
npm pack
```

在独立测试站点安装产出的 `.tgz`，然后切换到你在 `package.json` 中声明的包名：

```sh
npm install ../your-theme/your-theme-1.0.0.tgz
npx mintfolio theme use your-theme
npx mintfolio theme check
npx mintfolio build
npx mintfolio preview
```

检查首页、公开文章、密码文章、缺失页面的回退、移动端、键盘操作和页面切换。打包安装能够发现遗漏资源或依赖的问题。

## 7. 发布自己的主题

发布前确认 `files` 包含 renderer、布局、样式、字体及配置模板；用 `npm pack --dry-run` 查看清单。保留 Core 与 Astro 的 peerDependencies，声明实际使用的依赖，并为字体等资源保留许可证。

请先将 Starter 的包名、作者和仓库地址改为自己的信息；如果开发期间设置了 `private: true`，发布时移除它，再执行 `npm publish --access public`。这一步会实际公开 npm 包，请使用自己的包名和 npm 账号。GPL-3.0-only 许可要求及完整条款见仓库 LICENSE。

SDK 1.2 的系列查询、搜索端点、子目录资源 URL 和 `ThemePageProps` 推导示例见 [Theme API](Theme-API#sdk-12-与-core-04)。
