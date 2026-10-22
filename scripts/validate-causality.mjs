
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const ROOT = process.cwd();

const PATHS = {
  graph: path.join(ROOT, "src", "data", "content-graph.json"),
  relationships: path.join(
    ROOT,
    "src",
    "data",
    "relationship-types.yaml"
  ),
};

const errors = [];
const warnings = [];

const CAUSAL_TYPES = new Set(["causes", "results_in"]);

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Converts supported historical date strings into an interval.
 * Years use astronomical numbering internally:
 * 1 BC = year 0, 2 BC = year -1.
 *
 * Returns null when the date cannot be interpreted reliably.
 */
function parseHistoricalDate(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const text = String(value).trim();

  if (!text) return null;

  // Exact year: 48 BC, 476 AD, 476 CE, 1200
  const exactYear = text.match(
    /^(\d{1,4})\s*(BC|BCE|AD|CE)?$/i
  );

  if (exactYear) {
    const year = Number(exactYear[1]);
    const era = (exactYear[2] ?? "CE").toUpperCase();

    if (year < 1) return null;

    const normalized =
      era === "BC" || era === "BCE" ? 1 - year : year;

    return { start: normalized, end: normalized };
  }

  // Century: 2nd century AD, 3rd century, 1st century BC
  const century = text.match(
    /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+century(?:\s+(BC|BCE|AD|CE))?$/i
  );

  if (century) {
    const number = Number(century[1]);
    const era = (century[2] ?? "CE").toUpperCase();

    if (number < 1) return null;

    if (era === "BC" || era === "BCE") {
      return {
        start: 1 - number * 100,
        end: 1 - (number - 1) * 100,
      };
    }

    return {
      start: (number - 1) * 100 + 1,
      end: number * 100,
    };
  }

  // Explicit year interval: 1150-1200 or 1150–1200
  const interval = text.match(
    /^(\d{1,4})\s*[-–—]\s*(\d{1,4})$/
  );

  if (interval) {
    const start = Number(interval[1]);
    const end = Number(interval[2]);

    if (start < 1 || end < start) return null;

    return { start, end };
  }

  // Broad periods such as "Medieval period" are intentionally
  // not converted into artificial dates.
  return null;
}

function describeNode(node) {
  return node.label ?? node.title ?? node.id;
}

