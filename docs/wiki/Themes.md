# 安装与切换主题

Core 内置 Minimal，可直接使用。Verdant 提供完整个人主页、配色与阅读工具，需要独立安装。

```sh
mintfolio theme install verdant --use
mintfolio theme current
mintfolio theme list
mintfolio theme check
```

Verdant 的 npm 包名是 `@mintfolio/theme-verdant`，主题 ID 为 `verdant`，配置文件名为 `theme-verdant.config.mjs`。CLI 可使用 `verdant` 简写。

## 保存每个主题的设置

`theme.config.mjs` 选择当前主题：

```js
export default {
  theme: '@mintfolio/theme-verdant',
};
```

`theme-verdant.config.mjs` 保存 Verdant 的设置。安装时 Core 会复制带注释的模板；已有文件始终保留。也可手动补齐：

```sh
mintfolio theme init verdant
mintfolio theme sync
```

设置按“主题默认值 → 主题专属文件 → `theme.config.mjs.settings`”生效。对象递归合并，数组整体替换。未知键和不合法的值会在检查时指出具体路径。

升级不会覆盖旧配置。新字段可沿用主题默认值，也可以参考新版本模板自行添加。

## 切换与升级

```sh
mintfolio theme use minimal
mintfolio theme use verdant
mintfolio theme install @example/theme@1.2.3 --use
npm update @example/theme
```

用 `mintfolio --help` 查看当前 CLI 的完整命令；主题更新后执行 `mintfolio theme check` 和 `mintfolio build`，并重启开发服务。

仅为当前启动临时选用主题，可以设置环境变量 `MINTFOLIO_THEME`。当它指定另一个主题时，Core 使用该主题自己的设置，避免带入原主题的内联配置。

## 页面覆盖

`theme.config.mjs` 支持显式 `overrides.pages`，例如 `{ archive: './my-theme/archive.astro' }`。覆盖组件必须遵守主题公共 API 边界。缺少可选页面时 Core 使用 Minimal 对应页面。

从零创建主题请阅读[主题开发](Theme-Development)。
