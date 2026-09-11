# 构建与部署

Mintfolio 输出静态站点。先在站点根目录执行：

```sh
npm ci
npx mintfolio check
npx mintfolio build
npx mintfolio preview
```

默认产物目录是 `dist/`。`preview` 用于检查构建结果，生产环境应由静态托管平台或 Web 服务器提供服务。

## 托管平台设置

| 配置项 | 值 |
| --- | --- |
| 安装命令 | `npm ci` |
| 构建命令 | `npx mintfolio build` |
| 输出目录 | `dist` |
| Node.js | 至少 22.12.0，使用受支持的 LTS |
| 环境变量 | 通常不需要；按自己的平台设置 |

提交站点的 `package-lock.json`，使 CI 安装与本地一致的依赖。不要上传 `node_modules`。

## 自己的服务器

将 `dist/` 内容上传到网站根目录，并让 nginx、Caddy 或其他静态服务器提供文件。生产服务器无需运行 Mintfolio 或 Node.js。

正式切换前，用预览域名核对首页、文章、404、RSS、Sitemap 和静态资源；准备好上一版产物，以便回滚。

## 发布前核对

- `site.config.ts` 的 `site.url` 是实际访问域名。
- 草稿状态和公开个人资料符合你的预期。
- HTTPS 正常，密码文章可以解锁并重新锁定。
- 首页、文章内图片、字体和链接正常。
- `/rss.xml` 与 `/sitemap.xml` 以实际生成结果为准，检查地址与内容。

Core 不会自动创建托管项目或部署。仓库中的包 CI 只检查代码与 npm 包；站点的发布方式由站点维护者自行设置。
