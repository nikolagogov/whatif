import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articleSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string(),
  pubDate: z.coerce.date(),
  featured: z.boolean().optional().default(false),
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

export const collections = { history, science, space, society };