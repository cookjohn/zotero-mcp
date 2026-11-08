/**
 * Collapse chunk-level vector hits into per-item best matches.
 *
 * `find_similar` searches with one of the source item's own chunk vectors, so
 * the source item's chunks lead the ranking. Filtering a `topK + 1` result
 * list therefore filtered everything away for any multi-chunk item (#108).
 *
 * Pure on purpose: no Zotero globals, so it stays unit-testable.
 */

export interface ScoredItem {
  itemKey: string;
  score: number;
}

/**
 * @param hits chunk-level search hits, order irrelevant
 * @param excludeItemKey item whose own chunks must be dropped
 * @returns one hit per item (highest score), sorted by score descending
 */
export function bestHitPerItem<T extends ScoredItem>(
  hits: readonly T[],
  excludeItemKey: string,
): T[] {
  const best = new Map<string, T>();
  for (const hit of hits) {
    if (!hit || hit.itemKey === excludeItemKey) {
      continue;
    }
    const current = best.get(hit.itemKey);
    if (!current || hit.score > current.score) {
      best.set(hit.itemKey, hit);
    }
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score);
}
