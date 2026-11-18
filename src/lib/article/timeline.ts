import type { ArticleData, ArticleTimelineItem } from '../../types/article';

/** Project canonical article timeline records into the component contract. */
export function buildArticleTimeline(
  timeline: ArticleData['timeline'] = []
): ArticleTimelineItem[] {
  return timeline.map((item) => ({
    ...item,
    targetHeading: item.headingId ?? null,
  }));
}
