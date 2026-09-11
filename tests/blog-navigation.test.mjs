import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStoredArticleBackHref,
  shouldPersistArticleBackHref,
} from '@mintfolio/core/client';

const currentOrigin = 'https://site.example';
const currentPath = '/blog/example';

test('article return navigation preserves the entry URL and rejects invalid targets', () => {
  for (const [storedHref, expected] of [
    ['/', '/'],
    ['/#content', '/#content'],
    ['/blog?tag=Astro&q=guide#results', '/blog?tag=Astro&q=guide#results'],
    [`${currentOrigin}/blog?tag=Astro`, '/blog?tag=Astro'],
    [null, '/blog'],
    ['', '/blog'],
    [`${currentPath}#heading`, '/blog'],
    ['https://external.example/blog', '/blog'],
    ['//external.example/blog', '/blog'],
    ['javascript:alert(1)', '/blog'],
    ['http://[', '/blog'],
  ]) {
    assert.equal(
      resolveStoredArticleBackHref({ storedHref, currentPath, currentOrigin, fallbackHref: '/blog' }),
      expected,
      `Return target: ${storedHref}`,
    );
  }
});

test('only navigation to another same-site article updates the return target', () => {
  for (const [linkHref, isArticleLink, expected] of [
    ['/blog/another', true, true],
    [`${currentOrigin}/blog/another?from=home`, true, true],
    // The theme follows the host's semantic marker, including a different route policy.
    ['/writing/another', true, true],
    [`${currentPath}#heading`, true, false],
    ['/blog', false, false],
    ['/blog/', false, false],
    ['/blog?tag=Astro', false, false],
    ['/about', false, false],
    ['https://external.example/blog/another', true, false],
    ['javascript:alert(1)', true, false],
    ['http://[', true, false],
  ]) {
    assert.equal(
      shouldPersistArticleBackHref({ linkHref, currentPath, currentOrigin, isArticleLink }),
      expected,
      `Article link: ${linkHref}`,
    );
  }
});
