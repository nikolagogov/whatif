import type { CollectionEntry } from 'astro:content';

import type { ConfiguredArticleSector } from '../lib/article/config';

/** Canonical list of article collections supported by HAD IT GONE. */
export type ArticleSector = ConfiguredArticleSector;
export type ArticleEntry = CollectionEntry<ArticleSector>;
export type ArticleData = CollectionEntry<'history'>['data'];
export type ArticleContentEntity = CollectionEntry<'contentEntities'>;
export type SectorArticle = ArticleEntry & { sector: ArticleSector };

/** A timeline record after its optional narrative heading has been resolved. */
export type ArticleTimelineItem = ArticleData['timeline'][number] & {
  targetHeading: string | null;
};

export type ArticleEntity = ArticleData['entities'][number];

export interface WorldStateDisplayItem {
  label: string;
  value: string;
}

export interface WorldStateDisplay {
  date: string;
  label: string;
  items: WorldStateDisplayItem[];
}

export interface ArticleRelatedData {
  id: string;
  sector: ArticleSector;
  data: Pick<ArticleData, 'title' | 'description' | 'image' | 'tags' | 'topics' | 'world'>;
}

export interface ArticlePageData {
  article: ArticleEntry;
  sector: ArticleSector;
  pageUrl: string;
  readingTime: number;
  sectorTitle: string;
  worldLabel: string;
  timelineItems: ArticleTimelineItem[];
  entities: ArticleEntity[];
  worldStates: WorldStateDisplay[];
  alternativePaths: SectorArticle[];
  relatedArticles: ArticleRelatedData[];
}

/** Props contracts for reusable article presentation components. */
export interface ArticleHeroProps {
  sector: ArticleSector;
  sectorTitle: string;
  world?: ArticleData['world'];
  image: string;
  divergence?: ArticleData['divergence'];
  readingTime: number;
  articleId: string;
}

export interface ArticleExplorationProps {
  alternativePaths: SectorArticle[];
  relatedArticles: ArticleRelatedData[];
  worldName?: string;
  title: string;
  pageUrl: string;
  sector: ArticleSector;
  sectorTitle: string;
}

/** Props contracts for the remaining article section components. */
export interface ArticleIntroProps {
  divergence?: ArticleData['divergence'];
}

export interface ArticleTimelineProps {
  items: ArticleTimelineItem[];
}

export interface ArticleWorldStateProps {
  states: WorldStateDisplay[];
}

export interface ArticleEntitiesProps {
  entities: ArticleEntity[];
}
export interface ArticleAlternativePathsProps {
  items: SectorArticle[];
  worldName?: string;
}

export interface ArticleRelatedProps {
  items: ArticleRelatedData[];
}

export interface ArticleShareProps {
  title: string;
  pageUrl: string;
}

/** Persisted browser records. Legacy string bookmarks remain supported. */
export interface ArticleBookmarkRecord {
  id: string;
  url: string;
  sector: ArticleSector;
  title: string;
  description: string;
  ts: number;
}

export type StoredBookmark = string | Pick<ArticleBookmarkRecord, 'id' | 'sector'>;

export interface ContinueReadingRecord {
  id: string;
  url: string;
  sector: ArticleSector;
  title: string;
  progress: number;
  scrollY: number;
  ts: number;
}