function validate() {
  const graph = JSON.parse(
    fs.readFileSync(PATHS.graph, "utf8")
  );

  const registry = YAML.parse(
    fs.readFileSync(PATHS.relationships, "utf8")
  );

  if (!Array.isArray(graph?.nodes)) {
    throw new Error("Content Graph must contain a nodes array.");
  }

  if (!Array.isArray(graph?.edges)) {
    throw new Error("Content Graph must contain an edges array.");
  }

  if (!Array.isArray(registry?.relationships)) {
    throw new Error(
      'relationship-types.yaml must contain a "relationships" array.'
    );
  }

  const nodes = new Map();

  for (const node of graph.nodes) {
    if (!isNonEmptyString(node?.id)) {
      error("Graph contains a node without a valid ID.");
      continue;
    }

    if (nodes.has(node.id)) {
      error(`Duplicate graph node ID "${node.id}".`);
      continue;
    }

    nodes.set(node.id, node);
  }

  const relationshipDefinitions = new Map();

  for (const definition of registry.relationships) {
    if (!isNonEmptyString(definition?.id)) {
      error("Relationship registry contains an invalid ID.");
      continue;
    }

    relationshipDefinitions.set(definition.id, definition);
  }

  const causalDefinitions = [...relationshipDefinitions.values()]
    .filter(
      (definition) =>
        definition.category === "causal" ||
        CAUSAL_TYPES.has(definition.id)
    );

  for (const type of CAUSAL_TYPES) {
    const definition = relationshipDefinitions.get(type);

    if (!definition) {
      error(`Causal relationship type "${type}" is not registered.`);
    } else if (definition.category !== "causal") {
      error(
        `Relationship "${type}" must have category "causal".`
      );
    }
  }

  const causalEdges = graph.edges.filter((edge) =>
    CAUSAL_TYPES.has(edge?.type)
  );

  const edgeKeys = new Set();
  const adjacency = new Map();
  const reverseAdjacency = new Map();
  const causalNodeIds = new Set();

  function addConnection(map, from, to) {
    if (!map.has(from)) map.set(from, new Set());
    map.get(from).add(to);
  }

  // Validate causal edges and build the directed graph.
  for (const edge of causalEdges) {
    if (
      !isNonEmptyString(edge?.from) ||
      !isNonEmptyString(edge?.to)
    ) {
      error("A causal edge has an invalid source or target.");
      continue;
    }

    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);

    if (!source) {
      error(
        `Causal edge "${edge.id}" references missing source "${edge.from}".`
      );
      continue;
    }

    if (!target) {
      error(
        `Causal edge "${edge.id}" references missing target "${edge.to}".`
      );
      continue;
    }

    if (edge.from === edge.to) {
      error(`Causal self-loop detected on "${edge.from}".`);
      continue;
    }

    const definition = relationshipDefinitions.get(edge.type);

    if (!definition) {
      error(`Unknown causal relationship type "${edge.type}".`);
      continue;
    }

    if (
      !Array.isArray(definition.from) ||
      !definition.from.includes(source.kind)
    ) {
      error(
        `Invalid source kind "${source.kind}" for "${edge.type}" (${edge.from}).`
      );
    }

    if (
      !Array.isArray(definition.to) ||
      !definition.to.includes(target.kind)
    ) {
      error(
        `Invalid target kind "${target.kind}" for "${edge.type}" (${edge.to}).`
      );
    }

    const key = `${edge.type}|${edge.from}|${edge.to}`;

    if (edgeKeys.has(key)) {
      warn(
        `Duplicate causal relationship: ${edge.type} "${edge.from}" -> "${edge.to}".`
      );
    }

    edgeKeys.add(key);

    addConnection(adjacency, edge.from, edge.to);
    addConnection(reverseAdjacency, edge.to, edge.from);

    causalNodeIds.add(edge.from);
    causalNodeIds.add(edge.to);
  }

  // Validate the expected endpoint kinds for the two causal types.
  for (const edge of causalEdges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);

    if (!source || !target) continue;

    if (
      edge.type === "causes" &&
      (source.kind !== "divergence" ||
        target.kind !== "timeline-event")
    ) {
      error(
        `"causes" must connect divergence -> timeline-event; found "${source.kind}" -> "${target.kind}" (${edge.from} -> ${edge.to}).`
      );
    }

    if (
      edge.type === "results_in" &&
      (source.kind !== "timeline-event" ||
        target.kind !== "timeline-event")
    ) {
      error(
        `"results_in" must connect timeline-event -> timeline-event; found "${source.kind}" -> "${target.kind}" (${edge.from} -> ${edge.to}).`
      );
    }
  }

  // Detect directed cycles using DFS.
  const visiting = new Set();
  const visited = new Set();
  const reportedCycles = new Set();

  function visit(nodeId, stack) {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      const cycle = [...stack.slice(start), nodeId];
      const signature = [...new Set(cycle)].sort().join("|");

      if (!reportedCycles.has(signature)) {
        reportedCycles.add(signature);
        error(`Causal cycle detected: ${cycle.join(" -> ")}.`);
      }

      return;
    }

    if (visited.has(nodeId)) return;

    visiting.add(nodeId);
    stack.push(nodeId);

    for (const nextId of adjacency.get(nodeId) ?? []) {
      visit(nextId, stack);
    }

    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of causalNodeIds) {
    visit(nodeId, []);
  }

  // Check chronology only when both dates can be interpreted.
  // Report a contradiction only when the cause is definitely later
  // than the effect, not when the intervals merely overlap.
  let chronologyChecks = 0;
  let chronologySkipped = 0;

  for (const edge of causalEdges) {
    const source = nodes.get(edge.from);
    const target = nodes.get(edge.to);

    if (!source || !target) continue;

    const sourceDate = parseHistoricalDate(source.date);
    const targetDate = parseHistoricalDate(target.date);

    if (!sourceDate || !targetDate) {
      chronologySkipped += 1;
      continue;
    }

    chronologyChecks += 1;

    if (sourceDate.start > targetDate.end) {
      error(
        `Chronology contradiction: "${describeNode(source)}" (${source.date}) causes or precedes "${describeNode(target)}" (${target.date}) in the causal graph, but the source is later.`
      );
    }
  }

  // Check whether causally connected timeline events can be reached
  // from a divergence through causes/results_in edges.
  const divergences = [...nodes.values()].filter(
    (node) => node.kind === "divergence"
  );

  const reachableFromDivergence = new Set();

  for (const divergence of divergences) {
    const queue = [divergence.id];
    const seen = new Set([divergence.id]);

    while (queue.length > 0) {
      const current = queue.shift();

      for (const nextId of adjacency.get(current) ?? []) {
        if (seen.has(nextId)) continue;

        seen.add(nextId);
        queue.push(nextId);
      }
    }

    for (const id of seen) {
      if (nodes.get(id)?.kind === "timeline-event") {
        reachableFromDivergence.add(id);
      }
    }
  }

  const causalTimelineEvents = [...causalNodeIds].filter(
    (id) => nodes.get(id)?.kind === "timeline-event"
  );

  for (const eventId of causalTimelineEvents) {
    if (!reachableFromDivergence.has(eventId)) {
      warn(
        `Timeline event "${eventId}" participates in causal relationships but is not reachable from any divergence through the causal graph.`
      );
    }
  }

  // A divergence without an outgoing "causes" edge may simply be
  // unfinished content, so report it as a warning.
  const divergencesWithCauses = new Set(
    causalEdges
      .filter((edge) => edge.type === "causes")
      .map((edge) => edge.from)
  );

  for (const divergence of divergences) {
    if (!divergencesWithCauses.has(divergence.id)) {
      warn(
        `Divergence "${divergence.id}" has no outgoing "causes" relationship.`
      );
    }
  }

  console.log("");
  console.log("HAD IT GONE — Causality Validation");
  console.log("---------------------------------");
  console.log(`Nodes:                 ${nodes.size}`);
  console.log(`Causal relationship types: ${causalDefinitions.length}`);
  console.log(`Causal edges:           ${causalEdges.length}`);
  console.log(`Chronology checks:      ${chronologyChecks}`);
  console.log(`Chronology skipped:     ${chronologySkipped}`);
  console.log(`Errors:                 ${errors.length}`);
  console.log(`Warnings:               ${warnings.length}`);

  if (warnings.length > 0) {
    console.log("\nWARNINGS");

    for (const message of warnings) {
      console.warn(`  ! ${message}`);
    }
  }

  if (errors.length > 0) {
    console.log("\nERRORS");

    for (const message of errors) {
      console.error(`  ✗ ${message}`);
    }

    console.error("\n✗ Causality validation failed.");
    process.exitCode = 1;
  } else if (warnings.length > 0) {
    console.warn("\n⚠ Causality validation passed with warnings.");
  } else {
    console.log("\n✓ Causality validation passed.");
  }
}

try {
  for (const filePath of Object.values(PATHS)) {
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Required file not found: ${path.relative(ROOT, filePath)}`
      );
    }
  }

  validate();
} catch (cause) {
  console.error(`\nFATAL: ${cause.message}`);
  process.exitCode = 1;
}