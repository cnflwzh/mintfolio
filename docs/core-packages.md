# 独立仓库与包的使用

源码分别由 MintfolioThemeAPI、MintfolioCore、MintfolioThemeDefault、MintfolioThemeStarter 管理；PersonalSite 是消费 npm 包的站点仓库，不再包含 workspace 或包源码。

Core 自身源码在 src：server / engine / routes 为私有实现，public / client / components 是公共能力，fallback 为内置 Minimal。Core 不依赖 Default、React 或 Tailwind。

## 开发本仓库

```sh
npm ci
npm test
npm pack
```

npm ci 的未发布依赖来自 vendor 中的实际 SDK 包，package-lock.json 固定其字节。package.json 保持 ^1.0.0 等正常发布范围。更新 SDK：先在 SDK 仓库运行 npm pack，再在本仓库运行 npm run deps:update -- /path/to/sdk.tgz，然后 npm ci。

## 使用 Core 创建站点

当前包尚未发布到公共 registry。在新站点传入 SDK 和 Core 的实际 tgz：

```sh
npm install /path/to/mintfolio-theme-api-1.0.0.tgz /path/to/mintfolio-core-0.1.0.tgz
npx mintfolio init
npm run dev
```

默认使用内置 Minimal。需要 Default 时另装对应 tgz，并设置 theme.config.mjs 为 export default { theme: '@mintfolio/theme-default' }。发布后即可按包名 npm install，无需手动传入传递依赖。

站点只保留内容、资产、site.config.ts、theme.config.mjs 和 Astro/内容集合入口。Core 注入路由，主题调用公共 API。完整接口见 [Theme API](theme-api.md)。MIGRATION.md 记录拆分来源；旧验收文档仅为历史记录。
