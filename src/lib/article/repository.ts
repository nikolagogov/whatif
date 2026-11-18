import { getCollection } from 'astro:content';
import {
  ARTICLE_SECTORS,
  getArticleSectorConfig,
  getArticleTopicConfig,
  type ConfiguredArticleSector,
} from './config';
import { sortPosts } from '../sorting';
import {
  type ArticleContentEntity,
  type ArticleEntry,
  type ArticleSector,
  type SectorArticle,
} from '../../types/article';

/**
 * The single access point for article collection data.
 * The promise is cached so Astro collections are read once per build process.
 */
let articlesPromise: Promise<SectorArticle[]> | undefined;
let contentEntitiesPromise: Promise<ArticleContentEntity[]> | undefined;

export function getAllArticles(): Promise<SectorArticle[]> {
  if (!articlesPromise) {
    articlesPromise = Promise.all(
      ARTICLE_SECTORS.map(async (sector) => {
        const entries = await getCollection(sector);
        return entries.map((entry) => ({ ...entry, sector }));
      })
    ).then((collections) => collections.flat() as SectorArticle[]);
  }

  return articlesPromise;
}

/** Build static routes from the same canonical collection access point. */
export async function getArticleStaticPaths() {
  const articles = await getAllArticles();

  return articles.map((post) => ({
    params: { sector: post.sector, id: post.id },
    props: {
      post: post as ArticleEntry,
      sector: post.sector as ArticleSector,
    },
  }));
}


export interface SectorPageData {
  sector: ConfiguredArticleSector;
  config: NonNullable<ReturnType<typeof getArticleSectorConfig>>;
  posts: SectorArticle[];
  latestPosts: SectorArticle[];
  archivePosts: SectorArticle[];
  visibleExploreTopics: NonNullable<ReturnType<typeof getArticleSectorConfig>>['topics'][number][];
}

export interface TopicPageData {
  sector: ConfiguredArticleSector;
  topic: string;
  sectorConfig: NonNullable<ReturnType<typeof getArticleSectorConfig>>;
  topicConfig: NonNullable<ReturnType<typeof getArticleTopicConfig>>;
  posts: SectorArticle[];
}

/**
 * Build the complete data model used by a Sector Page.
 * Keeps filtering, sorting and Latest/Archive partitioning out of the page template.
 */
export async function getSectorPageData(
  sector: ConfiguredArticleSector
): Promise<SectorPageData> {
  const config = getArticleSectorConfig(sector);
  if (!config) {
    throw new Error(`Unknown article sector: ${sector}`);
  }

  const allArticles = await getAllArticles();
  const sectorPosts = allArticles.filter((article) => article.sector === sector);
  const posts = sortPosts(sectorPosts);

  const visibleExploreTopics = config.topics.filter((topic) =>
    sectorPosts.some((article) =>
      (article.data.topics ?? []).some((value) => value.toLowerCase() === topic.slug)
    )
  );

  const latestPosts = posts.slice(0, 3);
  const latestIds = new Set(latestPosts.map((post) => post.id));
  const archivePosts = posts.filter((post) => !latestIds.has(post.id));

  return { sector, config, posts, latestPosts, archivePosts, visibleExploreTopics };
}

/**
 * Generate Topic routes from the canonical article repository and topic config.
 * A Topic is public only when at least one published article references its exact slug.
 */
export async function getTopicStaticPaths() {
  const articles = await getAllArticles();
  const paths: { params: { sector: string; topic: string } }[] = [];

  for (const sector of ARTICLE_SECTORS) {
    const config = getArticleSectorConfig(sector);
    if (!config) continue;

    const sectorArticles = articles.filter((article) => article.sector === sector);
    const articleSlugs = new Set(sectorArticles.map((article) => article.id));

    for (const topic of config.topics) {
      const hasArticles = sectorArticles.some((article) =>
        (article.data.topics ?? []).some((value) => value.toLowerCase() === topic.slug)
      );

      if (hasArticles && articleSlugs.has(topic.slug)) {
        throw new Error(
          `Route conflict: /${sector}/${topic.slug} is both an Article and a Topic route.`
        );
      }

      if (hasArticles) paths.push({ params: { sector, topic: topic.slug } });
    }
  }

  return paths;
}

/** Build the complete data model used by a Topic Page. */
export async function getTopicPageData(
  sector: string,
  topic: string
): Promise<TopicPageData> {
  const sectorConfig = getArticleSectorConfig(sector);
  const topicConfig = getArticleTopicConfig(sector, topic);

  if (!sectorConfig || !topicConfig) {
    throw new Error(`Topic "${topic}" not found in sector "${sector}"`);
  }

  const articles = await getAllArticles();
  const posts = sortPosts(
    articles.filter((article) =>
      article.sector === sector &&
      (article.data.topics ?? []).some((value) => value.toLowerCase() === topic)
    )
  );

  return {
    sector: sector as ConfiguredArticleSector,
    topic,
    sectorConfig,
    topicConfig,
    posts,
  };
}



/** Load Content Entities once; their IDs are globally unique and stable. */
function getAllContentEntities(): Promise<ArticleContentEntity[]> {
  if (!contentEntitiesPromise) {
    contentEntitiesPromise = getCollection('contentEntities');
  }
  return contentEntitiesPromise;
}

/**
 * Resolve an article's ordered composition.
 * The article's reference array owns sequence; an Entity never stores its
 * position, so the same Entity can be rearranged in a future composition.
 */
export async function getArticleContentEntities(
  article: SectorArticle
): Promise<ArticleContentEntity[]> {
  const [articles, entities] = await Promise.all([
    getAllArticles(),
    getAllContentEntities(),
  ]);

  const articleIds = new Set<string>();
  for (const entry of articles) {
    const id = entry.data.id;
    if (articleIds.has(id)) {
      throw new Error(`Duplicate Article ID: ${id}`);
    }
    articleIds.add(id);
  }

  const entityById = new Map<string, ArticleContentEntity>();
  for (const entity of entities) {
    const id = entity.data.id;
    if (entityById.has(id)) {
      throw new Error(`Duplicate Content Entity ID: ${id}`);
    }
    entityById.set(id, entity);
  }

  const references = article.data.contentEntities;
  if (new Set(references).size !== references.length) {
    throw new Error(`Article ${article.data.id} contains duplicate Content Entity references.`);
  }

  return references.map((id) => {
    const entity = entityById.get(id);
    if (!entity) {
      throw new Error(`Article ${article.data.id} references missing Content Entity ${id}.`);
    }
    if (!id.startsWith(entity.data.originArticleId)) {
      throw new Error(`Content Entity ${id} does not match its origin Article ID.`);
    }
    return entity;
  });
}

export async function getArticleById(
  sector: ArticleSector,
  id: string
): Promise<SectorArticle | undefined> {
  const articles = await getAllArticles();
  return articles.find((article) => article.sector === sector && article.id === id);
}
