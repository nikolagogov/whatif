#!/usr/bin/env node
/**
 * HAD IT GONE — Article Importer
 *
 * Usage:
 *   node src/scripts/article/import-article.mjs <sector> <draft.md> [slug]
 *
 * The draft must be a Markdown file with YAML frontmatter containing the
 * normal article metadata (title, description, image, tags, topics, etc.).
 * Do not include `id` or `contentEntities`; these are generated.
 *
 * The first H2-delimited block becomes the intro Entity (if non-empty).
 * Each subsequent H2 starts one section Entity. H3 headings and all content
 * remain inside their containing Entity. The original article metadata is
 * preserved and the ordered Entity IDs are written into contentEntities.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SECTORS = new Set(['history', 'science', 'space', 'society']);
const ARTICLE_DIR = path.join(ROOT, 'src', 'content');
const ENTITY_DIR = path.join(ROOT, 'src', 'content-entities');

function fail(message) {
  console.error(`\n[Article Importer] ${message}\n`);
  process.exit(1);
}

function quoteYaml(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readMarkdown(filePath) {
  if (!fs.existsSync(filePath)) fail(`Draft not found: ${filePath}`);
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) fail('Draft must begin with YAML frontmatter enclosed by --- lines.');
  const frontmatter = match[1];
  const body = match[2].trim();
  if (!/^\s*title\s*:\s*\S/m.test(frontmatter)) fail('Draft frontmatter must contain a title.');
  if (!/^\s*description\s*:\s*\S/m.test(frontmatter)) fail('Draft frontmatter must contain a description.');
  if (!/^\s*image\s*:\s*\S/m.test(frontmatter)) fail('Draft frontmatter must contain an image path.');
  if (/^\s*(id|contentEntities)\s*:/m.test(frontmatter)) {
    fail('Draft must not contain id or contentEntities; the importer generates both.');
  }
  return { frontmatter, body };
}

function collectArticleIds() {
  const ids = new Set();
  for (const sector of SECTORS) {
    const dir = path.join(ARTICLE_DIR, sector);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const fm = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      const id = fm?.[1].match(/^\s*id:\s*['"]?(\d{9})['"]?\s*$/m)?.[1];
      if (id) ids.add(id);
    }
  }
  return ids;
}

function collectEntityIds() {
  const ids = new Set();
  if (!fs.existsSync(ENTITY_DIR)) return ids;
  for (const articleFolder of fs.readdirSync(ENTITY_DIR, { withFileTypes: true })) {
    if (!articleFolder.isDirectory()) continue;
    const dir = path.join(ENTITY_DIR, articleFolder.name);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const fm = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
      const id = fm?.[1].match(/^\s*id:\s*['"]?(\d{10,})['"]?\s*$/m)?.[1];
      if (id) ids.add(id);
    }
  }
  return ids;
}

function nextArticleId(ids) {
  let max = 0;
  for (const id of ids) max = Math.max(max, Number(id));
  const next = String(max + 1).padStart(9, '0');
  if (next.length !== 9) fail('Article ID space exhausted (9 digits).');
  if (ids.has(next)) fail(`Article ID collision: ${next}`);
  return next;
}

function nextEntityIds(articleId, count, used) {
  const prefix = articleId;
  const suffixes = [];
  for (const id of used) {
    if (id.startsWith(prefix)) {
      const suffix = id.slice(prefix.length);
      if (/^\d+$/.test(suffix)) suffixes.push(Number(suffix));
    }
  }
  let next = Math.max(0, ...suffixes) + 1;
  const result = [];
  while (result.length < count) {
    const id = `${prefix}${next++}`;
    if (!used.has(id)) result.push(id);
  }
  return result;
}

function splitBody(body) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  let intro = [];
  let current = null;
  let fence = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      (current ? current.lines : intro).push(line);
      continue;
    }
    const heading = !fence && line.match(/^##[ \t]+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current) blocks.push(current);
      current = { title: heading[1].trim(), lines: [line] };
    } else {
      (current ? current.lines : intro).push(line);
    }
  }
  if (current) blocks.push(current);
  return {
    intro: intro.join('\n').trim(),
    sections: blocks.map((b) => ({ title: b.title, body: b.lines.join('\n').trim() })),
  };
}

function slugify(value) {
  return value.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function main() {
  const [, , sector, draftArg, slugArg] = process.argv;
  if (!SECTORS.has(sector)) fail(`Sector must be one of: ${[...SECTORS].join(', ')}.`);
  if (!draftArg) fail('Usage: node src/scripts/article/import-article.mjs <sector> <draft.md> [slug]');

  const draftPath = path.resolve(ROOT, draftArg);
  const { frontmatter, body } = readMarkdown(draftPath);
  const parts = splitBody(body);
  const entities = [];
  if (parts.intro) entities.push({ title: 'Introduction', kind: 'intro', body: parts.intro });
  for (const section of parts.sections) {
    entities.push({ title: section.title, kind: 'section', body: section.body });
  }
  if (!entities.length) fail('No article content found. Add an introduction or at least one H2 section.');

  const articleIds = collectArticleIds();
  const entityIdsUsed = collectEntityIds();
  const articleId = nextArticleId(articleIds);
  const entityIds = nextEntityIds(articleId, entities.length, entityIdsUsed);
  const rawTitle = frontmatter.match(/^\s*title:\s*(.+?)\s*$/m)?.[1] ?? '';
  const title = rawTitle.replace(/^['"]|['"]$/g, '');
  const slug = slugArg || slugify(title);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('Slug must contain lowercase letters, numbers, and hyphens only.');

  const articlePath = path.join(ARTICLE_DIR, sector, `${slug}.md`);
  const entityFolder = path.join(ENTITY_DIR, articleId);
  if (fs.existsSync(articlePath)) fail(`Article file already exists: ${path.relative(ROOT, articlePath)}`);
  if (fs.existsSync(entityFolder)) fail(`Entity folder already exists: ${path.relative(ROOT, entityFolder)}`);

  const contentList = entityIds.map((id) => `- ${quoteYaml(id)}`).join('\n');
  const articleFile = `---\n${frontmatter.trimEnd()}\nid: ${quoteYaml(articleId)}\ncontentEntities:\n${contentList}\n---\n\n`;
  const entityFiles = entities.map((entity, index) => {
    const id = entityIds[index];
    return {
      path: path.join(entityFolder, `${id}.md`),
      content: `---\nid: ${quoteYaml(id)}\noriginArticleId: ${quoteYaml(articleId)}\ntitle: ${quoteYaml(entity.title)}\nkind: ${entity.kind}\n---\n\n${entity.body}\n`,
    };
  });

  // Validate every destination before writing anything.
  fs.mkdirSync(path.dirname(articlePath), { recursive: true });
  fs.mkdirSync(entityFolder, { recursive: true });
  fs.writeFileSync(articlePath, articleFile, 'utf8');
  for (const file of entityFiles) fs.writeFileSync(file.path, file.content, 'utf8');

  console.log('\n[Article Importer] Import completed.\n');
  console.log(`Article: ${path.relative(ROOT, articlePath)}`);
  console.log(`Article ID: ${articleId}`);
  console.log(`Content Entities: ${entities.length}`);
  entities.forEach((entity, i) => console.log(`  ${i + 1}. ${entityIds[i]}  [${entity.kind}] ${entity.title}`));
  console.log('\nEntity order is preserved by the contentEntities array.');
}

main();
