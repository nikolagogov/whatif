#!/usr/bin/env node
/**
 * HAD IT GONE — stable Article / Content Entity ID generator
 *
 * Usage (from project root):
 *   node src/scripts/article/generate-ids.mjs article
 *   node src/scripts/article/generate-ids.mjs entity 000000001
 *
 * Prints YAML-ready, quoted IDs. It does not modify existing content files.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_ROOT = path.join(ROOT, 'src', 'content');
const ENTITIES_ROOT = path.join(ROOT, 'src', 'content-entities');

function fail(message) {
  console.error(`ID Generator: ${message}`);
  process.exit(1);
}

function readMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...readMarkdownFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(fullPath);
  }
  return result;
}

function frontmatter(source, filePath) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail(`Missing or malformed YAML frontmatter: ${path.relative(ROOT, filePath)}`);
  return match[1];
}

function scalarField(yaml, field) {
  const pattern = new RegExp(`^${field}:\\s*(['"]?)([^\\r\\n#]+?)\\1\\s*(?:#.*)?$`, 'm');
  const match = yaml.match(pattern);
  return match?.[2]?.trim();
}

function collectIds(files, field = 'id') {
  const ids = new Set();
  for (const file of files) {
    const yaml = frontmatter(fs.readFileSync(file, 'utf8'), file);
    const id = scalarField(yaml, field);
    if (!id) fail(`Missing ${field} in ${path.relative(ROOT, file)}`);
    if (ids.has(id)) fail(`Duplicate ${field}: ${id}`);
    ids.add(id);
  }
  return ids;
}

function generateArticleId() {
  const files = readMarkdownFiles(CONTENT_ROOT);
  const ids = collectIds(files);
  let max = 0;
  for (const id of ids) {
    if (!/^\d{9}$/.test(id)) fail(`Invalid Article ID '${id}'. Expected exactly 9 digits.`);
    max = Math.max(max, Number(id));
  }
  const next = max + 1;
  if (next > 999999999) fail('The 9-digit Article ID space is exhausted.');
  console.log(`id: '${String(next).padStart(9, '0')}'`);
}

function generateEntityId(articleId) {
  if (!/^\d{9}$/.test(articleId)) fail('Article ID must contain exactly 9 digits.');

  const articleFiles = readMarkdownFiles(CONTENT_ROOT);
  const articleIds = collectIds(articleFiles);
  if (!articleIds.has(articleId)) fail(`Article ${articleId} does not exist in src/content.`);

  const entityFiles = readMarkdownFiles(ENTITIES_ROOT);
  const entityIds = collectIds(entityFiles);
  let maxSequence = 0;

  for (const id of entityIds) {
    if (!/^\d{10,}$/.test(id)) fail(`Invalid Content Entity ID '${id}'.`);
    if (id.startsWith(articleId)) {
      const suffix = id.slice(articleId.length);
      if (!/^\d+$/.test(suffix)) fail(`Invalid sequence in Content Entity ID '${id}'.`);
      maxSequence = Math.max(maxSequence, Number(suffix));
    }
  }

  const nextSequence = maxSequence + 1;
  const nextId = `${articleId}${nextSequence}`;
  if (entityIds.has(nextId)) fail(`Generated ID already exists: ${nextId}`);
  console.log(`id: '${nextId}'`);
  console.log(`originArticleId: '${articleId}'`);
}

const [mode, argument] = process.argv.slice(2);
if (mode === 'article' && !argument) generateArticleId();
else if (mode === 'entity' && argument) generateEntityId(argument);
else fail('Usage: node src/scripts/article/generate-ids.mjs article | entity <9-digit-article-id>');
