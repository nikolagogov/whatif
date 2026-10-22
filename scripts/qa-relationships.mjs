/**
 * QA: content integrity for HAD IT GONE.
 *
 * Checks:
 * - YAML frontmatter parsing
 * - Required article fields
 * - Duplicate article IDs
 * - Image presence
 * - related[] references
 * - relationships[].from / relationships[].to references
 *
 * Usage:
 *   npm run qa
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';

import {
  join,
  relative,
  extname,
  basename,
  dirname,
} from 'node:path';

import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const PUBLIC_ROOT = join(ROOT, 'public');

const SECTORS = ['history', 'science', 'space', 'society'];

const errors = [];
const warnings = [];
const articles = [];

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (extname(entry).toLowerCase() === '.md') {
      files.push(full);
    }
  }

  return files;
}

function addError(file, message) {
  errors.push(`${relative(ROOT, file)}: ${message}`);
}

function addWarning(file, message) {
  warnings.push(`${relative(ROOT, file)}: ${message}`);
}

function collectLocalIds(frontmatter, sector, articleId) {
  const ids = new Set();

  if (frontmatter.world?.id) {
    ids.add(String(frontmatter.world.id));
  }

  if (frontmatter.divergence?.id) {
    ids.add(String(frontmatter.divergence.id));
  }

  for (const [index, item] of (frontmatter.timeline ?? []).entries()) {
    if (item?.id) {
      ids.add(String(item.id));
    } else {
      ids.add(`article:${sector}/${articleId}:timeline:${index + 1}`);
    }
  }

  for (const item of frontmatter.entities ?? []) {
    if (item?.id) ids.add(String(item.id));
  }

  return ids;
}

function imageExists(image) {
  if (typeof image !== 'string' || !image.trim()) {
    return false;
  }

  // External URLs cannot be verified by this local filesystem check.
  if (/^https?:\/\//i.test(image)) {
    return true;
  }

  // Public assets are served from the site root.
  const normalized = image.replace(/^\/+/, '');
  const publicPath = join(PUBLIC_ROOT, normalized);

  return existsSync(publicPath);
}

let totalFiles = 0;
let parsedFiles = 0;
let totalRelationships = 0;
let totalRelatedReferences = 0;

for (const sector of SECTORS) {
  const sectorDir = join(CONTENT_ROOT, sector);

  for (const file of walk(sectorDir)) {
    totalFiles++;

    const raw = readFileSync(file, 'utf8');
    const fmRaw = extractFrontmatter(raw);

    if (fmRaw === null) {
      addError(file, 'Missing YAML frontmatter.');
      continue;
    }

    let fm;

    try {
      fm = parseYaml(fmRaw);
    } catch (error) {
      addError(file, `YAML parse error: ${error.message}`);
      continue;
    }

    if (!fm || typeof fm !== 'object' || Array.isArray(fm)) {
      addError(file, 'Frontmatter must be a YAML object.');
      continue;
    }

    parsedFiles++;

    const article = {
      file,
      sector,
      id: basename(file, extname(file)),
      frontmatter: fm,
    };

    articles.push(article);

    for (const field of ['title', 'description', 'image']) {
      if (typeof fm[field] !== 'string' || !fm[field].trim()) {
        addError(file, `Missing or empty required field "${field}".`);
      }
    }

    if (typeof fm.title === 'string' && fm.title.trim()) {
      if (fm.title.length > 120) {
        addWarning(file, 'Title is longer than 120 characters.');
      }
    }

    if (typeof fm.description === 'string' && fm.description.trim()) {
      if (fm.description.length < 50) {
        addWarning(file, 'Description is shorter than 50 characters.');
      }
    }

    if (fm.image && !imageExists(fm.image)) {
      addWarning(
        file,
        `Image not found under public/: "${fm.image}". Check whether this is a public asset or an intentional URL.`
      );
    }

    for (const field of ['tags', 'topics', 'related']) {
      if (fm[field] !== undefined && !Array.isArray(fm[field])) {
        addError(file, `"${field}" must be an array.`);
      }
    }

    if (
      fm.relationships !== undefined &&
      !Array.isArray(fm.relationships)
    ) {
      addError(file, '"relationships" must be an array.');
    }

    const relationships = Array.isArray(fm.relationships)
      ? fm.relationships
      : [];

    const localIds = collectLocalIds(
  fm,
  sector,
  basename(file, extname(file))
);

    totalRelationships += relationships.length;

    for (const relationship of relationships) {
      if (
        !relationship ||
        typeof relationship !== 'object' ||
        Array.isArray(relationship)
      ) {
        addError(file, 'Invalid relationship entry.');
        continue;
      }

      for (const side of ['from', 'to']) {
        const value = relationship[side];

        if (typeof value !== 'string' || !value.trim()) {
          addError(
            file,
            `Relationship is missing a valid "${side}" (type: ${relationship.type ?? '?'}).`
          );
          continue;
        }

        if (!localIds.has(value)) {
          addError(
            file,
            `relationships.${side}: "${value}" not found among this article's world, divergence, timeline or entities (type: ${relationship.type ?? '?'}).`
          );
        }
      }

      if (
        typeof relationship.type !== 'string' ||
        !relationship.type.trim()
      ) {
        addError(file, 'Relationship is missing a valid "type".');
      }
    }

    if (Array.isArray(fm.related)) {
      totalRelatedReferences += fm.related.length;
    }
  }
}

// Detect duplicate article IDs across sectors.
const articlesById = new Map();

for (const article of articles) {
  const matches = articlesById.get(article.id) ?? [];
  matches.push(article);
  articlesById.set(article.id, matches);
}

for (const [id, matches] of articlesById) {
  if (matches.length > 1) {
    const locations = matches
      .map(article => relative(ROOT, article.file))
      .join(', ');

    errors.push(`Duplicate article ID "${id}": ${locations}`);
  }
}

// Validate related[] references.
// Accept either a bare article ID or "sector/article-id".
const articleLookup = new Map();

for (const article of articles) {
  articleLookup.set(`${article.sector}/${article.id}`, article);
}

for (const article of articles) {
  const related = article.frontmatter.related;

  if (!Array.isArray(related)) continue;

  for (const reference of related) {
    if (typeof reference !== 'string' || !reference.trim()) {
      addError(
        article.file,
        'related[] contains an empty or non-string reference.'
      );
      continue;
    }

    const normalized = reference.replace(/^\/+|\/+$/g, '');
    const parts = normalized.split('/');

    let exists = false;

    if (parts.length === 2 && SECTORS.includes(parts[0])) {
      exists = articleLookup.has(`${parts[0]}/${parts[1]}`);
    } else if (parts.length === 1) {
      exists = articles.some(item => item.id === parts[0]);
    }

    if (!exists) {
      addError(
        article.file,
        `related[] reference "${reference}" does not match an existing article ID.`
      );
    }
  }
}

console.log('');
console.log('HAD IT GONE — Content QA');
console.log('────────────────────────');
console.log(`Markdown files found:      ${totalFiles}`);
console.log(`Files parsed:              ${parsedFiles}`);
console.log(`Articles indexed:          ${articles.length}`);
console.log(`Relationships checked:     ${totalRelationships}`);
console.log(`Related references:        ${totalRelatedReferences}`);
console.log(`Errors:                    ${errors.length}`);
console.log(`Warnings:                  ${warnings.length}`);
console.log('');

if (warnings.length > 0) {
  console.log('WARNINGS');
  console.log('────────');

  for (const warning of warnings) {
    console.log(`  ⚠ ${warning}`);
  }

  console.log('');
}

if (errors.length > 0) {
  console.log('ERRORS');
  console.log('──────');

  for (const error of errors) {
    console.log(`  ✗ ${error}`);
  }

  console.log('');
  console.log('QA failed.');
  process.exit(1);
}

console.log('✓ No content integrity errors.');
process.exit(0);