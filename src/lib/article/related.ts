import type { ArticleEntry, ArticleSector, SectorArticle } from '../../types/article';
import { getRelatedArticles, type RelatedPost } from '../related-articles';
import { sortPosts } from '../sorting';

export function buildArticleAlternativePaths(
  currentId: string,
  worldId: string | undefined,
  allArticles: SectorArticle[]
): SectorArticle[] {
  if (!worldId) return [];

  return sortPosts(
    allArticles.filter(
      (article) => article.id !== currentId && article.data.world?.id === worldId
    )
  ).slice(0, 3);
}

export function buildArticleRelated(
  post: ArticleEntry,
  sector: ArticleSector,
  allArticles: SectorArticle[]
): RelatedPost[] {
  return getRelatedArticles(
    { ...post, sector } as RelatedPost,
    allArticles as RelatedPost[]
  );
}
