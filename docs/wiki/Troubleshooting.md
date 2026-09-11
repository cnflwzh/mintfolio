# 常见问题

## 修改后没有变化

确认终端的站点目录与浏览器访问的地址一致。修改主题选择、manifest 或依赖后重启开发服务；普通专属配置文件的变化会由开发服务监听。

```sh
mintfolio doctor
mintfolio theme current
mintfolio theme check
```

全局 CLI 和站点 Core 版本可能不同，doctor 会分别报告。

## 新文章没有出现在列表里

检查文章是否仍为 `draft: true`，以及文件是否位于 `content/blog`。执行 `mintfolio post publish <id>` 后重新构建。自定义内容集合目录需要直接管理其中的文章。

## 配置校验失败

根据错误中的完整路径检查字段名、类型、数组条目和颜色格式。主题只接受其 schema 中声明的设置。切换主题时，将设置放入对应 `theme-<id>.config.mjs`，避免混用。

## 密码正确却无法解锁

确认使用 HTTPS 或 localhost，检查浏览器错误，并用最新构建产物重试。文章 ID 与密文绑定，旧缓存或手动混用产物可能导致验证失败。不要把真实密码和正文贴到 Issue。

## 搜索结果与预期不同

搜索只检查标题及公开摘要，分类和标签按显示名称精确匹配。多个筛选条件组合生效；清空其他条件后再检查。静态页面上的筛选由浏览器执行。

## 自定义主题报导入边界错误

主题只能依赖公共 API、自身文件及渲染依赖。不能读取宿主配置、文章源文件、`astro:content` 或 Core 私有实现。使用 `Astro.props` 中的 `theme` 和 `page` 获取公开内容，见 [Theme API](Theme-API)。

## 提交问题

附上 `mintfolio doctor` 的脱敏结果、操作步骤、实际与预期行为，以及最小复现。与特定主题相关的问题提交到该主题仓库；涉及内容、路由或 CLI 的问题提交到 Core。
