import assert from 'node:assert/strict';
import test from 'node:test';
import { ELEMENT_NODE, parse, walkSync } from 'ultrahtml';
import { htmlToHast } from 'satteri';
import { prepareContentHtml } from '../src/server/contentHtml.ts';

function elements(html) {
  const result = [];
  walkSync(parse(html), node => { if (node.type === ELEMENT_NODE) result.push(node); });
  return result;
}

test('rendered tables provide static keyboard regions and repeated preparation never nests wrappers', () => {
  const source = '<table id="new-table"><caption>Quarterly figures</caption><thead><tr><th scope="col">Project</th></tr></thead><tbody><tr><td><a href="/links">Notes</a></td></tr></tbody></table>'
    + '<div data-mintfolio-table-scroll="" tabindex="0" role="region" aria-label="Existing table"><table id="existing"><tr><td>Kept</td></tr></table></div>';
  for (const base of ['/', '/blog-site/']) {
    const once = prepareContentHtml(source, base);
    assert.equal(prepareContentHtml(once, base), once);
    const nodes = elements(once);
    const wrappers = nodes.filter(node => 'data-mintfolio-table-scroll' in node.attributes);
    const tables = nodes.filter(node => node.name === 'table');
    assert.equal(wrappers.length, 2);
    assert.equal(tables.length, 2);
    for (const wrapper of wrappers) {
      assert.equal(wrapper.attributes.tabindex, '0');
      assert.equal(wrapper.attributes.role, 'region');
      assert.ok(wrapper.attributes['aria-label'].trim());
    }
    assert.ok(tables.every(table => wrappers.includes(table.parent)));
    assert.equal(nodes.find(node => node.name === 'th').attributes.scope, 'col');
    assert.equal(nodes.find(node => node.name === 'a').attributes.href, base + 'links');
    assert.ok(once.includes('<caption>Quarterly figures</caption>'));
    assert.doesNotMatch(once, /<script\b/);
  }
});

test('root links, media and srcset candidates keep root deployments working and resolve subpaths only once', () => {
  const source = '<a id="root-link" href="/guide?q=1&amp;tag=2#part">Guide</a>'
    + '<a id="already" href="/blog-site/guide">Guide</a>'
    + '<a id="fragment" href="#part">Section</a><a id="external" href="https://other.test/post">External</a>'
    + '<img id="root-image" src="/images/photo.png"><img id="relative" src="./photo.png">'
    + '<img id="cdn" src="//cdn.test/photo.png"><img id="data" src="data:image/png;base64,AAAA">'
    + '<video id="video" src="/clip.mp4" poster="/poster.png"></video>';
  for (const base of ['/', '/blog-site/']) {
    const output = prepareContentHtml(source, base);
    const nodes = new Map(elements(output).map(node => [node.attributes.id, node]));
    assert.equal(nodes.get('root-link').attributes.href, base + 'guide?q=1&amp;tag=2#part');
    assert.equal(nodes.get('already').attributes.href, '/blog-site/guide');
    assert.equal(nodes.get('fragment').attributes.href, '#part');
    assert.equal(nodes.get('external').attributes.href, 'https://other.test/post');
    assert.equal(nodes.get('root-image').attributes.src, base + 'images/photo.png');
    assert.equal(nodes.get('relative').attributes.src, './photo.png');
    assert.equal(nodes.get('cdn').attributes.src, '//cdn.test/photo.png');
    assert.equal(nodes.get('data').attributes.src, 'data:image/png;base64,AAAA');
    assert.equal(nodes.get('video').attributes.src, base + 'clip.mp4');
    assert.equal(nodes.get('video').attributes.poster, base + 'poster.png');
    assert.equal(prepareContentHtml(output, base), output);
  }
  const data = 'data:image/svg+xml,%3Csvg%3E,%3C/svg%3E';
  for (const [srcset, expected] of [
    ['/large.png 2x', '/blog-site/large.png 2x'],
    ['/small.png 320w, /large.png 640w', '/blog-site/small.png 320w, /blog-site/large.png 640w'],
    [data + ' 1x, /large.png 2x', data + ' 1x, /blog-site/large.png 2x'],
    ['/small.png 1x, ' + data + ' 2x', '/blog-site/small.png 1x, ' + data + ' 2x'],
    ['/small.png, /large.png', '/blog-site/small.png, /blog-site/large.png'],
  ]) {
    const markup = '<img srcset="' + srcset + '">';
    assert.equal(elements(prepareContentHtml(markup, '/'))[0].attributes.srcset, srcset);
    const output = prepareContentHtml(markup, '/blog-site/');
    assert.equal(elements(output)[0].attributes.srcset, expected);
    assert.equal(prepareContentHtml(output, '/blog-site/'), output);
  }
});

test('escaped source, script and style contents survive while literal attribute quotes remain valid HTML', () => {
  const code = '&lt;img src=&quot;/code.png&quot;&gt; &amp; &lt;table&gt;';
  const script = JSON.stringify({ html: '<table><tr><td><img src="/script.png"></td></tr></table>', url: '/script-link' });
  const style = '.sample::before { content: "<table>"; background: url(/style.png); }';
  const source = '<pre><code>' + code + '</code></pre>'
    + '<script type="application/json">' + script + '</script><style>' + style + '</style>'
    + '<!-- <table><img src="/comment.png"></table> -->'
    + '<a title=\'say "hello"\' href=\'/links\'>A &amp; B</a>';
  const output = prepareContentHtml(source, '/blog-site/');
  assert.ok(output.includes('<code>' + code + '</code>'));
  assert.ok(output.includes('<script type="application/json">' + script + '</script>'));
  assert.ok(output.includes('<style>' + style + '</style>'));
  assert.ok(output.includes('<!-- <table><img src="/comment.png"></table> -->'));
  assert.doesNotMatch(output, /data-mintfolio-table-scroll/);
  // Parse with the independent Markdown HTML parser to verify actual attribute meaning.
  const anchor = htmlToHast(output, { fragment: true }).children.find(node => node.tagName === 'a');
  assert.equal(anchor.properties.title, 'say "hello"');
  assert.equal(anchor.properties.href, '/blog-site/links');
  assert.equal(prepareContentHtml(output, '/blog-site/'), output);
});
