
import contentGraph from '../data/content-graph.json';

export type RelatedPost = {
  id: string;
  sector: 'history' | 'science' | 'space' | 'society';
  data: {
    title?: string;
    description?: string;
    image?: string;
    tags?: string[];
    topics?: string[];
    world?: { id?: string; name?: string };
    [key: string]: unknown;
  };
};

type GraphNode = {
  id: string;
  kind: string;
};

type GraphEdge = {
  id?: string;
  type: string;
  from: string;
  to: string;
  article?: string;
};

const graph = contentGraph as {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const STOP_WORDS = new Set([
  'what', 'will', 'would', 'have', 'been', 'were', 'this', 'that',
  'with', 'from', 'into', 'they', 'their', 'there', 'than', 'then',
  'history', 'world', 'scenario', 'alternate', 'after', 'before',
  'when', 'while', 'where', 'which', 'about', 'also', 'more', 'most',
  'could', 'should', 'might', 'many', 'much', 'some', 'such',
  'them', 'these', 'those', 'what-if',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length > 3 && !STOP_WORDS.has(word));
}

function articleNodeId(post: RelatedPost): string {
  return `article:${post.sector}/${post.id}`;
}

function postKey(post: RelatedPost): string {
  return `${post.sector}/${post.id}`;
}

function tagScore(sharedTags: number): number {
  if (sharedTags === 0) return 0;
  if (sharedTags === 1) return 8;
  if (sharedTags === 2) return 25;
  return sharedTags * 15;
}

// Индекси на Content Graph — изграждат се веднъж.
const graphNodes = new Map(
  graph.nodes.map(node => [node.id, node])
);

const graphNodesByArticle = new Map<string, Set<string>>();
const relationshipKeysByArticle = new Map<string, Set<string>>();
const explicitIdsByArticle = new Map<string, Set<string>>();

for (const edge of graph.edges) {
  if (edge.type === 'RELATED_ARTICLE') {
    const target = graphNodes.get(edge.to);

    if (target?.kind === 'article') {
      let targets = explicitIdsByArticle.get(edge.from);

      if (!targets) {
        targets = new Set<string>();
        explicitIdsByArticle.set(edge.from, targets);
      }

      targets.add(target.id);
    }
  }

  const articleId = edge.article;
  if (typeof articleId !== 'string') continue;

  let articleNodes = graphNodesByArticle.get(articleId);

  if (!articleNodes) {
    articleNodes = new Set<string>();
    graphNodesByArticle.set(articleId, articleNodes);
  }

  let relationships = relationshipKeysByArticle.get(articleId);

  if (!relationships) {
    relationships = new Set<string>();
    relationshipKeysByArticle.set(articleId, relationships);
  }

  for (const nodeId of [edge.from, edge.to]) {
    if (nodeId === articleId) continue;

    const node = graphNodes.get(nodeId);

    if (node && node.kind !== 'article') {
      articleNodes.add(nodeId);
    }
  }

  if (edge.id?.startsWith('relationship:')) {
    relationships.add(`${edge.type}:${edge.from}->${edge.to}`);
  }
}

// Кеширани данни за всяка статия.
type PostIndex = {
  key: string;
  nodeId: string;
  sector: string;
  worldId?: string;
  tags: Set<string>;
  topics: Set<string>;
  words: Set<string>;
  graphNodes: Set<string>;
  relationships: Set<string>;
};

const postIndexes = new WeakMap<object, PostIndex>();

function getPostIndex(post: RelatedPost): PostIndex {
  const cached = postIndexes.get(post);
  if (cached) return cached;

  const index: PostIndex = {
    key: postKey(post),
    nodeId: articleNodeId(post),
    sector: post.sector,
    worldId: post.data.world?.id,
    tags: new Set(post.data.tags ?? []),
    topics: new Set(post.data.topics ?? []),
    words: new Set(
      tokenize(`${post.data.title ?? ''} ${post.data.description ?? ''}`)
    ),
    graphNodes: graphNodesByArticle.get(articleNodeId(post)) ?? new Set(),
    relationships:
      relationshipKeysByArticle.get(articleNodeId(post)) ?? new Set(),
  };

  postIndexes.set(post, index);
  return index;
}

export function getRelatedArticles(
  post: RelatedPost,
  allPosts: RelatedPost[]
): RelatedPost[] {
  const current = getPostIndex(post);

  // Изключваме текущата статия и статиите от същия свят.
  const candidates = allPosts
    .filter(candidate => {
      const index = getPostIndex(candidate);

      return (
        index.key !== current.key &&
        !(current.worldId && index.worldId === current.worldId)
      );
    })
    .map(candidate => ({
      post: candidate,
      index: getPostIndex(candidate),
    }));

  const explicitIds =
    explicitIdsByArticle.get(current.nodeId) ?? new Set<string>();

  const explicitRelated = candidates
    .filter(item => explicitIds.has(item.index.nodeId))
    .map(item => item.post);

  const graphRelated = candidates
    .map(item => {
      let score = 0;

      for (const nodeId of current.graphNodes) {
        if (!item.index.graphNodes.has(nodeId)) continue;

        const kind = graphNodes.get(nodeId)?.kind;

        if (kind === 'entity') score += 12;
        else if (kind === 'world') score += 20;
        else if (kind === 'timeline-event') score += 3;
        else score += 5;
      }

      for (const key of current.relationships) {
        if (item.index.relationships.has(key)) score += 25;
      }

      if (item.index.sector === current.sector) score += 2;

      return { post: item.post, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.post);

  const metadataRelated = candidates
    .map(item => {
      let sharedTags = 0;
      let sharedTopics = 0;

      for (const tag of item.index.tags) {
        if (current.tags.has(tag)) sharedTags++;
      }

      for (const topic of item.index.topics) {
        if (current.topics.has(topic)) sharedTopics++;
      }

      return {
        post: item.post,
        score:
          sharedTopics * 20 +
          tagScore(sharedTags) +
          (item.index.sector === current.sector ? 2 : 0),
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.post);

  const legacyRelated = candidates
    .map(item => {
      let sharedWords = 0;
      let sharedTags = 0;
      let sharedTopics = 0;

      for (const word of current.words) {
        if (item.index.words.has(word)) sharedWords++;
      }

      for (const tag of item.index.tags) {
        if (current.tags.has(tag)) sharedTags++;
      }

      for (const topic of item.index.topics) {
        if (current.topics.has(topic)) sharedTopics++;
      }

      return {
        post: item.post,
        score:
          sharedTopics * 20 +
          tagScore(sharedTags) +
          sharedWords +
          (item.index.sector === current.sector ? 2 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.post);

  const result: RelatedPost[] = [];
  const added = new Set<string>();

  const addRelated = (items: RelatedPost[]) => {
    for (const candidate of items) {
      if (result.length >= 3) break;

      const key = postKey(candidate);

      if (!added.has(key)) {
        added.add(key);
        result.push(candidate);
      }
    }
  };

  addRelated(explicitRelated);
  addRelated(graphRelated);
  addRelated(metadataRelated);

  if (result.length < 3) {
    addRelated(legacyRelated);
  }

  return result;
}