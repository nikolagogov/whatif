export function initScrollRestoration(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') !== 'continue') return;
  const savedY = Number(params.get('scrollY'));
  if (!Number.isFinite(savedY) || savedY < 0) return;

  const restore = (): void => window.scrollTo({ top: savedY, behavior: 'auto' });
  const scheduleRestore = (): void => requestAnimationFrame(() => requestAnimationFrame(restore));
  if (document.readyState === 'complete') scheduleRestore();
  else window.addEventListener('load', scheduleRestore, { once: true });
}
