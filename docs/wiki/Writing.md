# Markdown 写作

默认文章位于 `content/blog/**/*.md`。每篇文章由 YAML frontmatter 和 Markdown 正文组成。

```md
---
title: "一次小小的改进"
pubDate: 2026-09-11
description: "记录这次改进的原因与做法"
category: "开发"
tags: ["Astro", "随笔"]
draft: false
---

从这里开始写正文。

## 思路

也可以插入图片、链接与代码块。
```

## 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `pubDate` | 是 | 能转换为日期的值，建议使用 YYYY-MM-DD |
| `description` | 是 | 公开摘要 |
| `category` | 否 | 单个分类 |
| `tags` | 否 | 标签字符串数组 |
| `cover` | 否 | 封面图片路径或 URL |
| `draft` | 否 | 默认为 false；CLI 新建文章会显式设为 true |
| `password` | 否 | 非空密码；正文构建为密文 |

文章 ID 来自文件路径，例如 `notes/first.md` 对应 `notes/first`。修改文件名会影响文章地址；已有外链需要自行安排重定向。

## 常用命令

```sh
mintfolio post new "第一篇文章" --slug first --category 随笔 --tags 写作,生活
mintfolio post list --draft
mintfolio post publish first
mintfolio post draft first
```

这些命令使用默认内容目录。同名文件不会被覆盖；发布和撤回草稿时保留原正文及其他 frontmatter，并备份原文件。

## 密码文章

在 frontmatter 添加 `password`。Core 构建时加密正文及目录，读者在浏览器中输入密码解锁。标题、日期、分类和标签仍是公开信息；公开摘要使用 Core 的占位文本。

密码文章需要支持 `encryptedPosts` 的主题。请通过 HTTPS 部署以使用浏览器 Web Crypto。不要将含密码的文章源码放进公开仓库；加密功能保护构建输出，源码仍包含正文和密码。

草稿不会出现在公开页面、搜索、RSS 或 Sitemap 中。搜索匹配标题与公开摘要，不是正文全文搜索。
