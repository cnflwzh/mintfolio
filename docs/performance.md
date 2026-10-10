# 内容规模与搜索性能验收

`tools/benchmark-content.mjs` 用真实 Core、已安装 ThemeAPI 和内置 Minimal 构建公开 Markdown 站点。它用于比较同一环境中不同内容规模或实现版本的成本，默认生成 100 篇和 1000 篇文章；不会安装依赖、访问内容服务、修改源码或复用其他任务的构建目录。

## 运行

需要 Node.js >= 22.12.0，以及当前 Core 的已安装依赖和编译好的 `dist`。常规开发流程先完成 `npm ci` 和 `npm run build`，之后运行基准时不再安装依赖。修改了 Core 的公开 TypeScript 导出后，先重新编译，避免源码与 `dist` 不一致。

```sh
# 先确定本机的执行成本
node tools/benchmark-content.mjs --counts 100 --label baseline

# 同一份源码快照，依次构建两个独立站点
node tools/benchmark-content.mjs --counts 100,1000 --label current

# 调整长文长度或查询采样次数
node tools/benchmark-content.mjs --counts 1000 --paragraphs 40 --iterations 50 --label long-posts

# 保留到指定父目录；工具仍会创建新的随机目录
node tools/benchmark-content.mjs --counts 100 --output-dir .cache/content-benchmarks
```

`--help` 显示全部参数。`--core-root` 可以指定另一份已安装依赖、已编译的 Core 工作副本，不需要把工具复制过去。所有参数均接受以空格分隔的值；含空格的路径应使用当前 shell 的引号规则。

默认结果保存在操作系统 TEMP 下新建的 `mintfolio-benchmark-*` 目录。工具保留所有 fixture、源码快照、`build.log` 和 `benchmark.json`，方便检查失败原因。它不做自动清理。请在检查结果后自行删除指定的运行目录；其中 `node_modules` 包含指向真实依赖的目录链接，不要使用会跟随链接递归清理依赖目标的工具。

## 样本与隔离方式

每次运行首先复制 Core 的 `src`、`dist`、`bin`、`package.json`，以及已安装 ThemeAPI 的源文件、编译文件和包信息。其他 npm 依赖用目录链接复用现有安装，Windows 使用 junction。每种文章数量都有单独的内容、Astro 缓存和构建输出，不会读写站点现有的内容、配置或 `dist`。

报告记录 Core/ThemeAPI 快照的 SHA-256、原始 lockfile 哈希、Node/Astro/包版本、CPU、系统内存和操作系统。源码正在修改时，应等修改及编译完成再进行可比较的正式运行；哈希可识别不同快照，但不能替代版本管理。

默认样本为每篇 20 段中英混合正文，含标题、摘要、层级标题、唯一正文标记与代码围栏。日期固定在 2020 年，文章全部公开；共 5 个分类、10 个主题标签、1 个共同标签和 5 个系列，归档每页 10 篇。没有图片优化、加密文章、远程字体或插件开销。这些条件有意固定，用于观察内容规模；它不能代表所有真实网站。

特别注意：不同文章共享部分段落，gzip 压缩率通常优于措辞完全不同的真实文章。解读体积时应同时看 raw 与 gzip，正式上线前再用真实公开内容复核。

## 指标含义

| 报告字段 | 测量内容 | 限制 |
| --- | --- | --- |
| `build.elapsedMs` | 从启动 Astro 子进程到退出的墙钟时间，包含内容同步、Vite 编译和静态路由生成 | 不含生成 fixture、复制快照、压缩索引和搜索计时；全新 Astro 缓存不等于清空操作系统磁盘缓存 |
| `build.astroReported` | Astro 日志自身统计的时间和 HTML 页面数 | 可能不包含完整的进程启动与配置加载；日志格式改变时为 `null`，以外部墙钟为准 |
| `build.memory.sampledPeakRssBytes` | Astro 主进程每 100ms 采样得到的 RSS 峰值 | 包含进程内 worker threads；不包含 esbuild 等独立子进程；采样可能遗漏短暂峰值 |
| `build.memory.resourceUsageMaxRssBytes` | Node 可用时提供的主进程 RSS 峰值，统一为 bytes | 不可用时为 `null`；不代表整棵进程树 |
| `build.memory.peakRssBytes` | 上述两个可用值的最大值 | 仍只代表 Astro 主进程，不能据此直接估算整个 CI 容器的内存上限 |
| `index.rawBytes` | 实际生成 `dist/search-index.json` 的字节数 | 包含当前传输格式中的文章与索引元数据 |
| `index.gzipBytes` | 同一索引采用 gzip level 9 得到的字节数 | 不代表部署服务一定使用该压缩等级；不含 HTTP 开销 |
| `search[].rank` | 已加载索引上的 `rankSearchResults` 纯函数耗时 | 不含下载、JSON 解析和页面渲染 |
| `search[].rankAndFirst20Highlights` | 完整排名后，对前 20 条调用 `searchWithHighlights` | 对应当前组件的计算步骤，不包含构建元数据 Map、DOM、事件和浏览器调度 |

每个查询先执行 3 次预热，再采集默认 25 次，分别报告中位数、p95、最小值、最大值与平均值。查询包含常见中文、英文多词、唯一正文标记、无命中和只按标签筛选。`p95` 使用排序后向上取整的样本位置，样本数较少时不适合宣称严格的稳定性界限。

构建退出码、索引文章数量、ID 唯一性以及唯一正文查询的命中数都必须通过检查。失败会退出非零并保留已测数据和日志。它补充现有核心单元测试与 `tools/verify-theme-boundaries.mjs` 的真实解析器验收，不替代那些功能与边界检查。

## 比较与验收建议

1. 在同一台机器、同一 Node 与依赖版本、相同段落数下比较；避免与其他 CPU 密集构建同时运行。
2. 先跑 100 篇，确认日志无错误并估计时间，再跑 1000 篇。正式的前后对比可各运行 3 次独立 fixture，查看运行间波动，不以一次偶然快慢定结论。
3. 构建优化应优先解释文章数量与生成页数增加后的成本来源。不要把新缓存的收益与降低样本长度、关闭页面或更换主题混合比较。
4. 搜索纯函数在 Node 下较快，不足以证明移动端体验达标。还需要在目标浏览器记录索引实际压缩传输量、下载与解析时间、连续输入时的主线程阻塞，以及首次结果出现时间。
5. 只有实测超过项目自己的耗时与体积预算，再考虑索引去重、预先归一化、复用排名结果、限制高亮范围或 Worker。当前工具不设置缺乏设备依据的统一通过阈值，也不自动改写搜索实现。

基准属于可选维护检查，不应默认让每次单元测试都构建 1000 篇文章。可在内容查询、搜索索引、分页生成或相关依赖发生明显变化时单独执行，并把完整 JSON 作为验收证据。