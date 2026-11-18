# HAD IT GONE styles architecture

## Single entry point
`index.css` is the only stylesheet imported by `BaseLayout.astro`. It loads, in order:
1. `global.css` — global/base and route-level style modules.
2. `design-system.css` — shared design tokens and reusable visual components/layouts.
3. `components/site-chrome-runtime.css` — global header/footer/layout behavior formerly embedded in `BaseLayout.astro`.

## Design system
- `tokens.css` and `tokens-site.css`: shared design tokens.
- `components/`: reusable visual components (navigation, cards, header/footer, page titles, back links, and search).
- `layouts/`: page geometry and page-type layouts (shell, article, discovery, homepage, world, platform, responsive rules).
- `sections/`: independently styled sections (article intro, utility pages, sector/search polish).

## Global stylesheet modules
`global.css` is an import map. Its imports preserve the exact order of the former monolithic `global.css` to avoid changing the cascade. The modules are grouped by responsibility and retain existing selectors and declarations.

## Page-local styles
Some Astro pages still contain scoped `<style>` blocks. These are intentionally retained for now where their styles are tightly coupled to page-specific markup or interactions. They should be migrated only after giving them a stable component/section owner and preserving their scope. The dynamic article template's three local style blocks have been moved into `layouts/article-layout.css`.

## Migration rules
1. `BaseLayout.astro` imports only `styles/index.css`.
2. Shared design values belong in the token files, not duplicated in component declarations.
3. Reusable visual rules belong in `components/`, `layouts/`, or `sections/`.
4. Search spacing, result kicker, result grid, and search-card appearance are owned exclusively by `components/search.css`.
5. Do not add shared visual rules to `global.css`; use it as the ordered import map.
6. Keep truly page-specific behavior scoped until it can be migrated with an explicit route/component scope.
7. The current migration is intended to preserve the existing visual output; visual refinement is a separate step.


## Article CSS ownership

`layouts/article-layout.css` is the single owner of article-page visual rules, including responsive and theme-specific article rules. Other stylesheets retain only non-article page and shared site-chrome rules.
