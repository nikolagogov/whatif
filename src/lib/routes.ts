/**
 * Canonical internal route registry.
 * Keep all application URL construction here so pages and components never
 * invent their own paths for the same content type.
 */
export const ROUTES = {
  home: '/',
  content: '/content/',
  explore: '/explore/',
  timeline: '/timeline/',
  worldGraph: '/world-graph/',
  causality: '/causality/',
  compare: '/compare/',
  latest: '/latest/',
  continueReading: '/continue/',
  bookmarks: '/bookmarks/',
  search: '/search/',
  about: '/about/',
  privacy: '/privacy/',
  history: '/history/',
  science: '/science/',
  space: '/space/',
  society: '/society/',
} as const;

const segment = (value: string) => encodeURIComponent(value.trim());

export function articleRoute(sector: string, articleId: string): string {
  return `/${segment(sector)}/${segment(articleId)}/`;
}

export function sectorRoute(sector: string): string {
  return `/${segment(sector)}/`;
}

export function worldRoute(worldId: string): string {
  return `/world/${segment(worldId)}/`;
}

export function articleHeadingRoute(
  sector: string,
  articleId: string,
  headingId?: string
): string {
  const url = articleRoute(sector, articleId);
  return headingId ? `${url}#${encodeURIComponent(headingId)}` : url;
}
