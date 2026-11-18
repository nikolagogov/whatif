/** Builds the article contents list and resolves timeline links to narrative headings. */
/** Group the narrative into editorial sections: each H2 and all following content up to the next H2. */
function groupNarrativeSections(articleBody: Element): void {
  if (articleBody.querySelector('.narrative-section')) return;

  const children = Array.from(articleBody.children);
  const firstHeadingIndex = children.findIndex((node) => node.tagName === 'H2');

  if (firstHeadingIndex > 0) {
    const intro = document.createElement('section');
    intro.className = 'narrative-section narrative-intro-section';
    articleBody.insertBefore(intro, children[0]);
    children.slice(0, firstHeadingIndex).forEach((node) => intro.append(node));
  }

  const headings = Array.from(articleBody.children).filter((node) => node.tagName === 'H2');
  headings.forEach((heading) => {
    const section = document.createElement('section');
    section.className = 'narrative-section';
    articleBody.insertBefore(section, heading);

    let current: Element | null = heading;
    while (current && current.tagName !== 'H2' || current === heading) {
      const next: Element | null = current.nextElementSibling;
      section.append(current);
      if (!next || next.tagName === 'H2') break;
      current = next;
    }
  });
}


export function initArticleToc(): void {
  const toc = document.getElementById('toc');
  const tocList = document.getElementById('tocList');
  const articleBody = document.querySelector('.narrative-flow');
  if (!toc || !tocList || !articleBody) return;

  groupNarrativeSections(articleBody);
  const headings = Array.from(articleBody.querySelectorAll('h2'));
  tocList.replaceChildren();
  const intro = toc.closest<HTMLElement>('[data-article-intro]');

  if (headings.length < 2) {
    toc.hidden = true;
  } else {
    toc.hidden = false;
  }

  const comparison = intro?.querySelector<HTMLElement>('.world-compare-section') ?? null;
  const hasContents = headings.length >= 2;
  const hasComparison = Boolean(comparison);

  if (intro) {
    intro.hidden = !hasContents && !hasComparison;
    intro.classList.toggle('has-contents', hasContents);
    intro.classList.toggle('has-comparison', hasComparison);
    intro.classList.toggle('has-two-panels', hasContents && hasComparison);
    intro.classList.toggle('has-one-panel', hasContents !== hasComparison);
  }

  const makeHeadingId = (text: string): string => text.toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/:/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section';

  const usedIds = new Set<string>();
  headings.forEach((heading, index) => {
    const baseId = makeHeadingId(heading.textContent?.trim() ?? '') || `section-${index}`;
    let uniqueId = baseId;
    let suffix = 2;
    while (usedIds.has(uniqueId) || (document.getElementById(uniqueId) && document.getElementById(uniqueId) !== heading)) {
      uniqueId = `${baseId}-${suffix++}`;
    }
    heading.id = uniqueId;
    usedIds.add(uniqueId);
  });

  const scrollToHeading = (heading: HTMLElement): void => {
    const target = heading.closest('.narrative-section') ?? heading;
    const targetTop = target.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
    history.pushState(null, '', `#${heading.id}`);
  };

  document.querySelectorAll<HTMLAnchorElement>('.timeline-event-link').forEach((link) => {
    const targetId = link.getAttribute('data-target-heading');
    if (!targetId) { link.removeAttribute('href'); return; }
    let targetHeading = headings.find((heading) => heading.id === targetId);
    if (!targetHeading) targetHeading = headings.find((heading) => makeHeadingId(heading.textContent?.trim() ?? '') === targetId);
    if (!targetHeading) { link.removeAttribute('href'); return; }
    targetHeading.id = targetId;
    link.href = `#${targetId}`;
    link.addEventListener('click', (event) => { event.preventDefault(); scrollToHeading(targetHeading!); });
  });

  if (!hasContents) return;

  headings.forEach((heading) => {
    const li = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = `#${heading.id}`;
    anchor.textContent = heading.textContent?.trim() ?? '';
    anchor.addEventListener('click', (event) => { event.preventDefault(); scrollToHeading(heading); });
    li.append(anchor);
    tocList.append(li);
  });
}
