export function initArticleShare(): void {
  const trigger = document.getElementById('shareTrigger');
  const modal = document.getElementById('shareModal');
  const close = document.getElementById('shareModalClose');
  const backdrop = document.getElementById('shareModalBackdrop');
  const copyOption = document.getElementById('shareCopyOption');

  const open = (): void => {
    if (!modal) return;
    if (modal.parentElement !== document.body) document.body.append(modal);
    (modal as HTMLElement).style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
  const dismiss = (): void => {
    if (!modal) return;
    (modal as HTMLElement).style.display = 'none';
    document.body.style.overflow = '';
  };

  trigger?.addEventListener('click', open);
  close?.addEventListener('click', dismiss);
  backdrop?.addEventListener('click', dismiss);
  copyOption?.addEventListener('click', () => {
    const url = copyOption.getAttribute('data-url');
    if (!url || !navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(() => {
      const label = copyOption.querySelector('.share-option-label');
      if (!label) return;
      const original = label.textContent;
      label.textContent = 'Copied';
      window.setTimeout(() => { label.textContent = original; }, 1500);
    });
  });
}
