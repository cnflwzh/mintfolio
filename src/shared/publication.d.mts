/** Build eligibility only; no state implies that an article has been deployed. */
export type PublicationState = 'draft' | 'scheduled' | 'publishable';

/** Minimal publication fields accepted from CLI YAML or a validated Core entry. */
export interface PublicationInput {
  /** Missing means false; true always remains a draft regardless of its date. */
  draft?: boolean;
  /** Date coercion follows the collection schema; date-only strings use UTC midnight. */
  pubDate: Date | string | number;
}

/**
 * Classify article eligibility at an explicit cutoff, without mutation or clock reads.
 * @param article Publication metadata; no body, password or deployment state is read.
 * @param now One valid Date captured by the calling operation.
 * @returns Draft, scheduled, or publishable. Equality with now is publishable.
 * @throws TypeError for invalid draft/date/cutoff, without including input values.
 */
export function publicationState(article: PublicationInput, now: Date): PublicationState;
