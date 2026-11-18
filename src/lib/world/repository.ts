import { getAllArticles } from '../article/repository';
import { getTimelineEventsByWorld } from '../timeline/repository';
import type { SectorArticle } from '../../types/article';
import { getWorldStates, type WorldState } from '../world-states';
import { articleRoute } from '../routes';

type ArticleWorld = NonNullable<SectorArticle['data']['world']>;
type ArticleTimelineRecord = NonNullable<SectorArticle['data']['timeline']>[number];

export interface WorldTimelineItem extends ArticleTimelineRecord {
  articleUrl: string;
  articleTitle: string;
}

export interface WorldPageData {
  world: ArticleWorld;
  relatedArticles: SectorArticle[];
  uniqueArticles: SectorArticle[];
  timeline: WorldTimelineItem[];
}

/** Return only World States belonging to the selected World and Divergence. */
export function getWorldStatesByWorldAndDivergence(
  worldId: string,
  divergenceId: string
): WorldState[] {
  return getWorldStates()
    .filter((state) => state.worldId === worldId && state.divergenceId === divergenceId)
    .sort((a, b) => a.time.year - b.time.year);
}

/** Build one static World route for each distinct world referenced by an article. */
export async function getWorldStaticPaths() {
  const articles = await getAllArticles();
  const byWorld = new Map<string, SectorArticle>();

  for (const article of articles) {
    const worldId = article.data.world?.id;
    if (worldId && !byWorld.has(worldId)) byWorld.set(worldId, article);
  }

  return [...byWorld.entries()].map(([id, post]) => ({ params: { id }, props: { post } }));
}

/** Prepare World Page data using the shared Article and Timeline repositories. */
export async function getWorldPageData(
  representativeArticle: SectorArticle
): Promise<WorldPageData> {
  const world = representativeArticle.data.world;
  if (!world?.id) {
    throw new Error(`Cannot build World Page data: article ${representativeArticle.id} has no World ID.`);
  }

  const [allArticles, timelineEvents] = await Promise.all([
    getAllArticles(),
    getTimelineEventsByWorld(world.id),
  ]);

  const relatedArticles = allArticles
    .filter((article) => article.data.world?.id === world.id)
    .sort((a, b) => a.data.title.localeCompare(b.data.title));

  const timeline: WorldTimelineItem[] = timelineEvents.map((event) => ({
    id: event.id,
    headingId: event.headingId,
    date: event.date,
    title: event.title,
    description: event.description,
    articleUrl: event.articleUrl,
    articleTitle: event.articleTitle,
  }));

  const uniqueArticles = [...new Map(
    relatedArticles.map((article) => [articleRoute(article.sector, article.id), article])
  ).values()];

  return { world, relatedArticles, uniqueArticles, timeline };
}
