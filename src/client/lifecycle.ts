export type Cleanup = () => void;

/** Resources owned by one mounted page or widget; disposal is idempotent. */
export interface PageScope {
  readonly signal: AbortSignal;
  add(cleanup: Cleanup): void;
  timeout(callback: () => void, delay: number): number;
  frame(callback: FrameRequestCallback): number;
  dispose(): void;
}

/** Create a scope for listeners, timers, animation frames, and caller cleanups. */
export function createPageScope(): PageScope {
  const controller = new AbortController();
  const cleanups: Cleanup[] = [];
  const timers = new Set<number>();
  const frames = new Set<number>();
  return {
    signal: controller.signal,
    add(cleanup): void { if (controller.signal.aborted) cleanup(); else cleanups.push(cleanup); },
    timeout(callback, delay): number {
      const id = window.setTimeout(() => { timers.delete(id); if (!controller.signal.aborted) callback(); }, delay);
      timers.add(id);
      return id;
    },
    frame(callback): number {
      const id = window.requestAnimationFrame((time) => { frames.delete(id); if (!controller.signal.aborted) callback(time); });
      frames.add(id);
      return id;
    },
    dispose(): void {
      if (controller.signal.aborted) return;
      controller.abort();
      timers.forEach((id) => window.clearTimeout(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      // Run every cleanup even if one widget fails; protected content must still clear.
      const errors: unknown[] = [];
      for (const cleanup of cleanups.reverse()) { try { cleanup(); } catch (error) { errors.push(error); } }
      cleanups.length = 0;
      timers.clear();
      frames.clear();
      if (errors.length) console.error('[mintfolio:lifecycle] Widget cleanup failed', errors);
    },
  };
}

/**
 * Mount behavior on ordinary documents, Astro swaps, and BFCache restores.
 * @param target A theme selector or a function resolving its current root.
 * @param setup Attach behavior to that root and register cleanup with its scope.
 * @returns Stop listening and dispose the current mount.
 */
export function onPage(target: string | (() => HTMLElement | null), setup: (root: HTMLElement, scope: PageScope) => void): Cleanup {
  const lifetime = new AbortController();
  let root: HTMLElement | null = null;
  let scope: PageScope | null = null;
  const dispose = (): void => { scope?.dispose(); scope = null; root = null; };
  const mount = (): void => {
    const next = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target();
    if (root === next) return;
    dispose();
    if (!next) return;
    root = next;
    scope = createPageScope();
    setup(root, scope);
  };
  const options = { signal: lifetime.signal };
  document.addEventListener('astro:before-swap', dispose, options);
  document.addEventListener('astro:page-load', mount, options);
  document.addEventListener('article:content-changed', mount, options);
  window.addEventListener('pagehide', dispose, options);
  window.addEventListener('pageshow', mount, options);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { ...options, once: true });
  else mount();
  return (): void => { lifetime.abort(); dispose(); };
}
