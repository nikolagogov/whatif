
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeType,
  inferNameCategories,
  normalizeEntity,
  buildReport,
  getAncestorCategories,
  findHierarchyCycles,
} from './concept-model-v1.mjs';

test('уеднаквява STATE и POLITY като политически същности', () => {
  assert.equal(normalizeType('STATE').normalized, 'POLITICAL_ENTITY');
  assert.equal(normalizeType('POLITY').normalized, 'POLITICAL_ENTITY');
  assert.equal(normalizeType('country').normalized, 'POLITICAL_ENTITY');
});

test('нормализира historical-figure до PERSON', () => {
  assert.equal(normalizeType('historical-figure').normalized, 'PERSON');
});

test('разпознава империя по името, когато типът го позволява', () => {
  const categories = inferNameCategories(
    'Ottoman Empire',
    'POLITICAL_ENTITY',
  );

  assert.ok(categories.some((item) => item.code === 'EMPIRE'));
});

test('не класифицира република като империя', () => {
  const categories = inferNameCategories(
    'Roman Republic',
    'POLITICAL_ENTITY',
  );

  assert.ok(categories.some((item) => item.code === 'REPUBLIC'));
  assert.ok(!categories.some((item) => item.code === 'EMPIRE'));
});

test('не извежда категория EMPIRE от тип PERSON', () => {
  const categories = inferNameCategories(
    'Person named Empire',
    'PERSON',
  );

  assert.ok(!categories.some((item) => item.code === 'EMPIRE'));
});

test('запазва оригиналното ID и генерира категориални отношения', () => {
  const report = buildReport([
    { id: 'entity-macedon', name: 'Macedonian Empire', type: 'STATE' },
    { id: 'polity-ottoman-empire', name: 'Ottoman Empire', type: 'POLITY' },
  ]);

  assert.ok(
    report.entities.some((entity) => entity.id === 'entity-macedon'),
  );

  assert.ok(
    report.relations.some(
      (relation) =>
        relation.from === 'entity-macedon' &&
        relation.to === 'category-empire' &&
        relation.type === 'INSTANCE_OF',
    ),
  );

  assert.ok(
    report.relations.some(
      (relation) =>
        relation.from === 'polity-ottoman-empire' &&
        relation.to === 'category-empire' &&
        relation.type === 'INSTANCE_OF',
    ),
  );

  // Общата категория не създава директна връзка между двете империи.
  assert.ok(
    !report.relations.some(
      (relation) =>
        relation.from === 'entity-macedon' &&
        relation.to === 'polity-ottoman-empire',
    ),
  );
});

test('открива дублирани ID', () => {
  const report = buildReport([
    { id: 'same-id', name: 'First', type: 'PERSON' },
    { id: 'same-id', name: 'Second', type: 'PERSON' },
  ]);

  assert.ok(
    report.validation.errors.some(
      (error) => error.code === 'DUPLICATE_ID',
    ),
  );
});

test('неразпознат тип се отбелязва, без да се прикрива', () => {
  const entity = normalizeEntity({
    id: 'test-entity',
    name: 'Test Entity',
    type: 'SOME_UNKNOWN_TYPE',
  }, 0);

  assert.equal(entity.typeRecognized, false);
  assert.equal(entity.normalizedType, 'SOME_UNKNOWN_TYPE');
});

test('наследява родителска категория през йерархията', () => {
  const relations = [
    {
      from: 'category-empire',
      to: 'category-political_entity',
      type: 'SUBCATEGORY_OF',
    },
    {
      from: 'category-political_entity',
      to: 'category-social_entity',
      type: 'SUBCATEGORY_OF',
    },
  ];

  assert.deepEqual(
    getAncestorCategories('category-empire', relations),
    ['category-political_entity', 'category-social_entity'],
  );
});

test('открива цикъл в йерархията на категориите', () => {
  const relations = [
    {
      from: 'category-empire',
      to: 'category-political_entity',
      type: 'SUBCATEGORY_OF',
    },
    {
      from: 'category-political_entity',
      to: 'category-empire',
      type: 'SUBCATEGORY_OF',
    },
  ];

  assert.ok(findHierarchyCycles(relations).length > 0);
});