# HAD IT GONE — Explore Revision 2

## Changed
- `src/pages/explore.astro`: removed technical eyebrow and redundant catalog copy; centered the hero description; simplified the section heading to “Choose a world”; softened search focus styling; retained the shared graph-derived world records, search, world routes, and Timeline entry; placed the editorial description inside each fully clickable world card.
- `src/styles/components/cards-shared.css`: added `.world-card` to the existing shared card skin used by Content cards, keeping shared design tokens in one stylesheet.
- `public/images/world-cards/*.webp`: twelve dedicated 1440×810 WebP world-card assets prepared from the corresponding high-resolution story cover artwork. Original story images and the previous 320×320 world-graph assets are untouched.

## Explicit preservation
No world nodes, graph edges, article content, timeline events, identifiers, world pages, or interactive functionality were deleted. The Explore page only changes their presentation. The world catalog remains derived from `content-graph.json`; card copy comes from the related article description; search still indexes world labels, descriptions, divergences, and related article titles.

## Validation
- All 12 world IDs have a dedicated card image mapping.
- All 12 image files are 1440×810 WebP.
- Every world card links to its existing `/world/[id]/` route.
- Timeline entry continues to link to `/timeline/`.
- Full Astro build not run in this environment; run `npm run build` and `npm run qa` locally.
