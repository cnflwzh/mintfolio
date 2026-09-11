# MintfolioCore

博客引擎。src/server、engine、routes 是私有实现；public、client、components 提供主题公共 API；fallback 是 Minimal。tests 与 tools/verify-theme-boundaries.mjs 验证核心契约。

只为核心功能编写单元测试，非核心或边缘功能没有明确要求时不要新增测试。集中验证，不要每修改一个文件就跑测试。为公开接口写清楚输入、输出和生命周期要求。

- Node.js >= 22.12.0; strict TypeScript; use import type for types.
- Keep source imports inside this repository or public npm exports. Never import sibling repositories or host private modules.
- vendor contains actual unpublished dependency archives pinned by package-lock.json. Update them through npm run deps:update; preserve semver declarations in package.json.
- Commit only source, docs, lockfiles and required vendor packages. Ignore node_modules, dist, artifacts and caches.
- Use focused English feat:/fix:/refactor: commits; user-facing documentation is Chinese.

```sh
npm ci
npm test
npm pack
```
