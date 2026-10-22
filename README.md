# HAD IT GONE

**HAD IT GONE** is an alternate history and speculative science portal exploring how the world might have developed if key events, discoveries, decisions, or natural conditions had been different.

The project combines editorial articles with structured data describing alternate worlds, divergence points, timelines, entities, world states, and relationships between scenarios.

## Core Features

- **Four content sectors:** History, Science, Space, and Society.
- **Scenario articles:** Structured explorations of alternative outcomes.
- **Divergence points:** The events or conditions that separate an alternate scenario from our world.
- **Timelines:** Key events in the development of a scenario.
- **World states:** Structured snapshots of alternate worlds and their variables.
- **World comparisons:** Comparisons between stored world states.
- **Related scenarios:** Links to related articles and alternative paths.
- **Content Graph:** A structured graph of articles, entities, worlds, events, and relationships.
- **Bookmarks and Continue Reading:** Browser-based saving and reading progress.
- **Search, RSS, sitemap, and SEO metadata.**

## Technology

- [Astro](https://astro.build/) — static site generation.
- TypeScript and Astro components.
- Markdown content collections.
- YAML world-state data.
- Node.js scripts for content graph generation and validation.
- `@astrojs/sitemap` and `@astrojs/rss`.

## Project Structure

```text
/
├── public/                 # Static assets and public files
├── scripts/                # Build, validation, and QA scripts
├── src/
│   ├── content/            # Articles organized by sector
│   ├── data/               # Content Graph and structured data
│   ├── layouts/            # Shared page layouts
│   ├── lib/                # Sorting, relationships, world states, comparisons
│   ├── pages/              # Astro routes
│   └── styles/             # Site styles
├── astro.config.mjs
├── package.json
└── README.md
```

The exact contents of individual directories may evolve as the project develops.

## Requirements

- Node.js **22.12.0 or newer**
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Astro will print the local development URL in the terminal, typically `http://localhost:4321`.

## Build and Preview

Build the static site:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The generated static site is written to `dist/`.

## Quality Assurance

Run the content and image checks:

```bash
npm run qa
```

Validate world-state data:

```bash
npm run world:validate
```

Validate causal relationships:

```bash
npm run causality:validate
```

Validate transitions between world states:

```bash
npm run world:transitions:validate
```

Check internal links in the generated site:

```bash
npm run links:check
```

Generate the Content Graph:

```bash
npm run graph:build
```

Inspect migration-related findings without changing project files:

```bash
npm run migration:inventory
```

All commands should be run from the project root. Validation scripts report their findings in the terminal.

## Content Model

Articles are stored in Markdown files within `src/content/`, organized by sector.

Structured metadata connects articles to concepts such as:

- Worlds
- Divergence points
- Timeline events
- Entities
- World states
- Relationships and consequences

World-state data is maintained separately from article prose, allowing the project to represent scenario development in a structured form.

## Current Development Status

HAD IT GONE has a working Astro site, structured article content, a generated Content Graph, world-state data, validation scripts, and static-site build tooling.

The Concept Engine and advanced World Graph work remain separate development workstreams and are not prerequisites for launching the core portal.

## Project Direction

The long-term goal is to develop HAD IT GONE beyond a conventional article collection into a structured platform for exploring alternate worlds, their timelines, relationships, and consequences.

---

HAD IT GONE — Explore the worlds that almost were.