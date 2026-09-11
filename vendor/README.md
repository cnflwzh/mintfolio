# 本地依赖快照

此目录保存尚未发布到 npm 的实际依赖包，和 package-lock.json 一起提交。`npm ci` 使用这些快照，不需要相邻仓库。运行时与主题源码不通过相对路径引用其他仓库。

更新时先在依赖仓库执行 `npm pack --pack-destination artifacts`（先创建目录），再运行：

```sh
npm run deps:update -- /path/to/dependency.tgz
npm ci
```

工具会保留 package.json 的语义版本范围，只让仓库锁文件指向 vendor 内的对应版本。npm 包的 files 白名单不包含 vendor，因此发布包仍使用正常的 npm 依赖声明。公共 registry 发布后可移除快照并通过 npm 更新锁文件。
