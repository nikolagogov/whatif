export function initReadingProgress(): void {
  const bar = document.getElementById('readingProgress') as HTMLElement | null;
  if (!bar) return;

  const update = (): void => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0
      ? Math.max(0, Math.min(100, (window.scrollY / maxScroll) * 100))
      : 0;

    // Keep one consistent gold color; only the filled length changes.
    bar.style.width = `${progress}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(progress)));
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
