import assert from 'node:assert/strict';
import test from 'node:test';
import { contentText,readingStats } from '../src/server/contentText.ts';
test('public prose extraction excludes fenced code and markup while retaining readable text',()=>{
  const source='# 中文标题\n\nHello 世界，保持好奇。\n\n'+'\x60\x60\x60js\nPRIVATE_CODE_SENTINEL\n\x60\x60\x60\n';
  const text=contentText(source);
  assert.ok(text.includes('中文标题'));
  assert.ok(text.includes('Hello 世界'));
  assert.equal(text.includes('PRIVATE_CODE_SENTINEL'),false);
  assert.equal(readingStats('Hello世界').wordCount,3);
  assert.equal(readingStats('使用Astro搭建博客').wordCount,7);
  assert.equal(readingStats('word '.repeat(241)).readingMinutes,2);
});
