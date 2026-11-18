# Article data architecture

## Canonical sources

- Article metadata and composition: `src/content/<sector>/*.md` (Astro content collections).
- Reusable narrative Content Entities: `src/content-entities/<article-id>/<entity-id>.md` (dedicated Astro content collection).
- World State records: `src/data/world-states/*.yaml`.
- Relationship/related-article graph: generated `src/data/content-graph.json`.

Do not duplicate these records in component props, helper arrays, or a second frontmatter field.

## Access and preparation

- `repository.ts` is the single access point for Astro article collections. It caches the collection read for the build process and supplies static paths.
- `page-data.ts` is the page-data composition root. It receives the current article and repository article list, then creates the complete `ArticlePageData` object once.
- `timeline.ts`, `world-state.ts`, `navigation.ts`, `related.ts`, and `reading-time.ts` are focused projections/calculations. They receive article data from the composition root and return derived values; components must not query collections or independently calculate relationships.
- `world-states.ts` remains the canonical YAML reader shared with World pages, Compare, and other platform features. `world-state.ts` only projects those records for the article view.
- Related article ranking continues to use the generated Content Graph and existing ranking logic in `related-articles.ts`; the article page invokes it through `related.ts`.

## Data flow

`Article metadata + ordered Content Entity references + Content Entity collection + canonical World State YAML + generated Content Graph`
→ `repository.ts`
→ `page-data.ts` and focused projections
→ `ArticlePageData`
→ article components.

World State data is canonically stored in YAML because it is also consumed by World pages, Compare, and other platform features. The unused `worldStates` frontmatter field was removed from the article schema to avoid creating a second, conflicting source.


## Article and Content Entity identity

- Every Article has a stable 9-digit numeric `data.id`. Its existing Astro collection slug remains the public route ID, so URLs and internal article links do not change.
- Every narrative part is a separate Markdown Content Entity with its own stable numeric `data.id` and an `originArticleId` provenance reference.
- Entity IDs are formed from the 9-digit originating Article ID followed by the entity's creation sequence. Example: Article `000000001` may own `0000000011`, `0000000012`, `0000000013`, etc.
- The Article's `contentEntities` array is the ordered composition. Its array order determines the current narrative sequence.
- Position is deliberately not stored on a Content Entity. Reordering or reusing an Entity in a future composition therefore does not require changing its identity.
- New parts are appended with a new unused ID. The current model intentionally does not introduce a more complex ordering or assembly system.
- The repository validates Article ID uniqueness, Content Entity ID uniqueness, duplicate references, missing references, and origin-ID mismatches when resolving an Article composition.
