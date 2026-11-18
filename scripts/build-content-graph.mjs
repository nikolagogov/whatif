/**
 * Build the HAD IT GONE Content Graph.
 *
 * Sources:
 * - Markdown content under src/content/
 * - src/data/entities.yaml
 * - World State and World Transition definitions
 *
 * Output:
 * - src/data/content-graph.json
 *
 * Usage:
 *   npm run graph:build
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
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
import { normalizeTime } from '../src/lib/timeline/time.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const CONTENT_ROOT = join(ROOT, 'src', 'content');
const REGISTRY_FILE = join(ROOT, 'src', 'data', 'entities.yaml');
const OUTPUT_FILE = join(ROOT, 'src', 'data', 'content-graph.json');

const RELATIONSHIP_TYPES_FILE = join(
  ROOT,
  'src',
  'data',
  'relationship-types.yaml'
);

const WORLD_STATES_DIR = join(
  ROOT,
  'src',
  'data',
  'world-states'
);

const WORLD_TRANSITIONS_FILE = join(
  ROOT,
  'src',
  'data',
  'world-transitions.yaml'
);

const SECTORS = ['history', 'science', 'space', 'society'];

const errors = [];
const warnings = [];
const nodes = new Map();
const edges = [];
const articles = [];

function extractFrontmatter(content) {
  const match = content.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
  );

  return match ? match[1] : null;
}


function walk(dir, extensions = ['.md']) {
  if (!existsSync(dir)) return [];

  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...walk(fullPath, extensions));
    } else if (
      extensions.includes(extname(entry).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

function loadRelationshipRegistry() {
  if (!existsSync(RELATIONSHIP_TYPES_FILE)) {
    addError(
      'Missing registry file: src/data/relationship-types.yaml'
    );

    return new Map();
  }

  try {
    const registry = parseYaml(
      readFileSync(RELATIONSHIP_TYPES_FILE, 'utf8')
    );

    if (
      !registry ||
      !Array.isArray(registry.relationships)
    ) {
      addError(
        'relationship-types.yaml must contain a "relationships" array.'
      );

      return new Map();
    }

    const definitions = new Map();

    for (const definition of registry.relationships) {
      if (
        !definition ||
        typeof definition.id !== 'string' ||
        !definition.id.trim() ||
        !Array.isArray(definition.from) ||
        !Array.isArray(definition.to) ||
        definition.from.length === 0 ||
        definition.to.length === 0
      ) {
        addError(
          'Invalid relationship definition in relationship-types.yaml.'
        );

        continue;
      }

      if (definitions.has(definition.id)) {
        addError(
          `Duplicate relationship type "${definition.id}".`
        );

        continue;
      }

      definitions.set(definition.id, definition);
    }

    return definitions;
  } catch (error) {
    addError(
      `Relationship registry YAML parse error: ${error.message}`
    );

    return new Map();
  }
}

const relationshipDefinitions = loadRelationshipRegistry();

function addNode(node, { mergeEntity = false } = {}) {
  const existing = nodes.get(node.id);

  if (!existing) {
    nodes.set(node.id, node);
    return;
  }

  // Merge registry entities and article entity definitions.
  if (
    existing.kind === 'entity' &&
    node.kind === 'entity' &&
    mergeEntity
  ) {
    existing.articles = [
      ...new Set([
        ...(existing.articles ?? []),
        ...(node.articles ?? []),
      ]),
    ];

    if (!existing.aliases?.length && node.aliases?.length) {
      existing.aliases = node.aliases;
    }

    if (
      (!existing.label || existing.label === existing.id) &&
      node.label
    ) {
      existing.label = node.label;
    }

    return;
  }

  // Reuse worlds and divergences referenced by multiple articles.
  if (
    existing.kind === node.kind &&
    ['world', 'divergence'].includes(node.kind)
  ) {
    existing.articles = [
      ...new Set([
        ...(existing.articles ?? []),
        ...(node.articles ?? []),
      ]),
    ];

    return;
  }

  addError(
    `Duplicate graph node ID "${node.id}" ` +
    `(kinds: ${existing.kind}, ${node.kind}).`
  );
}

function addEdge(edge) {
  edges.push(edge);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}


function humanizeNodeId(id) {
  return String(id ?? '')
    .replace(/^article:[^/]+\//, '')
    .replace(
      /^(world-state|world-transition|transition|divergence|timeline-event|event|world)-/,
      ''
    )
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim();
}

function resolveNodeLabel(...candidates) {
  const label = candidates.find(
    value => typeof value === 'string' && value.trim()
  );

  return label ? label.trim() : '';
}

function articleNodeId(sector, articleId) {
  return `article:${sector}/${articleId}`;
}

function resolveRelatedArticle(reference) {
  const normalized = reference.replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/');

  if (parts.length === 2 && SECTORS.includes(parts[0])) {
    const [sector, articleReference] = parts;

    // Sector-qualified references use the public article slug (filename),
    // while graph nodes use the stable Article ID from frontmatter.
    const matches = articles.filter(
      item =>
        item.sector === sector &&
        (
          item.id === articleReference ||
          basename(item.path, extname(item.path)) === articleReference
        )
    );

    // Do not guess if a reference matches more than one article.
    if (matches.length !== 1) return null;

    return matches[0].graphId;
  }

  if (parts.length !== 1) return null;

  const matches = articles.filter(
    item => item.id === parts[0]
  );

  // A bare article ID is only resolvable when unique.
  if (matches.length !== 1) return null;

  return matches[0].graphId;
}

function loadEntityRegistry() {
  if (!existsSync(REGISTRY_FILE)) {
    addWarning('Entity registry not found.');
    return [];
  }

  try {
    const parsed = parseYaml(
      readFileSync(REGISTRY_FILE, 'utf8')
    );

    if (Array.isArray(parsed)) return parsed;

    if (Array.isArray(parsed?.entities)) {
      return parsed.entities;
    }

    addWarning(
      'Entity registry does not contain an entities array.'
    );

    return [];
  } catch (error) {
    addError(
      `Entity registry YAML parse error: ${error.message}`
    );

    return [];
  }
}

function loadArticleFiles() {
  const seenPaths = new Set();
  const seenGraphIds = new Map();

  for (const sector of SECTORS) {
    const sectorRoot = join(CONTENT_ROOT, sector);

    for (const file of walk(sectorRoot)) {
      const articlePath = relative(ROOT, file).replace(/\\/g, '/');

      // Defensive: same physical file should never be processed twice.
      if (seenPaths.has(articlePath)) {
        addError(
          `Article file processed twice: ${articlePath}`
        );
        continue;
      }
      seenPaths.add(articlePath);

      const content = readFileSync(file, 'utf8');
      const rawFrontmatter = extractFrontmatter(content);

      if (!rawFrontmatter) {
        addWarning(
          `Missing frontmatter: ${articlePath}`
        );
        continue;
      }

      let fm;

      try {
        fm = parseYaml(rawFrontmatter);
      } catch (error) {
        addError(
          `Frontmatter YAML parse error in ${articlePath}: ` +
          error.message
        );
        continue;
      }

      if (!fm || typeof fm !== 'object') {
        addWarning(
          `Invalid frontmatter: ${articlePath}`
        );
        continue;
      }

      const id = String(
        fm.id ?? basename(file, extname(file))
      );

      const graphArticleId = articleNodeId(sector, id);

      // Detect duplicate graph IDs across files.
      if (seenGraphIds.has(graphArticleId)) {
        addError(
          `Article ID collision: "${graphArticleId}" used by both ` +
          `"${seenGraphIds.get(graphArticleId)}" and "${articlePath}".`
        );
      } else {
        seenGraphIds.set(graphArticleId, articlePath);
      }

      const title = resolveNodeLabel(
        fm.title,
        humanizeNodeId(id)
      );

      const article = {
        id,
        sector,
        graphId: graphArticleId,
        title,
        path: articlePath,
        frontmatter: fm,
      };

      articles.push(article);
    }
  }
}

function buildArticleNodes() {
  for (const article of articles) {
    const {
      id,
      sector,
      graphId,
      title,
      path,
      frontmatter: fm,
    } = article;

    addNode({
      id: graphId,
      kind: 'article',
      type: 'ARTICLE',
      label: title,
      title,
      sector,
      path,
      articles: [path],
    });

    // Article -> world
    if (fm.world?.id) {
      const world = fm.world;

      addNode({
        id: String(world.id),
        kind: 'world',
        type: 'WORLD',
        label: resolveNodeLabel(
          world.name,
          world.title,
          humanizeNodeId(world.id)
        ),
        articles: [path],
      }, { mergeEntity: false });

      addEdge({
        id: `contains-world:${graphId}:${world.id}`,
        type: 'HAS_WORLD',
        from: graphId,
        to: String(world.id),
        article: graphId,
      });
    }

    // Article -> divergence
    if (fm.divergence?.id) {
      const divergence = fm.divergence;

      addNode({
        id: String(divergence.id),
        kind: 'divergence',
        type: 'DIVERGENCE',
        label: resolveNodeLabel(
          divergence.name,
          divergence.title,
          humanizeNodeId(divergence.id)
        ),
        articles: [path],
      });

      addEdge({
        id: `contains-divergence:${graphId}:${divergence.id}`,
        type: 'HAS_DIVERGENCE',
        from: graphId,
        to: String(divergence.id),
        article: graphId,
      });
    }

    // Article -> related articles
    const related = asArray(fm.related);

    for (const reference of related) {
      const targetReference =
        typeof reference === 'string'
          ? reference
          : reference?.id;

      if (!targetReference) continue;

      const target = resolveRelatedArticle(
        String(targetReference)
      );

      if (!target) {
        addWarning(
          `Unresolved related article "${targetReference}" ` +
          `in ${path}.`
        );
        continue;
      }

      addEdge({
        id: `related:${graphId}:${target}`,
        type: 'RELATED_ARTICLE',
        from: graphId,
        to: target,
        article: graphId,
      });
    }
  }
}

function loadWorldStates() {
  if (!existsSync(WORLD_STATES_DIR)) {
    addWarning('World states directory not found.');
    return [];
  }

  const files = walk(
  WORLD_STATES_DIR,
  ['.yaml', '.yml', '.json']
);

  const states = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const state = extname(file).toLowerCase() === '.json'
        ? JSON.parse(content)
        : parseYaml(content);

      const entries = Array.isArray(state)
        ? state
        : Array.isArray(state?.states)
          ? state.states
          : [state];

      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          states.push({
            ...entry,
            _source: relative(ROOT, file).replace(/\\/g, '/'),
          });
        }
      }
    } catch (error) {
      addError(
        `World state parse error in ${relative(ROOT, file)}: ` +
        error.message
      );
    }
  }

  return states;
}

function buildWorldStateNodes() {
  for (const state of loadWorldStates()) {
    if (!state.id) {
      addWarning(
        `World state without ID in ${state._source}.`
      );
      continue;
    }

    const id = String(state.id);
    const worldId = state.worldId ?? state.world ?? null;
    const divergenceId = state.divergenceId ?? null;

    addNode({
      id,
      kind: 'world-state',
      type: 'WORLD_STATE',
      label: resolveNodeLabel(
        state.name,
        state.title,
        humanizeNodeId(id)
      ),
      world: worldId,
      divergence: divergenceId,
      time: normalizeTime(state.time ?? state.date),
      description: state.description ?? null,
      status: state.status ?? null,
      variables: state.variables ?? [],
      causedBy: Array.isArray(state.causedBy)
        ? state.causedBy
        : [],
      source: state._source,
    });

    if (typeof worldId === 'string' && worldId) {
      addEdge({
        id: `world-state-world:${id}:${worldId}`,
        type: 'STATE_OF_WORLD',
        from: id,
        to: worldId,
      });
    }

    if (
      typeof divergenceId === 'string' &&
      divergenceId
    ) {
      addEdge({
        id: `world-state-divergence:${id}:${divergenceId}`,
        type: 'STATE_OF_DIVERGENCE',
        from: id,
        to: divergenceId,
      });
    }
  
    const causedBy = Array.isArray(state.causedBy)
      ? state.causedBy
      : state.causedBy
        ? [state.causedBy]
        : [];

    for (const cause of causedBy) {
      const eventId =
        typeof cause === 'string'
          ? cause
          : cause?.id;

      if (typeof eventId !== 'string' || !eventId) {
        addWarning(
          `Invalid causedBy reference in world state "${id}".`
        );
        continue;
      }

      addEdge({
        id: `world-state-caused-by:${id}:${eventId}`,
        type: 'STATE_CAUSED_BY',
        from: id,
        to: eventId,
      });
    }
  }
}

function loadWorldTransitions() {
  if (!existsSync(WORLD_TRANSITIONS_FILE)) {
    addWarning('World transitions file not found.');
    return [];
  }

  try {
    const parsed = parseYaml(
      readFileSync(WORLD_TRANSITIONS_FILE, 'utf8')
    );

    if (Array.isArray(parsed)) return parsed;

    if (Array.isArray(parsed?.transitions)) {
      return parsed.transitions;
    }

    addWarning(
      'World transitions file does not contain a transitions array.'
    );

    return [];
  } catch (error) {
    addError(
      `World transitions YAML parse error: ${error.message}`
    );

    return [];
  }
}


function buildWorldTransitionNodes() {
  for (const transition of loadWorldTransitions()) {
    if (!transition?.id) {
      addWarning('World transition without ID.');
      continue;
    }

    const id = String(transition.id);
    const fromStateId =
      transition.fromStateId ?? transition.from ?? null;
    const toStateId =
      transition.toStateId ?? transition.to ?? null;
    const eventId = transition.eventId ?? null;

    addNode({
      id,
      kind: 'world-transition',
      type: 'WORLD_TRANSITION',
      label: resolveNodeLabel(
        transition.label,
        transition.name,
        transition.title,
        humanizeNodeId(id)
      ),
      world: transition.worldId ?? null,
      fromStateId,
      toStateId,
      eventId,
      changes: transition.changes ?? [],
      time: normalizeTime(transition.time),
      description: transition.description ?? null,
      source: 'src/data/world-transitions.yaml',
    });

    if (typeof fromStateId === 'string' && fromStateId) {
      addEdge({
        id: `transition-from-state:${id}:${fromStateId}`,
        type: 'TRANSITION_FROM_STATE',
        from: id,
        to: fromStateId,
      });
    }

    if (typeof toStateId === 'string' && toStateId) {
      addEdge({
        id: `transition-to-state:${id}:${toStateId}`,
        type: 'TRANSITION_TO_STATE',
        from: id,
        to: toStateId,
      });
    }

    if (typeof eventId === 'string' && eventId) {
      addEdge({
        id: `transition-triggered-by:${id}:${eventId}`,
        type: 'TRANSITION_TRIGGERED_BY',
        from: id,
        to: eventId,
      });
    }
  }
}

function buildTimelineEventNodes() {
  for (const article of articles) {
    const fm = article.frontmatter;
    const timeline = asArray(fm.timeline);

    for (const event of timeline) {
      if (!event || typeof event !== 'object') continue;

      if (!event.id) {
        addWarning(
          `Timeline event without ID in ${article.path}.`
        );
        continue;
      }

      const id = String(event.id);

      addNode({
        id,
        kind: 'timeline-event',
        type: 'TIMELINE_EVENT',
        label: resolveNodeLabel(
          event.name,
          event.title,
          event.label,
          humanizeNodeId(id)
        ),
        time: normalizeTime(event.date ?? event.time),
        description: event.description ?? null,
        article: article.graphId,
      });

      addEdge({
        id: `article-timeline-event:${article.graphId}:${id}`,
        type: 'HAS_TIMELINE_EVENT',
        from: article.graphId,
        to: id,
        article: article.graphId,
      });
    }
  }
}

function buildArticleRelationshipEdges() {
  for (const article of articles) {
    const relationships = asArray(article.frontmatter.relationships);

    for (const relationship of relationships) {
      if (
        !relationship ||
        typeof relationship.type !== 'string' ||
        typeof relationship.from !== 'string' ||
        typeof relationship.to !== 'string'
      ) {
        addWarning(
          `Invalid relationship in ${article.path}: type, from and to are required.`
        );
        continue;
      }

      const edge = {
        id: `article-relationship:${article.graphId}:${relationship.type}:${relationship.from}:${relationship.to}`,
        type: relationship.type,
        from: relationship.from,
        to: relationship.to,
        article: article.graphId,
        evidence: article.path,
      };

      if (typeof relationship.label === 'string' && relationship.label.trim()) {
        edge.label = relationship.label.trim();
      }

      addEdge(edge);
    }
  }
}

function buildEntityNodes() {
  const entities = loadEntityRegistry();

  for (const entity of entities) {
    if (!entity?.id) {
      addWarning('Entity without ID in registry.');
      continue;
    }

    const id = String(entity.id);

    addNode({
      id,
      kind: 'entity',
      type: 'ENTITY',
      label: resolveNodeLabel(
        entity.name,
        entity.title,
        entity.label,
        humanizeNodeId(id)
      ),
      aliases: asArray(entity.aliases),
      articles: [],
    }, { mergeEntity: true });
  }

  for (const article of articles) {
    const fm = article.frontmatter;
    const references = asArray(fm.entities);
    const entityIdsInArticle = new Set();

    for (const reference of references) {
      const entityId =
        typeof reference === 'string'
          ? reference
          : reference?.id;

      if (!entityId) continue;

      const id = String(entityId);

      if (!nodes.has(id)) {
        addWarning(
          `Entity "${id}" referenced by ${article.path} ` +
          'but not found in registry.'
        );

        continue;
      }

      const entityNode = nodes.get(id);
      if (entityNode.kind !== 'entity') continue;

      entityNode.articles = [
        ...new Set([
          ...(entityNode.articles ?? []),
          article.path,
        ]),
      ];

      addEdge({
        id: `article-entity:${article.graphId}:${id}`,
        type: 'MENTIONS_ENTITY',
        from: article.graphId,
        to: id,
        article: article.graphId,
      });

      entityIdsInArticle.add(id);
    }

    // Contextual links are evidence of co-mention, not claims of a direct
    // historical relationship. The article is retained as the evidence source.
    const ids = [...entityIdsInArticle].sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        addEdge({
          id: `context:${article.graphId}:${ids[i]}:${ids[j]}`,
          type: 'CO_MENTIONED_IN_ARTICLE',
          from: ids[i],
          to: ids[j],
          article: article.graphId,
          contextual: true,
          evidence: article.path,
        });
      }
    }
  }
}

function validateEdges() {
  const seenEdgeIds = new Set();

  for (const edge of edges) {
    if (seenEdgeIds.has(edge.id)) {
      addError(`Duplicate graph edge ID "${edge.id}".`);
    }

    seenEdgeIds.add(edge.id);

    if (!nodes.has(edge.from)) {
      addError(
        `Edge "${edge.id}" references missing source node "${edge.from}".`
      );
    }

    if (!nodes.has(edge.to)) {
      addError(
        `Edge "${edge.id}" references missing target node "${edge.to}".`
      );
    }

    const definition = relationshipDefinitions.get(edge.type);

    if (!definition) {
      addWarning(
        `Relationship type "${edge.type}" is not registered.`
      );
      continue;
    }

    const sourceNode = nodes.get(edge.from);
    const targetNode = nodes.get(edge.to);

    if (
      sourceNode &&
      !definition.from.includes(sourceNode.kind)
    ) {
      addWarning(
        `Relationship "${edge.type}" may not allow source kind ` +
        `"${sourceNode.kind}" (${edge.from}).`
      );
    }

    if (
      targetNode &&
      !definition.to.includes(targetNode.kind)
    ) {
      addWarning(
        `Relationship "${edge.type}" may not allow target kind ` +
        `"${targetNode.kind}" (${edge.to}).`
      );
    }
  }
}


function reportAutomaticTransitionCandidates() {
  const graphNodes = [...nodes.values()];

  const states = graphNodes.filter(
    node => node.kind === 'world-state'
  );

  const events = new Map(
    graphNodes
      .filter(node => node.kind === 'timeline-event')
      .map(node => [node.id, node])
  );

  const existingTargets = new Set(
    graphNodes
      .filter(node => node.kind === 'world-transition')
      .map(node => node.toStateId)
      .filter(Boolean)
  );

  const categories = {
    chronological: [],
    review: [],
    explicit: [],
  };

  const skipped = [];

  for (const target of states) {
    if (existingTargets.has(target.id)) {
      categories.explicit.push({
        state: target.id,
        reason: 'Already has an explicit transition.',
      });
      continue;
    }

    const causes = Array.isArray(target.causedBy)
      ? target.causedBy
      : [];

    if (causes.length !== 1) {
      skipped.push({
        state: target.id,
        reason: causes.length === 0
          ? 'No explicit cause.'
          : 'Multiple causes require review.',
      });
      continue;
    }

    const eventId = causes[0];

    if (
      typeof eventId !== 'string' ||
      !events.has(eventId)
    ) {
      skipped.push({
        state: target.id,
        reason: 'Cause does not resolve to a timeline event.',
      });
      continue;
    }

    const targetYear = Number.isFinite(target.time?.year)
      ? target.time.year
      : Number.isFinite(target.time?.startYear) &&
          Number.isFinite(target.time?.endYear) &&
          target.time.startYear === target.time.endYear
        ? target.time.startYear
        : null;

    if (!Number.isFinite(targetYear)) {
      skipped.push({
        state: target.id,
        reason: 'Target state has no numeric year.',
      });
      continue;
    }

    const previousStates = states.filter(state =>
      state.id !== target.id &&
      state.world === target.world &&
      state.divergence === target.divergence &&
      Number.isFinite(state.time?.year ?? state.time?.endYear) &&
      (state.time?.year ?? state.time.endYear) < targetYear
    );

    if (previousStates.length === 0) {
      skipped.push({
        state: target.id,
        reason: 'No earlier state in the same world and divergence.',
      });
      continue;
    }

    const latestPreviousYear = Math.max(
      ...previousStates.map(
        state => state.time?.year ?? state.time.endYear
      )
    );

    const nearestStates = previousStates.filter(
      state => (state.time?.year ?? state.time?.endYear) === latestPreviousYear
    );

    if (nearestStates.length !== 1) {
      skipped.push({
        state: target.id,
        reason: 'Multiple equally near previous states.',
      });
      continue;
    }

    const source = nearestStates[0];
    const event = events.get(eventId);

    const sourceVariables = new Map(
      (source.variables ?? []).map(variable => [
        variable.key,
        variable.value,
      ])
    );

    const targetVariables = new Map(
      (target.variables ?? []).map(variable => [
        variable.key,
        variable.value,
      ])
    );

    const sharedVariableKeys = [...sourceVariables.keys()]
      .filter(key => targetVariables.has(key));

    const changedVariables = sharedVariableKeys.filter(
      key =>
        JSON.stringify(sourceVariables.get(key)) !==
        JSON.stringify(targetVariables.get(key))
    );

    const eventYear = event.time?.year;
    const eventYearKnown = Number.isFinite(eventYear);

    const eventMatchesTargetYear =
      eventYearKnown && eventYear === targetYear;

    const candidate = {
      fromStateId: source.id,
      toStateId: target.id,
      eventId,
      yearFrom: source.time.year,
      yearTo: targetYear,
      eventTime: event.time ?? null,
      sharedVariables: sharedVariableKeys,
      changedVariables,
    };

    if (
      sharedVariableKeys.length > 0 &&
      changedVariables.length > 0 &&
      eventMatchesTargetYear
    ) {
      categories.explicit.push({
        ...candidate,
        reason: 'Shared variables changed and event year matches target year.',
      });
    } else {
      categories.chronological.push({
        ...candidate,
        reason: !eventMatchesTargetYear
          ? 'Event year does not exactly match target year.'
          : 'Insufficient shared variable evidence for a state transition.',
      });
    }
  }

  console.log('');
  console.log('Automatic World Transition Analysis');
  console.log('-----------------------------------');
  console.log(`States analysed: ${states.length}`);
  console.log(`Chronological candidates: ${categories.chronological.length}`);
  console.log(`Explicit transition records: ${categories.explicit.length}`);
  console.log(`Skipped for editorial review: ${skipped.length}`);

  for (const [category, items] of Object.entries(categories)) {
    console.log('');
    console.log(`${category.toUpperCase()}:`);

    for (const item of items) {
      console.log(
        `- ${item.fromStateId ?? item.state} -> ${item.toStateId ?? ''}` +
        ` | ${item.eventId ?? ''}` +
        ` | ${item.reason}`
      );
    }
  }

  console.log('');
  console.log('SKIPPED:');

  for (const item of skipped) {
    console.log(`- ${item.state}: ${item.reason}`);
  }

  return { categories, skipped };
}

function main() {
  if (!existsSync(CONTENT_ROOT)) {
    addError(
      `Content directory not found: ${CONTENT_ROOT}`
    );
  }

  loadArticleFiles();

  buildArticleNodes();
  buildWorldStateNodes();
  buildWorldTransitionNodes();
  buildTimelineEventNodes();
  buildArticleRelationshipEdges();
  buildEntityNodes();

  reportAutomaticTransitionCandidates();

  validateEdges();  

  const graphNodes = [...nodes.values()];

  const graph = {
    generatedAt: new Date().toISOString(),
    stats: {
      nodes: graphNodes.length,
      edges: edges.length,
      articles: articles.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    nodes: graphNodes,
    edges,
    errors,
    warnings,
  };

  writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(graph, null, 2) + '\n',
    'utf8'
  );

  console.log('');
  console.log('Content Graph build complete.');
  console.log(`Nodes: ${graphNodes.length}`);
  console.log(`Edges: ${edges.length}`);
  console.log(`Articles: ${articles.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Output: ${relative(ROOT, OUTPUT_FILE)}`);

  if (warnings.length > 0) {
    console.log('');
    console.log('Warnings:');

    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length > 0) {
    console.error('');
    console.error('Errors:');

    for (const error of errors) {
      console.error(`- ${error}`);
    }

    process.exitCode = 1;
  }
}

main();
