import { emptyFilters, searchPosts } from '@mintfolio/theme-api/search';
import type { PostFilters, SearchEntry } from '@mintfolio/theme-api';
import type { Cleanup } from './lifecycle.js';

/** Filtered content and pagination state; UI structure is entirely caller-owned. */
export interface PostListState<T> {
  filters: PostFilters;
  matches: T[];
  visible: T[];
  total: number;
  limit: number;
  hasMore: boolean;
  /** Facets ignore q, matching the blog's existing taxonomy navigation behavior. */
  facets: { tags: string[]; categories: string[] };
}

export interface PostListOptions<T> {
  /** Safe public DTOs or theme models derived exclusively from those DTOs. */
  items: readonly T[];
  /** Map each model to Core's normalized public search fields. Called once. */
  index: (item: T) => SearchEntry;
  initialFilters?: Partial<PostFilters>;
  pageSize?: number;
  initialLimit?: number;
  /** Optional radio-group UX: clear a selection made unavailable by the other facet. */
  reconcileFacets?: boolean;
}

/** No DOM, storage, history, sorting policy, or theme classes are hidden here. */
export interface PostListController<T> {
  value(): PostListState<T>;
  setFilters(filters: Partial<PostFilters>): void;
  loadMore(): void;
  setLimit(limit: number): void;
  subscribe(listener: (state: PostListState<T>) => void): Cleanup;
  dispose(): void;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive safe integer`);
  return value;
}

/**
 * Shared search, combined tag/category filtering, facets, and load-more state.
 * @returns A controller whose subscriptions receive the initial state immediately.
 */
export function createPostListController<T>(options: PostListOptions<T>): PostListController<T> {
  const indexed = options.items.map((item) => ({ ...options.index(item), item }));
  const pageSize = positiveInteger(options.pageSize ?? (indexed.length || 1), 'pageSize');
  let limit = positiveInteger(options.initialLimit ?? pageSize, 'initialLimit');
  let filters: PostFilters = { ...emptyFilters(), ...options.initialFilters };
  if (Object.values(filters).some((item) => typeof item !== 'string')) throw new Error('Filters must be strings');
  let disposed = false;
  const listeners = new Set<(state: PostListState<T>) => void>();
  const facets = (): PostListState<T>['facets'] => ({
    tags: [...new Set(searchPosts(indexed, { category: filters.category }).flatMap((entry) => entry.tags))],
    categories: [...new Set(searchPosts(indexed, { tag: filters.tag }).map((entry) => entry.category))],
  });
  const reconcile = (): void => {
    if (!options.reconcileFacets) return;
    if (filters.tag && !facets().tags.includes(filters.tag.toLowerCase())) filters.tag = '';
    if (filters.category && !facets().categories.includes(filters.category.toLowerCase())) filters.category = '';
  };
  reconcile();
  const value = (): PostListState<T> => {
    const matches = searchPosts(indexed, filters).map((entry) => entry.item);
    return { filters: { ...filters }, matches, visible: matches.slice(0, limit), total: matches.length, limit, hasMore: matches.length > limit, facets: facets() };
  };
  const emit = (): void => { if (!disposed) for (const listener of listeners) listener(value()); };
  return {
    value,
    setFilters(next): void {
      if (disposed) return;
      const changed = { ...filters, ...next };
      if (Object.values(changed).some((item) => typeof item !== 'string')) throw new Error('Filters must be strings');
      if (changed.q !== filters.q || changed.tag !== filters.tag || changed.category !== filters.category) limit = pageSize;
      filters = changed;
      reconcile();
      emit();
    },
    loadMore(): void { if (!disposed) { limit = Math.min(Number.MAX_SAFE_INTEGER, limit + pageSize); emit(); } },
    setLimit(next): void { if (!disposed) { limit = positiveInteger(next, 'limit'); emit(); } },
    subscribe(listener): Cleanup {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(value());
      return (): void => { listeners.delete(listener); };
    },
    dispose(): void { disposed = true; listeners.clear(); },
  };
}
