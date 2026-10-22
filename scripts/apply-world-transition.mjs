
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const ROOT = process.cwd();

const PATHS = {
  states: path.join(ROOT, "src", "data", "world-states"),
  variables: path.join(
    ROOT,
    "src",
    "data",
    "world-variable-definitions.yaml"
  ),
  transitions: path.join(
    ROOT,
    "src",
    "data",
    "world-transitions.yaml"
  ),
  graph: path.join(ROOT, "src", "data", "content-graph.json"),
};

function fail(message) {
  throw new Error(message);
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertSafeId(id, label) {
  if (
    !isNonEmptyString(id) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)
  ) {
    fail(`${label} is not a safe identifier: "${id}".`);
  }
}

function loadStates() {
  const states = new Map();

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {
      withFileTypes: true,
    })) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (!/\.(yaml|yml)$/i.test(entry.name)) {
        continue;
      }

      const state = readYaml(fullPath);

      if (!state || typeof state !== "object" || Array.isArray(state)) {
        fail(`Invalid World State file: ${fullPath}`);
      }

      if (!isNonEmptyString(state.id)) {
        fail(`World State has no valid id: ${fullPath}`);
      }

      if (states.has(state.id)) {
        fail(`Duplicate World State ID: "${state.id}".`);
      }

      states.set(state.id, {
        data: state,
        filePath: fullPath,
      });
    }
  }

  walk(PATHS.states);
  return states;
}

function validateValue(definition, value, context) {
  const type = definition.valueType;

  if (type === "number" && typeof value !== "number") {
    fail(`${context}: expected a number.`);
  }

  if (type === "string" && typeof value !== "string") {
    fail(`${context}: expected a string.`);
  }

  if (type === "boolean" && typeof value !== "boolean") {
    fail(`${context}: expected a boolean.`);
  }

  if (
    type === "object" &&
    (value === null || typeof value !== "object" || Array.isArray(value))
  ) {
    fail(`${context}: expected an object.`);
  }

  if (type === "array" && !Array.isArray(value)) {
    fail(`${context}: expected an array.`);
  }

  if (typeof value === "number") {
    if (typeof definition.min === "number" && value < definition.min) {
      fail(`${context}: value is below minimum ${definition.min}.`);
    }

    if (typeof definition.max === "number" && value > definition.max) {
      fail(`${context}: value exceeds maximum ${definition.max}.`);
    }

    if (!Number.isFinite(value)) {
      fail(`${context}: value must be finite.`);
    }
  }
}

function validateVariableStatus(status, context) {
  const allowed = new Set([
    "CANON",
    "EDITORIAL",
    "DERIVED",
    "SIMULATED",
    "GENERATED",
    "USER",
  ]);

  if (!allowed.has(status)) {
    fail(`${context}: unsupported status "${status}".`);
  }
}

