import { createSearchEntry, readFiltersFromUrl, writeFiltersToUrl } from '@mintfolio/theme-api/search';
import type { PostSummary } from '@mintfolio/theme-api';
import { createPostListController } from './postList.js';
import type { PageScope } from './lifecycle.js';

/**
 * Default semantic binding for Core's optional PostArchive component. Custom
 * themes can use createPostListController directly and supply their own markup.
 * The root owns all selectors; multiple unrelated forms never get global handlers.
 */
export function bindPostArchive(root: HTMLElement, scope: PageScope): void {
  const form = root.querySelector<HTMLFormElement>('[data-filter-form]');
  const query = form?.querySelector<HTMLInputElement>('[name="q"]');
  const tag = form?.querySelector<HTMLSelectElement>('[name="tag"]');
  const category = form?.querySelector<HTMLSelectElement>('[name="category"]');
  const status = root.querySelector<HTMLElement>('[data-filter-status]');
  const more = root.querySelector<HTMLButtonElement>('[data-load-more]');
  if (!form || !query || !tag || !category) return;
  const posts: PostSummary[] = JSON.parse(root.dataset.posts ?? '[]');
  const controller = createPostListController({ items: posts, index: createSearchEntry, initialFilters: readFiltersFromUrl(location.href), ...(root.dataset.pageSize ? { pageSize: Number(root.dataset.pageSize) } : {}) });
  scope.add(controller.dispose);
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-post-id]'));
  scope.add(controller.subscribe((state) => {
    // Preserve a URL filter even if no select option exists: a miss is zero matches.
    for (const [select, value] of [[tag, state.filters.tag], [category, state.filters.category]] as const) {
      if (value && !Array.from(select.options).some((option) => option.value === value)) select.add(new Option(value, value));
      select.value = value;
    }
    if (document.activeElement !== query) query.value = state.filters.q;
    const ids = new Set(state.visible.map((post) => post.id));
    rows.forEach((row) => { row.hidden = !ids.has(row.dataset.postId ?? ''); });
    if (status) status.textContent = `共 ${state.total} 篇文章`;
    if (more) more.hidden = !state.hasMore;
  }));
  const update = (): void => {
    controller.setFilters({ q: query.value.trim(), tag: tag.value, category: category.value });
    history.replaceState(history.state, '', writeFiltersToUrl(controller.value().filters, new URL(location.href)));
  };
  const eventOptions = { signal: scope.signal };
  form.addEventListener('submit', (event) => { event.preventDefault(); update(); }, eventOptions);
  form.addEventListener('input', update, eventOptions);
  form.addEventListener('change', update, eventOptions);
  more?.addEventListener('click', controller.loadMore, eventOptions);
  window.addEventListener('popstate', () => controller.setFilters(readFiltersFromUrl(location.href)), eventOptions);
}
