import { articleRoute } from '../../lib/routes';
import { ARTICLE_SECTORS } from '../../lib/article/config';
import type { ArticleSector, StoredBookmark } from '../../types/article';

const BOOKMARK_KEY = 'hig_bookmarks';

export function initArticleBookmarks(): void {
  const saveButton = document.getElementById('saveBtn') as HTMLButtonElement | null;
  if (!saveButton) return;

  const articleId = saveButton.getAttribute('data-article-id');
  const articleSector = saveButton.getAttribute('data-article-sector');
  if (!articleId || !ARTICLE_SECTORS.includes(articleSector as ArticleSector)) return;
  const sector = articleSector as ArticleSector;

  const isSameArticle = (item: StoredBookmark): boolean => typeof item === 'string'
    ? item === articleId
    : item.id === articleId && item.sector === sector;

  const getBookmarks = (): StoredBookmark[] => {
    try {
      const parsed = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((item): item is StoredBookmark =>
            typeof item === 'string' || (
              typeof item === 'object' && item !== null &&
              'id' in item && 'sector' in item &&
              typeof item.id === 'string' &&
              ARTICLE_SECTORS.includes(item.sector as ArticleSector)
            )
          )
        : [];
    } catch { return []; }
  };

  const updateButton = (): void => {
    const isSaved = getBookmarks().some(isSameArticle);
    const icon = saveButton.querySelector('.save-icon');
    const text = saveButton.querySelector('.save-text');
    if (icon) icon.textContent = isSaved ? '★' : '☆';
    if (text) text.textContent = isSaved ? 'Saved' : 'Save';
    saveButton.classList.toggle('is-saved', isSaved);
  };

  saveButton.addEventListener('click', () => {
    const bookmarks = getBookmarks();
    const index = bookmarks.findIndex(isSameArticle);
    if (index >= 0) bookmarks.splice(index, 1);
    else bookmarks.unshift({
      id: articleId,
      url: articleRoute(articleSector, articleId),
      sector,
      title: document.querySelector('h1')?.textContent?.trim() || articleId,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || '',
      ts: Date.now(),
    });
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
    updateButton();
  });
  updateButton();
}
