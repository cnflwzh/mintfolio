export interface ResolveStoredArticleBackHrefInput {
  /** Optional saved list URL, including its filter query and content anchor. */
  storedHref: string | null;
  currentPath: string;
  currentOrigin: string;
  /** The archive destination injected by Core into this page's document. */
  fallbackHref: string;
}

/**
 * Return a saved same-origin list destination or Core's archive URL. Reject
 * external targets and self-navigation without knowing the host's route shape.
 */
export function resolveStoredArticleBackHref({
  storedHref, currentPath, currentOrigin, fallbackHref,
}: ResolveStoredArticleBackHrefInput): string {
  if (!storedHref) return fallbackHref;
  try {
    const target = new URL(storedHref, currentOrigin);
    if (target.origin !== currentOrigin || target.pathname === currentPath) return fallbackHref;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallbackHref;
  }
}

export interface ShouldPersistArticleBackHrefInput {
  linkHref: string;
  currentOrigin: string;
  currentPath: string;
  /** Only links rendered from public PostSummary.url carry this theme marker. */
  isArticleLink: boolean;
}

/** Save list position only when the visitor follows an internal article link. */
export function shouldPersistArticleBackHref({
  linkHref, currentOrigin, currentPath, isArticleLink,
}: ShouldPersistArticleBackHrefInput): boolean {
  if (!isArticleLink) return false;
  try {
    const target = new URL(linkHref, currentOrigin);
    return target.origin === currentOrigin && target.pathname !== currentPath;
  } catch {
    return false;
  }
}
