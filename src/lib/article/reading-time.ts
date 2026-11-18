/** Estimate reading time from the rendered article's Markdown source. */
export function getArticleReadingTime(body?: string, wordsPerMinute = 200): number {
  const wordCount = (body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount / wordsPerMinute);
}
