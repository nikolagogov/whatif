
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');

const ENTITY_FILE = path.join(ROOT_DIR, 'src/data/entities.yaml');
const OUTPUT_FILE = path.join(
  ROOT_DIR,
  'src/data/concept-model-v1-report.json',
);

const SCHEMA_VERSION = 1;

// Нормализацията уеднаквява изписването на типовете,
// но не променя оригиналните ID или стойности в entities.yaml.
const TYPE_ALIASES = new Map([
  ['PERSON', 'PERSON'],
  ['HISTORICAL-FIGURE', 'PERSON'],
  ['HISTORICAL_FIGURE', 'PERSON'],

  ['PLACE', 'PLACE'],
  ['CITY', 'PLACE'],
  ['LOCATION', 'PLACE'],

  ['STATE', 'POLITICAL_ENTITY'],
  ['POLITY', 'POLITICAL_ENTITY'],
  ['COUNTRY', 'POLITICAL_ENTITY'],
  ['POLITICAL_ENTITY', 'POLITICAL_ENTITY'],

  ['CONCEPT', 'CONCEPT'],
  ['EVENT', 'EVENT'],
  ['INSTITUTION', 'INSTITUTION'],
  ['GROUP', 'GROUP'],
  ['CIVILIZATION', 'CIVILIZATION'],
  ['CLADE', 'CLADE'],
  ['SPECIES', 'SPECIES'],
  ['ORGANISM', 'ORGANISM'],
  ['PROCESS', 'PROCESS'],
  ['PERIOD', 'HISTORICAL_PERIOD'],
  ['HISTORICAL_PERIOD', 'HISTORICAL_PERIOD'],

  ['RELIGION', 'RELIGION'],
  ['ENVIRONMENT', 'ENVIRONMENT'],
  ['REGION', 'REGION'],
  ['PLANET', 'PLANET'],
  ['TECHNOLOGY', 'TECHNOLOGY'],
]);

