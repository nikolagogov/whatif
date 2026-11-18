# HAD IT GONE — Explore Revision 3

## Changed files
- `src/pages/explore.astro` — World Cards now use full-bleed imagery with an overlaid title/description and a single clickable card link. The Timeline promotion is now one fully clickable link to the existing `/timeline/` route, using a text-free conceptual image and live HTML copy.
- `src/layouts/BaseLayout.astro` — the shared header is visible at the top, hides while scrolling down, and reappears while scrolling up. It remains visible while search/navigation is open or the header has keyboard focus.
- `src/styles/components/site-chrome-runtime.css` — sticky positioning and smooth hide/reveal behavior for the shared transparent header; reduced-motion preference is respected.
- `src/styles/components/cards-shared.css` — removes the World Card from the article-card structural rule so the full-image World Card layout can use the same shared design tokens without inheriting the old split-card structure. Article cards are unchanged.
- `public/images/timeline-concept.webp` — new text-free conceptual Timeline artwork (2172×724).

## Preservation
No content graph nodes or edges, world IDs, world descriptions, article content, timeline events, world routes, or existing Timeline functionality were deleted or modified. All World Cards still link to their existing `/world/[id]/` pages. The Timeline card links to the existing `/timeline/` page.

## Validation
- Confirmed the 12 existing World Card image mappings and image files from Revision 2 remain in place.
- Confirmed Timeline banner is a single anchor with no nested button/link.
- Confirmed header scroll behavior is global through `BaseLayout`.
- Full Astro build and QA were not run because dependencies are not installed in this working environment. Run `npm run build` and `npm run qa` locally after applying.
