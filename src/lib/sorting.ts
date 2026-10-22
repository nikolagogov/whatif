
import { execSync } from 'child_process';

const REPO_ROOT = process.cwd();

const firstCommitCache = new Map<string, number>();
const lastCommitCache = new Map<string, number>();
const sortKeyCache = new Map<string, number>();

let gitIndexBuilt = false;

function buildGitTimestampIndex(): void {
  if (gitIndexBuilt) return;
  gitIndexBuilt = true;

  try {
    const output = execSync(
      'git log --reverse --format="COMMIT %ct" --name-only -- src/content',
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    let timestamp = 0;

    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('COMMIT ')) {
        timestamp = Number(line.slice(7)) * 1000;
        continue;
      }

      const path = line.trim().replace(/\\/g, '/');

      if (
        path.startsWith('src/content/') &&
        path.endsWith('.md') &&
        timestamp > 0 &&
        !firstCommitCache.has(path)
      ) {
        firstCommitCache.set(path, timestamp);
      }
    }

    const latestOutput = execSync(
      'git log --format="COMMIT %ct" --name-only -- src/content',
      {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: 20 * 1024 * 1024,
      }
    );

    timestamp = 0;

    for (const line of latestOutput.split(/\r?\n/)) {
      if (line.startsWith('COMMIT ')) {
        timestamp = Number(line.slice(7)) * 1000;
        continue;
      }

      const path = line.trim().replace(/\\/g, '/');

      if (
        path.startsWith('src/content/') &&
        path.endsWith('.md') &&
        timestamp > 0 &&
        !lastCommitCache.has(path)
      ) {
        lastCommitCache.set(path, timestamp);
      }
    }
  } catch (error) {
    console.warn('[sorting] Git timestamp index unavailable:', error);
  }
}

function getRelativePath(collection: string, id: string): string {
  return `src/content/${collection}/${id}.md`;
}

export function getFirstCommitTimestamp(relativePath: string): number {
  buildGitTimestampIndex();
  return firstCommitCache.get(relativePath.replace(/\\/g, '/')) ?? 0;
}

export function getLastCommitTimestamp(relativePath: string): number {
  buildGitTimestampIndex();
  return lastCommitCache.get(relativePath.replace(/\\/g, '/')) ?? 0;
}

export function getGitTimestamp(collection: string, id: string): number {
  buildGitTimestampIndex();
  return firstCommitCache.get(getRelativePath(collection, id)) ?? 0;
}

export type SortablePost = {
  id: string;
  collection: string;
  data: { order?: number };
};

export function getSortKey(post: SortablePost): number {
  const cacheKey = `${post.collection}/${post.id}`;

  if (sortKeyCache.has(cacheKey)) {
    return sortKeyCache.get(cacheKey)!;
  }

  const key = getGitTimestamp(post.collection, post.id);

  sortKeyCache.set(cacheKey, key);
  return key;
}

export function sortPosts<T extends SortablePost>(posts: T[]): T[] {
  const keyedPosts = posts.map((post) => ({
    post,
    key: getSortKey(post),
  }));

  keyedPosts.sort((a, b) => {
    const orderA = a.post.data.order;
    const orderB = b.post.data.order;

    // Explicitly ordered posts come first.
    if (orderA !== undefined && orderB === undefined) return -1;
    if (orderA === undefined && orderB !== undefined) return 1;

    // Explicit editorial order: ascending.
    if (orderA !== undefined && orderB !== undefined) {
      if (orderA !== orderB) return orderA - orderB;
    }

    // Automatic order: newest first.
    if (a.key !== b.key) return b.key - a.key;

    // Deterministic tie-breaker.
    return a.post.id.localeCompare(b.post.id);
  });

  return keyedPosts.map((item) => item.post);
}

export function getPostDate(
  collection: string,
  id: string
): Date | undefined {
  const timestamp = getGitTimestamp(collection, id);
  return timestamp > 0 ? new Date(timestamp) : undefined;
}