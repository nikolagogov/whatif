
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const file = path.join(
  root,
  'src/data/concept-model-v1-report.json',
);

const report = JSON.parse(fs.readFileSync(file, 'utf8'));

const targets = [
  'entity-macedon',
  'polity-ottoman-empire',
];

const romanRepublics = report.entities.filter((entity) =>
  /roman republic/i.test(entity.name ?? ''),
);

console.log('\n=== Търсене на Римската република ===');

for (const entity of romanRepublics) {
  console.log({
    id: entity.id,
    name: entity.name,
    type: entity.normalizedType,
    categories: entity.categories.map((category) => category.code),
  });
}

console.log('\n=== Проверка на същностите ===');

for (const id of targets) {
  const entity = report.entities.find((item) => item.id === id);

  if (!entity) {
    console.log(`\nНЕ Е НАМЕРЕНА: ${id}`);
    continue;
  }

  console.log(`\n${entity.name} (${entity.id})`);
  console.log(`Тип: ${entity.normalizedType}`);
  console.log('Категории:', entity.categories.map((c) => c.code).join(', '));

  const directRelations = report.relations.filter(
    (relation) =>
      relation.from === entity.id &&
      relation.type === 'INSTANCE_OF',
  );

  for (const relation of directRelations) {
    console.log(`  INSTANCE_OF → ${relation.to}`);
  }
}

console.log('\n=== Йерархия ===');

for (const relation of report.relations.filter(
  (item) => item.type === 'SUBCATEGORY_OF',
)) {
  console.log(`${relation.from} → ${relation.to}`);
}

console.log('\n=== Проверка на директни исторически връзки ===');

const directEmpireLink = report.relations.some(
  (relation) =>
    relation.from === 'entity-macedon' &&
    relation.to === 'polity-ottoman-empire',
);

console.log(
  'Директна връзка между Македонската и Османската империя:',
  directEmpireLink ? 'ИМА' : 'НЯМА (очаквано)',
);