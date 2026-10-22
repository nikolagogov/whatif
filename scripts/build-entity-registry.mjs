/**
 * Build the global entity registry from HAD IT GONE articles.
 *
 * Usage:
 *   node scripts/build-entity-registry.mjs
 *
 * The script does not overwrite an existing registry.
 * Conflicting definitions must be resolved before generation.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';

import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const REGISTRY_PATH = join(ROOT, 'src', 'data', 'entities.yaml');

const SECTORS = ['history', 'science', 'space', 'society'];

function walk(dir) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (extname(entry.name).toLowerCase() === '.md') {
      files.push(full);
    }
  }

  return files;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? match[1] : null;
}

const definitions = new Map();
const conflicts = [];
const missingIds = [];
let articleCount = 0;
let entityCount = 0;

for (const sector of SECTORS) {
  const sectorDir = join(CONTENT_ROOT, sector);

  for (const file of walk(sectorDir)) {
    const raw = readFileSync(file, 'utf8');
    const fmRaw = extractFrontmatter(raw);

    if (fmRaw === null) continue;

    let fm;

    try {
      fm = parseYaml(fmRaw);
    } catch (error) {
      console.error(`YAML error in ${file}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }

    if (!fm || typeof fm !== 'object' || Array.isArray(fm)) continue;

    articleCount++;

    const entities = Array.isArray(fm.entities) ? fm.entities : [];

    for (const entity of entities) {
      if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
        continue;
      }

      if (typeof entity.id !== 'string' || !entity.id.trim()) {
        missingIds.push(`${file}: ${entity.name ?? '(unnamed entity)'}`);
        continue;
      }

      if (
        typeof entity.type !== 'string' ||
        !entity.type.trim() ||
        typeof entity.name !== 'string' ||
        !entity.name.trim()
      ) {
        conflicts.push(
          `${file}: "${entity.id}" must have a non-empty type and name.`,
        );
        continue;
      }

      entityCount++;

      const normalized = {
        id: entity.id.trim(),
        type: entity.type.trim(),
        name: entity.name.trim(),
      };

      const existing = definitions.get(normalized.id);

      if (!existing) {
        definitions.set(normalized.id, {
          ...normalized,
          sources: [file],
        });
        continue;
      }

      existing.sources.push(file);

      if (
        existing.type !== normalized.type ||
        existing.name !== normalized.name
      ) {
        conflicts.push(
          [
            `Conflicting definition for "${normalized.id}":`,
            `  First: ${existing.type} — ${existing.name}`,
            `  In: ${existing.sources[0]}`,
            `  Also: ${normalized.type} — ${normalized.name}`,
            `  In: ${file}`,
          ].join('\n'),
        );
      }
    }
  }
}

console.log('\nHAD IT GONE — Entity Registry Generator');
console.log('───────────────────────────────────────');
console.log(`Articles scanned:          ${articleCount}`);
console.log(`Entity definitions found:  ${entityCount}`);
console.log(`Unique entity IDs:         ${definitions.size}`);
console.log(`Definitions missing IDs:   ${missingIds.length}`);
console.log(`Conflicts:                 ${conflicts.length}`);

if (missingIds.length) {
  console.log('\nEntities without IDs');

  for (const item of missingIds) {
    console.log(`  - ${item}`);
  }

  console.log(
    '\nAssign stable IDs to these entities before generating the registry.',
  );
}

if (conflicts.length) {
  console.log('\nConflicts');

  for (const conflict of conflicts) {
    console.log(`\n  ${conflict}`);
  }
}

if (missingIds.length || conflicts.length) {
  console.error(
    '\nRegistry not generated. Resolve the issues above and run again.',
  );
  process.exit(1);
}

// Load the existing registry and merge article definitions into it.
// Existing records and aliases are preserved.

let existingEntities = [];

if (existsSync(REGISTRY_PATH)) {
  try {
    const existingRaw = readFileSync(REGISTRY_PATH, 'utf8');
    const existingData = parseYaml(existingRaw);

    if (!existingData || !Array.isArray(existingData.entities)) {
      throw new Error('Expected an "entities" array in the registry.');
    }

    existingEntities = existingData.entities;
  } catch (error) {
    console.error(`\nCannot read existing registry: ${error.message}`);
    process.exit(1);
  }
}

const merged = new Map();
const mergeConflicts = [];

for (const entity of existingEntities) {
  if (
    !entity ||
    typeof entity.id !== 'string' ||
    typeof entity.type !== 'string' ||
    typeof entity.name !== 'string'
  ) {
    mergeConflicts.push(
      `Invalid registry entry: ${JSON.stringify(entity)}`,
    );
    continue;
  }

  if (merged.has(entity.id)) {
    mergeConflicts.push(`Duplicate ID in registry: "${entity.id}"`);
    continue;
  }

  merged.set(entity.id, {
    ...entity,
    aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
  });
}

for (const [id, articleEntity] of definitions) {
  const existing = merged.get(id);

  if (!existing) {
    merged.set(id, {
      id: articleEntity.id,
      type: articleEntity.type,
      name: articleEntity.name,
      aliases: [],
    });
    continue;
  }

  if (
    existing.type !== articleEntity.type ||
    existing.name !== articleEntity.name
  ) {
    mergeConflicts.push(
      [
        `Registry/article mismatch for "${id}":`,
        `  Registry: ${existing.type} — ${existing.name}`,
        `  Articles: ${articleEntity.type} — ${articleEntity.name}`,
        `  Articles found in: ${articleEntity.sources.join(', ')}`,
      ].join('\n'),
    );
  }
}

if (mergeConflicts.length) {
  console.error('\nRegistry merge conflicts:');

  for (const conflict of mergeConflicts) {
    console.error(`\n${conflict}`);
  }

  console.error('\nRegistry was not changed. Resolve the conflicts first.');
  process.exit(1);
}

const entities = [...merged.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
);

mkdirSync(dirname(REGISTRY_PATH), { recursive: true });

// Keep a backup before updating the registry.
if (existsSync(REGISTRY_PATH)) {
  const backupPath = `${REGISTRY_PATH}.bak`;
  writeFileSync(backupPath, readFileSync(REGISTRY_PATH));
  console.log(`Backup created: ${backupPath}`);
}

writeFileSync(
  REGISTRY_PATH,
  stringifyYaml({ entities }, { lineWidth: 100 }),
  'utf8',
);

const addedCount = [...definitions.keys()].filter(
  (id) => !existingEntities.some((entity) => entity.id === id),
).length;

console.log('\n✓ Entity registry merged successfully.');
console.log(`Existing registry entries: ${existingEntities.length}`);
console.log(`Article entity IDs:        ${definitions.size}`);
console.log(`New entries added:         ${addedCount}`);
console.log(`Total registry entries:    ${entities.length}`);
console.log(`Registry:                  ${REGISTRY_PATH}`);