function applyTransition(transitionId) {
  if (!isNonEmptyString(transitionId)) {
    fail(
      "Usage: node scripts/apply-world-transition.mjs <transition-id>"
    );
  }

  for (const filePath of Object.values(PATHS)) {
    if (!fs.existsSync(filePath)) {
      fail(`Required path not found: ${filePath}`);
    }
  }

  const registry = readYaml(PATHS.transitions);
  const variableRegistry = readYaml(PATHS.variables);
  const graph = readJson(PATHS.graph);

  if (!Array.isArray(registry?.transitions)) {
    fail("world-transitions.yaml must contain a transitions array.");
  }

  const definitions = variableRegistry?.variables;

  if (!Array.isArray(definitions)) {
    fail(
      "world-variable-definitions.yaml must contain a variables array."
    );
  }

  if (!Array.isArray(graph?.nodes)) {
    fail("Content Graph must contain a nodes array.");
  }

  if (!Array.isArray(graph?.edges)) {
    fail("Content Graph must contain an edges array.");
  }

  const transition = registry.transitions.find(
    (item) => item?.id === transitionId
  );

  if (!transition) {
    fail(`Transition not found: "${transitionId}".`);
  }

  for (const field of [
    "id",
    "worldId",
    "fromStateId",
    "toStateId",
    "eventId",
  ]) {
    if (!isNonEmptyString(transition[field])) {
      fail(`Transition "${transitionId}" has no valid "${field}".`);
    }
  }

  assertSafeId(transition.id, "Transition ID");
  assertSafeId(transition.fromStateId, "Source state ID");
  assertSafeId(transition.toStateId, "Target state ID");

  if (transition.fromStateId === transition.toStateId) {
    fail("Source and target state IDs must differ.");
  }

  const states = loadStates();
  const sourceEntry = states.get(transition.fromStateId);

  if (!sourceEntry) {
    fail(`Source state not found: "${transition.fromStateId}".`);
  }

  if (states.has(transition.toStateId)) {
    fail(
      `Target state "${transition.toStateId}" already exists. Nothing was changed.`
    );
  }

  const source = sourceEntry.data;

  if (source.worldId !== transition.worldId) {
    fail("Source state does not belong to the transition's world.");
  }

  
  const worldNode = graph.nodes.find(
    (node) => node?.id === transition.worldId
  );

  if (!worldNode || worldNode.kind !== "world") {
    fail(
      `World "${transition.worldId}" must exist as a world in the Content Graph.`
    );
  }

  if (!isNonEmptyString(source.divergenceId)) {
    fail(
      `Source state "${source.id}" has no valid divergenceId.`
    );
  }

  const divergenceNode = graph.nodes.find(
    (node) => node?.id === source.divergenceId
  );

  if (!divergenceNode || divergenceNode.kind !== "divergence") {
    fail(
      `Divergence "${source.divergenceId}" must exist as a divergence in the Content Graph.`
    );
  }

  if (
    transition.divergenceId !== undefined &&
    transition.divergenceId !== source.divergenceId
  ) {
    fail(
      `Transition divergence "${transition.divergenceId}" does not match source state divergence "${source.divergenceId}".`
    );
  }

  const event = graph.nodes.find(
    (node) => node?.id === transition.eventId
  );

  if (!event || event.kind !== "timeline-event") {
    fail(
      `Event "${transition.eventId}" must exist as a timeline-event in the Content Graph.`
    );
  }

  if (!Array.isArray(transition.changes)) {
    fail('Transition must contain a "changes" array.');
  }

  const definitionsById = new Map();

  for (const definition of definitions) {
    if (!isNonEmptyString(definition?.id)) {
      fail("Variable definition has no valid id.");
    }

    if (definitionsById.has(definition.id)) {
      fail(`Duplicate variable definition: "${definition.id}".`);
    }

    definitionsById.set(definition.id, definition);
  }

  if (!Array.isArray(source.variables)) {
    fail("Source World State must contain a variables array.");
  }

  const variables = new Map();

  for (const variable of source.variables) {
    if (!isNonEmptyString(variable?.key)) {
      fail(`Source state "${source.id}" contains a variable without a key.`);
    }

    if (variables.has(variable.key)) {
      fail(`Duplicate source variable: "${variable.key}".`);
    }

    const definition = definitionsById.get(variable.key);

    if (!definition) {
      fail(`Undefined source variable: "${variable.key}".`);
    }

    validateValue(
      definition,
      variable.value,
      `Source variable "${variable.key}"`
    );

    variables.set(variable.key, { ...variable });
  }

  const changedKeys = new Set();

  for (const change of transition.changes) {
    if (!isNonEmptyString(change?.key)) {
      fail("A transition change has no valid key.");
    }

    if (changedKeys.has(change.key)) {
      fail(`Duplicate change for variable "${change.key}".`);
    }

    changedKeys.add(change.key);

    const definition = definitionsById.get(change.key);

    if (!definition) {
      fail(`Undefined variable in transition: "${change.key}".`);
    }

    if (!Object.hasOwn(change, "from") || !Object.hasOwn(change, "to")) {
      fail(`Change "${change.key}" must contain both "from" and "to".`);
    }

    validateValue(
      definition,
      change.from,
      `Transition "${transition.id}" / "${change.key}" from`
    );

    validateValue(
      definition,
      change.to,
      `Transition "${transition.id}" / "${change.key}" to`
    );

    validateVariableStatus(
      change.status,
      `Transition "${transition.id}" / "${change.key}"`
    );

    const current = variables.get(change.key);

    if (current && !Object.hasOwn(current, "value")) {
      fail(`Source variable "${change.key}" has no value.`);
    }

    if (current && JSON.stringify(current.value) !== JSON.stringify(change.from)) {
      fail(
        `Source value mismatch for "${change.key}": ` +
        `expected ${JSON.stringify(change.from)}, ` +
        `found ${JSON.stringify(current.value)}.`
      );
    }

    if (!current && change.from !== null) {
      fail(
        `Variable "${change.key}" is absent from the source state. ` +
        'Use from: null only when the variable is intentionally introduced.'
      );
    }

    variables.set(change.key, {
      key: change.key,
      value: change.to,
      status: change.status,
    });
  }

  // Build the new snapshot in memory before writing anything.
  const target = {
    schemaVersion: source.schemaVersion ?? 1,
    id: transition.toStateId,
    worldId: transition.worldId,
    divergenceId: source.divergenceId,
    time: transition.time ?? {
      label: "",
      year: null,
      precision: "unknown",
    },
    status: transition.status ?? "SIMULATED",
    description:
      transition.description ??
      `State produced by transition ${transition.id}.`,
    variables: [...variables.values()].sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    causedBy: [transition.eventId],
    evidence: Array.isArray(transition.evidence)
      ? transition.evidence
      : [],
  };

  if (!isNonEmptyString(target.divergenceId)) {
    fail(`Source state "${source.id}" has no valid divergenceId.`);
  }

  if (target.status !== "SIMULATED") {
    fail(
      'This command only creates SIMULATED snapshots. ' +
      'Other status types require a separate workflow.'
    );
  }

  for (const variable of target.variables) {
    validateVariableStatus(
      variable.status,
      `Target variable "${variable.key}"`
    );
  }

  const outputPath = path.join(
    PATHS.states,
    `${transition.toStateId}.yaml`
  );

  // Refuse to overwrite any file, even if it uses another extension.
  for (const extension of [".yaml", ".yml"]) {
    const possiblePath = path.join(
      PATHS.states,
      `${transition.toStateId}${extension}`
    );

    if (fs.existsSync(possiblePath)) {
      fail(`Target file already exists: ${possiblePath}`);
    }
  }

  // Exclusive create prevents overwriting an existing file.
  fs.writeFileSync(
    outputPath,
    YAML.stringify(target),
    { encoding: "utf8", flag: "wx" }
  );

  console.log("");
  console.log("HAD IT GONE — World Transition Applied");
  console.log("--------------------------------------");
  console.log(`Transition: ${transition.id}`);
  console.log(`World:      ${transition.worldId}`);
  console.log(`From:       ${transition.fromStateId}`);
  console.log(`To:         ${transition.toStateId}`);
  console.log(`Event:      ${transition.eventId}`);
  console.log(`Changes:    ${transition.changes.length}`);
  console.log(`Output:     ${path.relative(ROOT, outputPath)}`);
  console.log("");
  console.log("✓ New simulated World State created.");
}

try {
  applyTransition(process.argv[2]);
} catch (cause) {
  console.error(`\nERROR: ${cause.message}`);
  process.exitCode = 1;
}