// Категория се извежда само когато името дава сравнително
// силен сигнал. Това не е опит да се установи историческа
// същност само по свободен текст.
const NAME_CATEGORY_RULES = [
  {
    category: 'EMPIRE',
    pattern: /\bempire\b/i,
    appliesTo: ['POLITICAL_ENTITY', 'CIVILIZATION'],
  },
  {
    category: 'REPUBLIC',
    pattern: /\brepublic\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'KINGDOM',
    pattern: /\bkingdom\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'PRINCIPALITY',
    pattern: /\bprincipality\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'DUCHY',
    pattern: /\bduchy\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'SULTANATE',
    pattern: /\bsultanate\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'CALIPHATE',
    pattern: /\bcaliphate\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
  {
    category: 'KHANATE',
    pattern: /\bkhanate\b/i,
    appliesTo: ['POLITICAL_ENTITY'],
  },
];


const CATEGORY_HIERARCHY = [
  ['EMPIRE', 'POLITICAL_ENTITY'],
  ['REPUBLIC', 'POLITICAL_ENTITY'],
  ['KINGDOM', 'POLITICAL_ENTITY'],
  ['PRINCIPALITY', 'POLITICAL_ENTITY'],
  ['DUCHY', 'POLITICAL_ENTITY'],
  ['SULTANATE', 'POLITICAL_ENTITY'],
  ['CALIPHATE', 'POLITICAL_ENTITY'],
  ['KHANATE', 'POLITICAL_ENTITY'],
];

// Връща всички родителски категории, включително тези,
// които се достигат през междинни категории.
function getAncestorCategories(categoryId, relations) {
  const parents = new Map();

  for (const relation of relations) {
    if (relation.type !== 'SUBCATEGORY_OF') continue;

    if (!parents.has(relation.from)) {
      parents.set(relation.from, []);
    }

    parents.get(relation.from).push(relation.to);
  }

  const visited = new Set();
  const ancestors = new Set();
  const pending = [...(parents.get(categoryId) ?? [])];

  while (pending.length > 0) {
    const current = pending.pop();

    if (visited.has(current)) continue;

    visited.add(current);
    ancestors.add(current);

    for (const parent of parents.get(current) ?? []) {
      if (!visited.has(parent)) pending.push(parent);
    }
  }

  return [...ancestors].sort();
}

function findHierarchyCycles(relations) {
  const parents = new Map();

  for (const relation of relations) {
    if (relation.type !== 'SUBCATEGORY_OF') continue;

    if (!parents.has(relation.from)) {
      parents.set(relation.from, []);
    }

    parents.get(relation.from).push(relation.to);
  }

  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(node, path) {
    if (visiting.has(node)) {
      const start = path.indexOf(node);
      cycles.push([...path.slice(start), node]);
      return;
    }

    if (visited.has(node)) return;

    visiting.add(node);

    for (const parent of parents.get(node) ?? []) {
      visit(parent, [...path, node]);
    }

    visiting.delete(node);
    visited.add(node);
  }

  for (const node of parents.keys()) {
    visit(node, []);
  }

  return cycles;
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeType(rawType) {
  const original = asText(rawType);

  if (!original) {
    return {
      original: null,
      normalized: 'UNKNOWN',
      recognized: false,
    };
  }

  const key = original
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();

  const normalized = TYPE_ALIASES.get(key);

  if (normalized) {
    return {
      original,
      normalized,
      recognized: true,
    };
  }

  return {
    original,
    normalized: key,
    recognized: false,
  };
}

function getEntityCollection(document) {
  // Поддържа често използвани структури:
  // [ { id, name, type }, ... ]
  // { entities: [...] }
  // { entities: { id: { name, type }, ... } }
  // { id: { name, type }, ... }
  if (Array.isArray(document)) {
    return document;
  }

  if (!document || typeof document !== 'object') {
    throw new Error('entities.yaml не съдържа масив или обект.');
  }

  if (Array.isArray(document.entities)) {
    return document.entities;
  }

  if (
    document.entities &&
    typeof document.entities === 'object'
  ) {
    return Object.entries(document.entities).map(([key, value]) => ({
      id: value?.id ?? key,
      ...value,
    }));
  }

  return Object.entries(document)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({
      id: value.id ?? key,
      ...value,
    }));
}

function inferNameCategories(name, normalizedType) {
  const categories = [];

  for (const rule of NAME_CATEGORY_RULES) {
    if (
      rule.appliesTo.includes(normalizedType) &&
      rule.pattern.test(name)
    ) {
      categories.push({
        id: `category-${rule.category.toLowerCase()}`,
        code: rule.category,
        source: 'name_rule',
        evidence: name,
      });
    }
  }

  return categories;
}

function normalizeEntity(raw, index) {
  const id = asText(raw?.id ?? raw?.entityId);
  const name = asText(raw?.name ?? raw?.label ?? raw?.title);
  const typeInfo = normalizeType(raw?.type ?? raw?.entityType);

  const errors = [];

  if (!id) errors.push('MISSING_ID');
  if (!name) errors.push('MISSING_NAME');

  const categories = [];

  if (typeInfo.normalized !== 'UNKNOWN') {
    categories.push({
      id: `category-${typeInfo.normalized.toLowerCase()}`,
      code: typeInfo.normalized,
      source: 'normalized_type',
      evidence: typeInfo.original,
    });
  }

  if (name) {
    categories.push(
      ...inferNameCategories(name, typeInfo.normalized),
    );
  }

  const uniqueCategories = [
    ...new Map(categories.map((item) => [item.id, item])).values(),
  ];

  return {
    id: id || `invalid-entity-${index + 1}`,
    name: name || null,
    originalType: typeInfo.original,
    normalizedType: typeInfo.normalized,
    typeRecognized: typeInfo.recognized,
    categories: uniqueCategories,
    errors,
  };
}

function buildReport(rawEntities) {
  const entities = rawEntities.map(normalizeEntity);
  const errors = [];
  const warnings = [];

  const idOccurrences = new Map();

  for (const entity of entities) {
    idOccurrences.set(
      entity.id,
      (idOccurrences.get(entity.id) ?? 0) + 1,
    );
  }

  for (const entity of entities) {
    for (const errorCode of entity.errors) {
      errors.push({
        code: errorCode,
        entityId: entity.id,
        entityName: entity.name,
      });
    }

    if (!entity.typeRecognized) {
      warnings.push({
        code: 'UNRECOGNIZED_TYPE',
        entityId: entity.id,
        entityName: entity.name,
        originalType: entity.originalType,
        normalizedType: entity.normalizedType,
      });
    }

    if (idOccurrences.get(entity.id) > 1) {
      errors.push({
        code: 'DUPLICATE_ID',
        entityId: entity.id,
        entityName: entity.name,
      });
    }
  }

  const categoryMap = new Map();

  for (const entity of entities) {
    for (const category of entity.categories) {
      if (!categoryMap.has(category.id)) {
        categoryMap.set(category.id, {
          id: category.id,
          code: category.code,
          name: category.code
            .replaceAll('_', ' ')
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
          nodeType: 'CATEGORY',
        });
      }
    }
  }

  
  // Добавяме категориите от йерархията, дори ако в момента
  // няма същност, която да ги използва пряко.
  for (const [child, parent] of CATEGORY_HIERARCHY) {
    for (const code of [child, parent]) {
      const id = `category-${code.toLowerCase()}`;

      if (!categoryMap.has(id)) {
        categoryMap.set(id, {
          id,
          code,
          name: code
            .replaceAll('_', ' ')
            .toLowerCase()
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
          nodeType: 'CATEGORY',
        });
      }
    }
  }
  
  const relations = [];

  for (const entity of entities) {
    for (const category of entity.categories) {
      relations.push({
        id: `${entity.id}--INSTANCE_OF--${category.id}`,
        from: entity.id,
        to: category.id,
        type: 'INSTANCE_OF',
        status: 'GENERATED',
        evidence: {
          source: category.source,
          value: category.evidence,
        },
      });
    }
  }

  
  const categoryRelations = CATEGORY_HIERARCHY.map(
    ([child, parent]) => ({
      id: `category-${child.toLowerCase()}--SUBCATEGORY_OF--category-${parent.toLowerCase()}`,
      from: `category-${child.toLowerCase()}`,
      to: `category-${parent.toLowerCase()}`,
      type: 'SUBCATEGORY_OF',
      status: 'GENERATED',
      evidence: {
        source: 'CATEGORY_HIERARCHY',
        rule: `${child} is a subcategory of ${parent}`,
      },
    }),
  );

  const categoryIds = new Set(categoryMap.keys());

  for (const relation of categoryRelations) {
    if (
      !categoryIds.has(relation.from) ||
      !categoryIds.has(relation.to)
    ) {
      errors.push({
        code: 'INVALID_CATEGORY_REFERENCE',
        relationId: relation.id,
        from: relation.from,
        to: relation.to,
      });
    }
  }

  const hierarchyCycles = findHierarchyCycles(categoryRelations);

  for (const cycle of hierarchyCycles) {
    errors.push({
      code: 'CATEGORY_HIERARCHY_CYCLE',
      cycle,
    });
  }

  relations.push(...categoryRelations);
  
  const relationIds = new Set();
  const duplicateRelations = [];

  for (const relation of relations) {
    if (relationIds.has(relation.id)) {
      duplicateRelations.push(relation.id);
    }
    relationIds.add(relation.id);
  }

  if (duplicateRelations.length > 0) {
    errors.push({
      code: 'DUPLICATE_RELATIONS',
      relationIds: duplicateRelations,
    });
  }

  const recognizedEntities = entities.filter(
    (entity) => entity.typeRecognized,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: 'src/data/entities.yaml',

    policy: {
      modifiesSource: false,
      integratesWithGraph: false,
      relationMeaning:
        'INSTANCE_OF links an entity to a broad normalized type or a conservative name-derived category.',
      doesNotClaimHistoricalInteraction: true,
      doesNotClaimCausality: true,
    },

    statistics: {
      inputEntities: rawEntities.length,
      normalizedEntities: entities.length,
      recognizedTypes: recognizedEntities.length,
      unrecognizedTypes: entities.length - recognizedEntities.length,
      categories: categoryMap.size,
      generatedRelations: relations.length,
      hierarchyRelations: categoryRelations.length,
      hierarchyCycles: hierarchyCycles.length,
      errors: errors.length,
      warnings: warnings.length,
    },

    categories: [...categoryMap.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    ),

    entities: entities.sort((a, b) => a.id.localeCompare(b.id)),

    relations,

    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
  };
}

function main() {
  if (!fs.existsSync(ENTITY_FILE)) {
    throw new Error(`Не е намерен файлът: ${ENTITY_FILE}`);
  }

  const source = fs.readFileSync(ENTITY_FILE, 'utf8');
  const document = parse(source);
  const rawEntities = getEntityCollection(document);
  const report = buildReport(rawEntities);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(
    OUTPUT_FILE,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log('\nConcept Model v1');
  console.log('----------------');
  console.log(`Входни същности: ${report.statistics.inputEntities}`);
  console.log(`Разпознати типове: ${report.statistics.recognizedTypes}`);
  console.log(`Неразпознати типове: ${report.statistics.unrecognizedTypes}`);
  console.log(`Категории: ${report.statistics.categories}`);
  console.log(`Генерирани отношения: ${report.statistics.generatedRelations}`);
  console.log(`Грешки: ${report.statistics.errors}`);
  console.log(`Предупреждения: ${report.statistics.warnings}`);
  console.log(`Валиден отчет: ${report.validation.valid ? 'ДА' : 'НЕ'}`);
  console.log(`\nОтчет: ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);

  if (report.validation.errors.length > 0) {
    console.error('\nГрешки за преглед:');
    for (const error of report.validation.errors) {
      console.error(`- ${JSON.stringify(error)}`);
    }
    process.exitCode = 1;
  }

  if (report.validation.warnings.length > 0) {
    console.warn('\nПредупреждения за преглед:');
    for (const warning of report.validation.warnings) {
      console.warn(`- ${JSON.stringify(warning)}`);
    }
  }
}

export {
  normalizeType,
  inferNameCategories,
  getEntityCollection,
  normalizeEntity,
  buildReport,
  getAncestorCategories,
  findHierarchyCycles,
};

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}