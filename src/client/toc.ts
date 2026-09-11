import { createPageScope, type Cleanup } from './lifecycle.js';

/** Element references make TOC behavior independent of layout and class names. */
export interface TocOptions {
  headings: readonly HTMLElement[];
  links?: readonly HTMLAnchorElement[];
  /** Sticky header offset in pixels; use a function for responsive layouts. */
  offset?: number | (() => number);
  activeClass?: string;
  scrollActiveLink?: boolean;
  onActive?(headingId: string): void;
  /** Document reading progress from 0 to 100. */
  onProgress?(percentage: number): void;
  onNavigate?(headingId: string): void;
  signal?: AbortSignal;
}

export interface TocController {
  refresh(): void;
  scrollTo(headingId: string): void;
  dispose: Cleanup;
}

/** Track headings and navigate without adding a history entry for each section. */
export function createTocController(options: TocOptions): TocController {
  const scope = createPageScope();
  let activeId = '';
  let pending = false;
  const offset = (): number => typeof options.offset === 'function' ? options.offset() : options.offset ?? 0;
  const headingFor = (link: HTMLAnchorElement): HTMLElement | undefined => {
    let id: string;
    try { id = decodeURIComponent(new URL(link.href).hash.slice(1)); } catch { return undefined; }
    return options.headings.find((heading) => heading.id === id);
  };
  const setActive = (id: string): void => {
    if (!id || activeId === id) return;
    activeId = id;
    for (const link of options.links ?? []) {
      const active = headingFor(link)?.id === id;
      if (options.activeClass) link.classList.toggle(options.activeClass, active);
      if (active) {
        link.setAttribute('aria-current', 'true');
        if (options.scrollActiveLink) link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else link.removeAttribute('aria-current');
    }
    options.onActive?.(id);
  };
  const refresh = (): void => {
    if (scope.signal.aborted) return;
    const entries = options.headings.filter((heading) => heading.isConnected);
    let current: HTMLElement | undefined = entries[0];
    let nearest = Infinity;
    for (const heading of entries) {
      const distance = heading.getBoundingClientRect().top - offset();
      if (distance <= 0 && Math.abs(distance) < nearest) { nearest = Math.abs(distance); current = heading; }
    }
    const height = document.documentElement.scrollHeight - window.innerHeight;
    if (window.scrollY >= height - 50) current = entries.at(-1);
    if (current) setActive(current.id);
    options.onProgress?.(height > 0 ? Math.max(0, Math.min(100, window.scrollY / height * 100)) : 0);
  };
  const schedule = (): void => {
    if (pending) return;
    pending = true;
    scope.frame(() => { pending = false; refresh(); });
  };
  const scrollTo = (id: string): void => {
    const heading = options.headings.find((entry) => entry.id === id);
    if (!heading || scope.signal.aborted) return;
    window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - offset(), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    const url = new URL(location.href);
    url.hash = id;
    history.replaceState(history.state, '', url);
    setActive(id);
    options.onNavigate?.(id);
  };
  for (const link of options.links ?? []) link.addEventListener('click', (event) => {
    const heading = headingFor(link);
    if (!heading) return;
    event.preventDefault();
    scrollTo(heading.id);
  }, { signal: scope.signal });
  window.addEventListener('scroll', schedule, { signal: scope.signal, passive: true });
  window.addEventListener('resize', schedule, { signal: scope.signal });
  options.signal?.addEventListener('abort', scope.dispose, { once: true });
  scope.add(() => options.signal?.removeEventListener('abort', scope.dispose));
  if (options.signal?.aborted) scope.dispose();
  else schedule();
  return { refresh, scrollTo, dispose: scope.dispose };
}
