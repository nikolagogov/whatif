/**
 * Report-only migration inventory for HAD IT GONE.
 *
 * Does not modify content or generated data.
 *
 * Usage:
 *   node scripts/migration-inventory.mjs
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const DATA_ROOT = join(ROOT, 'src', 'data');
const STATE_ROOT = join(DATA_ROOT, 'world-states');

const findings = [];
const articles = [];
const knownIds = new Set();
const globalIds = new Map();

function toRelative(file) {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function walk(dir, extension) {
  if (!existsSync(dir)) return [];

  const result = [];

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      result.push(...walk(fullPath, extension));
    } else if (
      extension === 'markdown'
        ? extname(name).toLowerCase() === '.md'
        : /\.(yaml|yml)$/i.test(name)
    ) {
      result.push(fullPath);
    }
  }

  return result;
}

function add(level, file, message) {
  findings.push({
    level,
    file: file ? toRelative(file) : '-',
    message,
  });
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    add('ERROR', file, 'Missing YAML frontmatter');
    return null;
  }

  try {
    return parseYaml(match[1]) ?? {};
  } catch (error) {
    add('ERROR', file, `Invalid frontmatter YAML: ${error.message}`);
    return null;
  }
}

function registerId(id, kind, file) {
  if (!id) return;

  const key = String(id);
  knownIds.add(key);

  if (globalIds.has(key)) {
    const previous = globalIds.get(key);

    add(
      'ERROR',
      file,
      `Duplicate ID "${key}" (${kind}); already used by ${previous.kind} in ${
        previous.file ? toRelative(previous.file) : 'registry'
      }`,
    );
  } else {
    globalIds.set(key, { kind, file });
  }
}

// 1. Inspect Markdown articles.
if (!existsSync(CONTENT_ROOT)) {
  console.error(`Content directory not found: ${CONTENT_ROOT}`);
  process.exitCode = 1;
} else {
  for (const file of walk(CONTENT_ROOT, 'markdown')) {
    const fm = parseFrontmatter(file);
    if (!fm) continue;

    articles.push({ file, fm });

    for (const field of ['title', 'description', 'image']) {
      if (!fm[field]) {
        add('ERROR', file, `Missing required field "${field}"`);
      }
    }

    const articleId =
      fm.id ??
      relative(CONTENT_ROOT, file)
        .replace(/\\/g, '/')
        .replace(/\.md$/i, '');

    registerId(`article:${articleId}`, 'article', file);

// Collect IDs for endpoint checks without treating cross-article
// references to the same world, divergence or entity as duplicates.
if (fm.world?.id) {
  knownIds.add(String(fm.world.id));
}

if (fm.divergence?.id) {
  knownIds.add(String(fm.divergence.id));
}

for (const event of fm.timeline ?? []) {
  if (event?.id) {
    knownIds.add(String(event.id));
  }
}

for (const entity of fm.entities ?? []) {
  if (entity?.id) {
    knownIds.add(String(entity.id));
  }
}

    if (Array.isArray(fm.worldStates) && fm.worldStates.length > 0) {
      add(
        'MIGRATION',
        file,
        `Legacy inline worldStates: ${fm.worldStates.length} state block(s); compare with src/data/world-states/*.yaml before migrating`,
      );
    }

    if (!('relationships' in fm)) {
      add(
        'MIGRATION',
        file,
        'No relationships field; confirm whether relationships are intentionally absent',
      );
    }

    if (!('order' in fm)) {
      add(
        'INFO',
        file,
        'No explicit order field; verify whether current ordering relies on fallback dates or filenames',
      );
    }
  }
}

// 2. Load the global entity registry.
const entityFile = join(DATA_ROOT, 'entities.yaml');
const entityIds = new Set();

if (existsSync(entityFile)) {
  try {
    const parsed = parseYaml(readFileSync(entityFile, 'utf8')) ?? {};

    for (const entity of parsed.entities ?? []) {
      if (!entity?.id) {
        add('ERROR', entityFile, 'Registry entity without an id');
        continue;
      }

      const id = String(entity.id);

      if (entityIds.has(id)) {
        add('ERROR', entityFile, `Duplicate entity registry ID "${id}"`);
      }

      entityIds.add(id);
      knownIds.add(id);
    }
  } catch (error) {
    add('ERROR', entityFile, `Cannot parse entity registry: ${error.message}`);
  }
} else {
  add('WARNING', entityFile, 'Global entity registry not found at expected path');
}

// 3. Load allowed relationship types.
const relationshipTypesFile = join(DATA_ROOT, 'relationship-types.yaml');
const allowedRelationshipTypes = new Set();

if (existsSync(relationshipTypesFile)) {
  try {
    const parsed = parseYaml(
      readFileSync(relationshipTypesFile, 'utf8'),
    ) ?? {};

    for (const item of parsed.relationships ?? []) {
      if (item?.id) {
        allowedRelationshipTypes.add(String(item.id));
      }
    }
  } catch (error) {
    add(
      'ERROR',
      relationshipTypesFile,
      `Cannot parse relationship type registry: ${error.message}`,
    );
  }
} else {
  add(
    'WARNING',
    relationshipTypesFile,
    'Relationship type registry not found at expected path',
  );
}

// 4. Inspect relationships and related-article references.
for (const { file, fm } of articles) {
  for (const rel of fm.relationships ?? []) {
    if (
      rel?.type &&
      allowedRelationshipTypes.size > 0 &&
      !allowedRelationshipTypes.has(String(rel.type))
    ) {
      add(
        'WARNING',
        file,
        `Relationship type "${rel.type}" is not in relationship-types.yaml`,
      );
    }

    for (const endpoint of ['from', 'to']) {
      const id = rel?.[endpoint];

      if (id && !knownIds.has(String(id))) {
        add(
          'WARNING',
          file,
          `Relationship ${endpoint} endpoint "${id}" was not found among collected article and entity IDs; verify whether it uses another registry`,
        );
      }
    }
  }

  for (const related of fm.related ?? []) {
    if (typeof related !== 'string') {
      add('WARNING', file, 'related[] contains a non-string value');
    }
  }
}

// 5. Inspect World State YAML files.
const stateFiles = walk(STATE_ROOT, 'yaml');
const stateIds = new Set();
const stateWorlds = new Map();

for (const file of stateFiles) {
  try {
    const state = parseYaml(readFileSync(file, 'utf8')) ?? {};

    if (!state.id) {
      add('ERROR', file, 'World State has no id');
    } else {
      const id = String(state.id);

      if (stateIds.has(id)) {
        add('ERROR', file, `Duplicate World State id "${id}"`);
      }

      stateIds.add(id);
    }

    if (state.worldId) {
      const worldId = String(state.worldId);

      if (!stateWorlds.has(worldId)) {
        stateWorlds.set(worldId, []);
      }

      stateWorlds.get(worldId).push(file);
    }
  } catch (error) {
    add('ERROR', file, `Cannot parse World State YAML: ${error.message}`);
  }
}

// 5a. Make World State IDs available for endpoint checks.
for (const id of stateIds) {
  knownIds.add(id);
}

// 5b. Collect World Transition IDs and event references.
const transitionsFile = join(DATA_ROOT, 'world-transitions.yaml');

if (existsSync(transitionsFile)) {
  try {
    const parsed = parseYaml(
      readFileSync(transitionsFile, 'utf8'),
    ) ?? {};

    for (const transition of parsed.transitions ?? []) {
      if (transition?.id) {
        knownIds.add(String(transition.id));
      }

      if (transition?.fromStateId) {
        knownIds.add(String(transition.fromStateId));
      }

      if (transition?.toStateId) {
        knownIds.add(String(transition.toStateId));
      }

      if (transition?.eventId) {
        knownIds.add(String(transition.eventId));
      }
    }
  } catch (error) {
    add(
      'ERROR',
      transitionsFile,
      `Cannot parse World Transitions YAML: ${error.message}`,
    );
  }
}

// 6. Report worlds that have inline states and separate YAML states.
for (const { file, fm } of articles) {
  const worldId = fm.world?.id;

  if (
    worldId &&
    Array.isArray(fm.worldStates) &&
    fm.worldStates.length > 0 &&
    stateWorlds.has(String(worldId))
  ) {
    add(
      'MIGRATION',
      file,
      `Both inline worldStates and separate YAML states exist for "${worldId}"; compare records before deciding which data to retain`,
    );
  }
}

// 7. Print report.
console.log('\nHAD IT GONE — MIGRATION INVENTORY (REPORT ONLY)');
console.log('No project files were changed.\n');

console.log(`Articles scanned: ${articles.length}`);
console.log(`Global entity IDs: ${entityIds.size}`);
console.log(`World State YAML files: ${stateFiles.length}`);
console.log(`Relationship types registered: ${allowedRelationshipTypes.size}`);
console.log(`Findings: ${findings.length}\n`);

const rank = {
  ERROR: 0,
  MIGRATION: 1,
  WARNING: 2,
  INFO: 3,
};

findings.sort(
  (a, b) =>
    rank[a.level] - rank[b.level] ||
    a.file.localeCompare(b.file) ||
    a.message.localeCompare(b.message),
);

for (const item of findings) {
  console.log(`[${item.level}] ${item.file}: ${item.message}`);
}

const summary = ['ERROR', 'MIGRATION', 'WARNING', 'INFO']
  .map(
    (level) =>
      `${level}: ${findings.filter((item) => item.level === level).length}`,
  )
  .join(' | ');

console.log(`\nSummary: ${summary}`);
console.log(
  'Interpretation: ERROR = inspect before migration; MIGRATION = candidate for planned migration; WARNING = verify manually; INFO = non-blocking inventory note.',
);