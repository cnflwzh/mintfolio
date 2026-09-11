# 独立仓库起点

从 PersonalSite 的 `packages/core` 拆出，来源提交 `4e9a8c7`。此前完整历史保留在原 PersonalSite 仓库；本仓库从当前包快照开始独立管理。

本仓库的源码不引用 PersonalSite 或其他仓库目录。尚未公开发布的依赖通过 `vendor/` 中的实际 npm 包和 package-lock.json 固定；npm 发布清单保留语义版本依赖。
