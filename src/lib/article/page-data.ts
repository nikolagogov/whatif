import { getArticleSectorTitle } from './config';
import type {
  ArticleData,
  ArticleEntry,
  ArticleSector,
  SectorArticle,
  ArticlePageData,
} from '../../types/article';
import { buildArticleAlternativePaths, buildArticleRelated } from './related';
import { getArticleReadingTime } from './reading-time';
import { buildArticleTimeline } from './timeline';
import { buildArticleWorldStates } from './world-state';
import { articleRoute } from '../routes';




/** Compose all derived page data once from the canonical article repository. */
export function buildArticlePageData(
  post: ArticleEntry,
  sector: ArticleSector,
  allPosts: SectorArticle[],
  narrativeBody: string = post.body
): ArticlePageData {
  const data = post.data as ArticleData;
  const { world, divergence, timeline = [], entities = [] } = data;
  return {
    article: post,
    sector,
    pageUrl: articleRoute(sector, post.id),
    readingTime: getArticleReadingTime(narrativeBody),
    sectorTitle: getArticleSectorTitle(sector),
    worldLabel: world?.name || world?.id
      ? (divergence ? 'Alternate World' : 'World')
      : 'Scenario',
    timelineItems: buildArticleTimeline(timeline),
    entities,
    worldStates: buildArticleWorldStates(world?.id),
    alternativePaths: buildArticleAlternativePaths(post.id, world?.id, allPosts),
    relatedArticles: buildArticleRelated(post, sector, allPosts),
  };
}
