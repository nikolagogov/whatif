import { getAllArticles } from '../article/repository';
import type { SectorArticle } from '../../types/article';
import { normalizeTime, timeLabel, timelineSortValue, type NormalizedTimelineTime } from './time.mjs';
import { articleRoute, worldRoute } from '../routes';

type ArticleTimelineRecord = NonNullable<SectorArticle['data']['timeline']>[number];
type ArticleWorld = NonNullable<SectorArticle['data']['world']>;

export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: NormalizedTimelineTime | null;
  precision: string;
  headingId?: string;
  articleId: string;
  articleGraphId: string;
  articleTitle: string;
  articleUrl: string;
  world?: ArticleWorld;
  worldUrl?: string;
  divergenceId?: string;
  sortValue: number;
  sourceOrder: number;
}

let timelineEventsPromise: Promise<TimelineEvent[]> | undefined;

/**
 * Build the canonical runtime Timeline model from article frontmatter.
 * Content Graph remains a derived graph representation, not a second editorial source.
 */
export function getAllTimelineEvents(): Promise<TimelineEvent[]> {
  if (!timelineEventsPromise) {
    timelineEventsPromise = getAllArticles().then((articles) => {
      const events: TimelineEvent[] = [];
      const seenIds = new Set<string>();

      for (const article of articles) {
        const records = (article.data.timeline ?? []) as ArticleTimelineRecord[];
        records.forEach((record, sourceOrder) => {
          const id = record.id?.trim();
          if (!id) {
            throw new Error(`Timeline event in article ${article.data.id} (${article.id}) is missing an ID.`);
          }
          if (seenIds.has(id)) {
            throw new Error(`Duplicate Timeline event ID: ${id}`);
          }
          seenIds.add(id);

          const time = normalizeTime(record.date);
          const world = article.data.world;
          events.push({
            id,
            title: record.title,
            description: record.description,
            date: record.date,
            time,
            precision: time?.precision ?? 'unknown',
            headingId: record.headingId,
            articleId: article.data.id,
            articleGraphId: `article:${article.sector}/${article.id}`,
            articleTitle: article.data.title,
            articleUrl: articleRoute(article.sector, article.id),
            world,
            worldUrl: world?.id ? worldRoute(world.id) : undefined,
            divergenceId: article.data.divergence?.id,
            sortValue: timelineSortValue(time),
            sourceOrder,
          });
        });
      }

      return events;
    });
  }
  return timelineEventsPromise;
}

export async function getTimelineEventsByArticle(
  sector: string,
  articleSlug: string
): Promise<TimelineEvent[]> {
  const events = await getAllTimelineEvents();
  return events.filter((event) => event.articleUrl === articleRoute(sector, articleSlug));
}

export async function getTimelineEventsByWorld(worldId: string): Promise<TimelineEvent[]> {
  const events = await getAllTimelineEvents();
  return events
    .filter((event) => event.world?.id === worldId)
    .sort(sortTimelineEvents);
}

export async function getTimelineEventsByDivergence(divergenceId: string): Promise<TimelineEvent[]> {
  const events = await getAllTimelineEvents();
  return events
    .filter((event) => event.divergenceId === divergenceId)
    .sort(sortTimelineEvents);
}

export async function getTimelineEventById(id: string): Promise<TimelineEvent | undefined> {
  const events = await getAllTimelineEvents();
  return events.find((event) => event.id === id);
}

/** Chronological ordering; unknown dates remain after dated events and stable by source order. */
export function sortTimelineEvents<T extends Pick<TimelineEvent, 'sortValue' | 'sourceOrder' | 'title'>>(
  a: T,
  b: T
): number {
  return a.sortValue - b.sortValue || a.sourceOrder - b.sourceOrder || a.title.localeCompare(b.title);
}

export { timeLabel, timelineSortValue };
