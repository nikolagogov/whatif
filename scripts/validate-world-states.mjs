import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATES_DIR = join(ROOT, 'src', 'data', 'world-states');
const GRAPH_FILE = join(ROOT, 'src', 'data', 'content-graph.json');
const DEFINITIONS_FILE = join(ROOT, 'src', 'data', 'world-variable-definitions.yaml');

const ALLOWED_STATUSES = new Set([
  'CANON',
  'EDITORIAL',
  'DERIVED',
  'SIMULATED',
  'GENERATED',
  'USER',
]);

const errors = [];
const warnings = [];

function error(message) {
  errors.push(message);
}

function warning(message) {
  warnings.push(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readYaml(file) {
  try {
    const source = readFileSync(file, 'utf8');
    const document = YAML.parseDocument(source, { uniqueKeys: true });

    if (document.errors.length > 0) {
      for (const issue of document.errors) {
        error(`${relative(ROOT, file)}: ${issue.message}`);
      }
      return null;
    }

    return document.toJS();
  } catch (issue) {
    error(`${relative(ROOT, file)}: ${issue.message}`);
    return null;
  }
}

function getGraphNodes(graph) {
  if (Array.isArray(graph?.nodes)) return graph.nodes;
  if (isObject(graph?.nodes)) return Object.values(graph.nodes);
  return null;
}

function loadVariableDefinitions() {
  const document = readYaml(DEFINITIONS_FILE);

  if (!isObject(document)) {
    error('Variable definitions must have a YAML object as their root.');
    return new Map();
  }

  if (document.schemaVersion !== 1) {
    error('Variable definitions: schemaVersion must be 1.');
  }

  if (!Array.isArray(document.variables)) {
    error('Variable definitions: variables must be an array.');
    return new Map();
  }

  const definitions = new Map();

  for (const [index, definition] of document.variables.entries()) {
    const label = `Variable definitions: variables[${index}]`;

    if (!isObject(definition)) {
      error(`${label} must be an object.`);
      continue;
    }

    if (typeof definition.id !== 'string' || !definition.id.trim()) {
      error(`${label}.id must be a non-empty string.`);
      continue;
    }

    if (definitions.has(definition.id)) {
      error(`Duplicate variable definition ID "${definition.id}".`);
      continue;
    }

    if (typeof definition.label !== 'string' || !definition.label.trim()) {
      error(`${label}.label must be a non-empty string.`);
    }

    if (typeof definition.domain !== 'string' || !definition.domain.trim()) {
      error(`${label}.domain must be a non-empty string.`);
    }

    if (!['number', 'string', 'boolean', 'object', 'array'].includes(definition.valueType)) {
      error(`${label}.valueType must be number, string, boolean, object, or array.`);
    }

    if (definition.valueType === 'number') {
      if (definition.min !== undefined && typeof definition.min !== 'number') {
        error(`${label}.min must be a number.`);
      }

      if (definition.max !== undefined && typeof definition.max !== 'number') {
        error(`${label}.max must be a number.`);
      }

      if (
        typeof definition.min === 'number' &&
        typeof definition.max === 'number' &&
        definition.min > definition.max
      ) {
        error(`${label}.min cannot be greater than max.`);
      }
    }

    definitions.set(definition.id, definition);
  }

  return definitions;
}

function matchesValueType(value, valueType) {
  switch (valueType) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

function validateVariables(variables, definitions, label) {
  if (!Array.isArray(variables)) {
    error(`${label}: variables must be an array.`);
    return;
  }

  const seenKeys = new Set();

  variables.forEach((variable, index) => {
    const itemLabel = `${label}: variables[${index}]`;

    if (!isObject(variable)) {
      error(`${itemLabel} must be an object.`);
      return;
    }

    if (typeof variable.key !== 'string' || !variable.key.trim()) {
      error(`${itemLabel}.key must be a non-empty string.`);
      return;
    }

    if (seenKeys.has(variable.key)) {
      error(`${label}: duplicate variable key "${variable.key}".`);
      return;
    }

    seenKeys.add(variable.key);

    const definition = definitions.get(variable.key);

    if (!definition) {
      error(`${itemLabel}: unknown variable "${variable.key}". Add it to world-variable-definitions.yaml.`);
      return;
    }

    if (!Object.hasOwn(variable, 'value')) {
      error(`${itemLabel}: missing value.`);
    } else if (!matchesValueType(variable.value, definition.valueType)) {
      error(`${itemLabel}.value must have type "${definition.valueType}".`);
    } else if (definition.valueType === 'number') {
      if (typeof definition.min === 'number' && variable.value < definition.min) {
        error(`${itemLabel}.value is below the minimum (${definition.min}).`);
      }

      if (typeof definition.max === 'number' && variable.value > definition.max) {
        error(`${itemLabel}.value exceeds the maximum (${definition.max}).`);
      }
    }

    if (!ALLOWED_STATUSES.has(variable.status)) {
      error(`${itemLabel}: invalid or missing status. Allowed values: ${[...ALLOWED_STATUSES].join(', ')}.`);
    }

    if (
      variable.confidence !== undefined &&
      (
        typeof variable.confidence !== 'number' ||
        !Number.isFinite(variable.confidence) ||
        variable.confidence < 0 ||
        variable.confidence > 1
      )
    ) {
      error(`${itemLabel}.confidence must be a number between 0 and 1.`);
    }

    if (variable.rationale !== undefined && typeof variable.rationale !== 'string') {
      error(`${itemLabel}.rationale must be a string.`);
    }

    if (variable.evidence !== undefined && !Array.isArray(variable.evidence)) {
      error(`${itemLabel}.evidence must be an array.`);
    }
  });
}

function validateState(file, graphNodeMap, definitions) {
  const state = readYaml(file);
  if (state === null) return;

  const label = relative(ROOT, file);

  if (!isObject(state)) {
    error(`${label}: root must be a YAML object.`);
    return;
  }

  for (const field of [
    'schemaVersion',
    'id',
    'worldId',
    'divergenceId',
    'time',
    'status',
    'variables',
    'causedBy',
    'evidence',
  ]) {
    if (!(field in state)) {
      error(`${label}: missing required field "${field}".`);
    }
  }

  if (state.schemaVersion !== 1) {
    error(`${label}: schemaVersion must be 1.`);
  }

  if (typeof state.id !== 'string' || !state.id.trim()) {
    error(`${label}: id must be a non-empty string.`);
  }

  if (typeof state.worldId !== 'string' || !state.worldId.trim()) {
    error(`${label}: worldId must be a non-empty string.`);
  } else {
    const world = graphNodeMap.get(state.worldId);

    if (!world) {
      error(`${label}: worldId "${state.worldId}" was not found in the Content Graph.`);
    } else if (world.kind !== 'world') {
      error(`${label}: "${state.worldId}" exists but is not a world node.`);
    }
  }

  if (typeof state.divergenceId !== 'string' || !state.divergenceId.trim()) {
    error(`${label}: divergenceId must be a non-empty string.`);
  } else {
    const divergence = graphNodeMap.get(state.divergenceId);

    if (!divergence) {
      error(`${label}: divergenceId "${state.divergenceId}" was not found in the Content Graph.`);
    } else if (divergence.kind !== 'divergence') {
      error(`${label}: "${state.divergenceId}" exists but is not a divergence node.`);
    }
  }

  if (!ALLOWED_STATUSES.has(state.status)) {
    error(`${label}: invalid status "${state.status}". Allowed values: ${[...ALLOWED_STATUSES].join(', ')}.`);
  }

  if (!isObject(state.time)) {
    error(`${label}: time must be an object.`);
  } else {
    if (
      state.time.year !== null &&
      state.time.year !== undefined &&
      !Number.isInteger(state.time.year)
    ) {
      error(`${label}: time.year must be an integer or null.`);
    }

    if (typeof state.time.label !== 'string') {
      error(`${label}: time.label must be a string.`);
    }

    if (typeof state.time.precision !== 'string' || !state.time.precision.trim()) {
      error(`${label}: time.precision must be a non-empty string.`);
    }
  }

  if (state.description !== undefined && typeof state.description !== 'string') {
    error(`${label}: description must be a string.`);
  }

  validateVariables(state.variables, definitions, label);

  if (Array.isArray(state.causedBy)) {
    state.causedBy.forEach((eventId, index) => {
      if (typeof eventId !== 'string' || !eventId.trim()) {
        error(`${label}: causedBy[${index}] must be a non-empty event ID string.`);
      } else {
        const event = graphNodeMap.get(eventId);

        if (!event) {
          error(`${label}: causedBy references unknown graph node "${eventId}".`);
        } else if (event.kind !== 'timeline-event') {
          error(`${label}: causedBy reference "${eventId}" is not a timeline-event node.`);
        }
      }
    });
  } else {
    error(`${label}: causedBy must be an array.`);
  }

  if (Array.isArray(state.evidence)) {
    state.evidence.forEach((item, index) => {
      if (!isObject(item)) {
        error(`${label}: evidence[${index}] must be an object.`);
      }
    });
  } else {
    error(`${label}: evidence must be an array.`);
  }
}

function printResults() {
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  for (const message of errors) {
    console.error(`ERROR: ${message}`);
  }

  for (const message of warnings) {
    console.warn(`WARNING: ${message}`);
  }

  if (errors.length === 0) {
    console.log('\n✓ World State validation passed.');
  } else {
    console.error('\n✗ World State validation failed.');
  }
}

function main() {
  console.log('\nHAD IT GONE — World Model Validation\n');

  for (const [file, description] of [
    [STATES_DIR, 'World State directory'],
    [GRAPH_FILE, 'Content Graph'],
    [DEFINITIONS_FILE, 'Variable definitions'],
  ]) {
    if (!existsSync(file)) {
      error(`${description} not found: ${relative(ROOT, file)}`);
    }
  }

  if (errors.length > 0) {
    printResults();
    process.exitCode = 1;
    return;
  }

  let graph;

  try {
    graph = JSON.parse(readFileSync(GRAPH_FILE, 'utf8'));
  } catch (issue) {
    error(`Could not parse Content Graph JSON: ${issue.message}`);
    printResults();
    process.exitCode = 1;
    return;
  }

  const nodes = getGraphNodes(graph);

  if (!nodes) {
    error('Content Graph does not contain a valid nodes collection.');
    printResults();
    process.exitCode = 1;
    return;
  }

  const graphNodeMap = new Map();

  for (const node of nodes) {
    if (node && typeof node.id === 'string') {
      graphNodeMap.set(node.id, node);
    }
  }

  const definitions = loadVariableDefinitions();

  const files = readdirSync(STATES_DIR)
    .filter((name) => /\.(yaml|yml)$/i.test(name))
    .map((name) => join(STATES_DIR, name));

  if (files.length === 0) {
    warning('No YAML files found in src/data/world-states/.');
  }

  const stateIds = new Map();

  for (const file of files) {
    const state = readYaml(file);

    if (isObject(state) && typeof state.id === 'string' && state.id.trim()) {
      const previous = stateIds.get(state.id);

      if (previous) {
        error(
          `Duplicate World State ID "${state.id}" in ` +
          `${relative(ROOT, previous)} and ${relative(ROOT, file)}.`
        );
      } else {
        stateIds.set(state.id, file);
      }
    }

    validateState(file, graphNodeMap, definitions);
  }

  console.log(`World State files: ${files.length}`);
  console.log(`Content Graph nodes: ${nodes.length}`);
  console.log(`Variable definitions: ${definitions.size}`);

  printResults();

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();