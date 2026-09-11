import { unlockArticle, type ArticleUnlockError, type UnlockedArticle } from '@mintfolio/theme-api/client';
import type { Cleanup } from './lifecycle.js';

export type ProtectedArticleStatus = 'locked' | 'unlocking' | 'unlocked';

/** The theme owns DOM rendering; Core owns the short-lived unlock operation. */
export interface ProtectedArticleOptions {
  postId: string;
  payload: unknown;
  /** Mount the returned fragment once; do not persist or retain plaintext. */
  onUnlock(content: UnlockedArticle): void;
  /** Clear article nodes, TOC nodes, preview images, password values and error UI. */
  onClear(): void;
  onState?(state: ProtectedArticleStatus): void;
  onError?(error: ArticleUnlockError | Error): void;
  signal?: AbortSignal;
}

export interface ProtectedArticleController {
  /** Returns false if disposed, already busy, rejected, or superseded by a lock. */
  unlock(password: string): Promise<boolean>;
  lock(): void;
  dispose: Cleanup;
}

/**
 * Own authentication races and navigation cleanup once for all themes. No secret
 * enters storage, history, callbacks other than onUnlock, or error messages.
 */
export function createProtectedArticleController(options: ProtectedArticleOptions): ProtectedArticleController {
  let generation = 0;
  let disposed = false;
  let busy = false;
  let active = true;
  const lifetime = new AbortController();
  const lock = (): void => {
    generation += 1;
    busy = false;
    options.onClear();
    options.onState?.('locked');
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    options.signal?.removeEventListener('abort', dispose);
    lock();
  };
  window.addEventListener('pagehide', () => { active = false; lock(); }, { signal: lifetime.signal });
  window.addEventListener('pageshow', () => { active = true; lock(); }, { signal: lifetime.signal });
  document.addEventListener('astro:before-swap', dispose, { signal: lifetime.signal });
  options.signal?.addEventListener('abort', dispose, { once: true });
  if (options.signal?.aborted) dispose();
  return {
    async unlock(password): Promise<boolean> {
      if (disposed || !active || busy || !password) return false;
      const operation = ++generation;
      busy = true;
      options.onState?.('unlocking');
      try {
        const content = await unlockArticle(options.payload, password, options.postId);
        if (disposed || !active || operation !== generation) return false;
        options.onUnlock(content);
        options.onState?.('unlocked');
        return true;
      } catch (error) {
        if (disposed || !active || operation !== generation) return false;
        // Also clear any partial mount if the theme's onUnlock callback fails.
        options.onClear();
        options.onState?.('locked');
        options.onError?.(error instanceof Error ? error : new Error('Article unlocking failed'));
        return false;
      } finally {
        if (operation === generation) busy = false;
      }
    },
    lock,
    dispose,
  };
}
