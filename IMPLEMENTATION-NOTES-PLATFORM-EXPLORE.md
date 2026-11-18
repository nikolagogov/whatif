# HAD IT GONE — Platform / Explore implementation batch

Source baseline: `hig(4).zip` uploaded on 2026-11-14, with the previously supplied Stage 1 implementation retained.

## Live files changed in this revision

1. `src/pages/platform.astro`
   - Removes the `Back to Homepage` link from Platform without changing the shared `PageHeader` component.
   - Keeps the existing tagline presentation using a local heading.
   - Keeps the Content choice gold.
   - Gives the Explore choice a clearly visible blue/cyan treatment aligned with the blue branch in the HAD IT GONE logo.
   - Changes the Content supporting text to `Stories, articles and possibilities` to avoid the awkward/repetitive use of `histories`.
   - Changes the Explore supporting text to `Discover alternate worlds and trace their turning points`.

## Files retained from Stage 1

- `src/pages/explore.astro`
- `src/layouts/BaseLayout.astro`
- `docs/legacy/explore-interactive-before-platform-explore-redesign.astro`

## Explicitly unchanged

- Content Homepage (`src/pages/index.astro`)
- Timeline implementation and data
- World Page implementation and World States
- Content Graph, article Markdown, IDs, relationships, and graph-generation logic
- Shared `PageHeader` component and all other shared components

## Validation

This is a focused presentation/text revision. A full Astro build and project QA have not been run in this environment. Run the project's normal build and QA on the development machine after applying the archive.
