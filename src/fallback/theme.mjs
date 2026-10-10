import { defineTheme } from '@mintfolio/theme-api';

/**
 * The Minimal theme deliberately keeps presentation to a text-first reading
 * experience. Content, routing, and protected-article handling remain owned
 * by the Mintfolio runtime and are supplied through the public theme API.
 */
export default defineTheme({
  manifest: {
    id: 'minimal',
    name: 'Minimal',
    version: '0.3.0',
    author: 'Mintfolio contributors',
    description: '用于阅读和文字归档的单栏博客主题。',
    engine: '^1.1.0',
  },
  capabilities: {
    search: true,
    tags: true,
    categories: true,
    toc: false,
    darkMode: false,
    encryptedPosts: true,
  },
  pages: {
    home: './pages/home.astro',
    post: './pages/post.astro',
    archive: './pages/archive.astro',
    page: './pages/page.astro',
    notFound: './pages/not-found.astro',
  },
  settings: {
    maxWidth: {
      type: 'number',
      label: '正文宽度',
      description: '阅读栏的最大宽度，单位为像素。',
      default: 760,
      min: 480,
      max: 1200,
    },
    accentColor: {
      type: 'color',
      label: '强调色',
      description: '链接和交互控件使用的颜色。',
      default: '#2255aa',
    },
  },
});
