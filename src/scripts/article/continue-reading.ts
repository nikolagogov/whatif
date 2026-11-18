import { articleRoute } from '../../lib/routes';
import { ARTICLE_SECTORS } from '../../lib/article/config';
import type { ArticleSector, ContinueReadingRecord } from '../../types/article';

const CONTINUE_KEY = 'hig_continue';

export function initContinueReading(): void {
  const saveButton = document.getElementById('saveBtn');
  const articleId = saveButton?.getAttribute('data-article-id');
  const articleSector = saveButton?.getAttribute('data-article-sector');
  if (!articleId || !ARTICLE_SECTORS.includes(articleSector as ArticleSector)) return;
  const sector = articleSector as ArticleSector;

  const saveProgress = (): void => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const scrollY = Math.max(0, window.scrollY);
    const progress = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round(scrollY / maxScroll * 100))) : 0;
    try {
      const parsed = JSON.parse(localStorage.getItem(CONTINUE_KEY) || '[]');
      const list: ContinueReadingRecord[] = Array.isArray(parsed)
        ? parsed.filter((item): item is ContinueReadingRecord =>
            typeof item === 'object' && item !== null &&
            typeof item.id === 'string' &&
            ARTICLE_SECTORS.includes(item.sector as ArticleSector) &&
            typeof item.scrollY === 'number'
          )
        : [];
      const remaining = list.filter((item) => !(item.id === articleId && item.sector === sector));
      if (scrollY > 0 && progress < 90) {
        remaining.unshift({
          id: articleId,
          url: articleRoute(articleSector, articleId),
          sector,
          title: document.querySelector('h1')?.textContent?.trim() || articleId,
          progress,
          scrollY,
          ts: Date.now(),
        });
      }
      localStorage.setItem(CONTINUE_KEY, JSON.stringify(remaining.slice(0, 50)));
    } catch (error) {
      console.warn('Could not save reading progress.', error);
    }
  };

  let pending = false;
  window.addEventListener('scroll', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { saveProgress(); pending = false; });
  }, { passive: true });
  window.addEventListener('pagehide', saveProgress);
}
