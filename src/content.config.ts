import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const articleSchema = z.object({
  id: z.string().regex(/^\d{9}$/, 'Article IDs must be 9-digit numeric strings.'),
  contentEntities: z.array(z.string().regex(/^\d{10,}$/)).min(1),
  title: z.string(),
  description: z.string(),
  image: z.string(),
  order: z.number().optional(),
  featured: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  topics: z.array(z.string()).optional().default([]),
  related: z.array(z.string()).default([]),
  coverTitleLines: z.array(z.string()).optional(),

    world: z.object({
    id: z.string().optional(),
    name: z.string(),
    referenceWorld: z.string().default('Our World'),
  }).optional(),

  divergence: z.object({
    id: z.string().optional(),
    type: z.string(),
    title: z.string(),
    date: z.string().optional(),
    referenceOutcome: z.string(),
    alternateOutcome: z.string(),
  }).optional(),
  
  timeline: z.array(z.object({
    id: z.string().min(1, 'Timeline events require a stable ID.'),
    headingId: z.string().optional(),
    date: z.string(),
    title: z.string(),
    description: z.string().optional(),
  })).optional().default([]),

  entities: z.array(z.object({
    id: z.string().optional(),
    type: z.string(),
    name: z.string(),
  })).optional().default([]),

  relationships: z.array(z.object({
    type: z.string(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
  })).optional().default([]),

  // World State records live canonically in src/data/world-states/*.yaml.
});


const contentEntities = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content-entities' }),
  schema: z.object({
    id: z.string().regex(/^\d{10,}$/, 'Content Entity IDs must be numeric strings prefixed by their Article ID.'),
    originArticleId: z.string().regex(/^\d{9}$/),
    title: z.string(),
    kind: z.enum(['intro', 'section']),
  }),
});

const history = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/history' }),
  schema: articleSchema,
});

const science = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/science' }),
  schema: articleSchema,
});

const space = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/space' }),
  schema: articleSchema,
});

const society = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/society' }),
  schema: articleSchema,
});

export const collections = {
  contentEntities,
  history,
  science,
  space,
  society,
};