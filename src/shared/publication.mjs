/**
 * Classify build eligibility without reading the clock or changing the input.
 * A publishable article is eligible for a build; this says nothing about deployment.
 * @param {{draft?:boolean,pubDate:Date|string|number}} article Publication fields only.
 *   Missing draft means false. Date strings use Core's collection Date coercion;
 *   date-only strings mean UTC midnight.
 * @param {Date} now Explicit cutoff captured once by the calling list/build operation.
 * @returns {'draft'|'scheduled'|'publishable'} Draft takes precedence; equality
 *   with the cutoff is publishable, and a later date is scheduled.
 * @throws {TypeError} Invalid draft, date or cutoff; input values are not reported.
 */
export function publicationState({ draft = false, pubDate }, now) {
  if (typeof draft !== 'boolean') throw new TypeError('draft 必须是布尔值。');
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) throw new TypeError('文章状态需要有效的检查时间。');
  if (!(pubDate instanceof Date) && typeof pubDate !== 'string' && typeof pubDate !== 'number') throw new TypeError('pubDate 必须是有效日期。');
  const timestamp = new Date(pubDate).valueOf();
  if (!Number.isFinite(timestamp)) throw new TypeError('pubDate 必须是有效日期。');
  return draft ? 'draft' : timestamp > now.valueOf() ? 'scheduled' : 'publishable';
}
