import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const ROOT = process.cwd();

const PATHS = {
  states: path.join(ROOT, "src", "data", "world-states"),
  variables: path.join(ROOT, "src", "data", "world-variable-definitions.yaml"),
  transitions: path.join(ROOT, "src", "data", "world-transitions.yaml"),
  graph: path.join(ROOT, "src", "data", "content-graph.json"),
};

let errors = 0;
let warnings = 0;

function error(message) {
  errors += 1;
  console.error(`ERROR: ${message}`);
}

function warn(message) {
  warnings += 1;
  console.warn(`WARNING: ${message}`);
}

function readYaml(filePath) {
  return YAML.parse(fs.readFileSync(filePath, "utf8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadYamlFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
  }

  const files = [];

  function walk(currentDirectory) {
    for (const entry of fs.readdirSync(currentDirectory, {
      withFileTypes: true,
    })) {
      const fullPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
            } else if (/\.(yaml|yml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(directory);
  return files;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validate() {
  const transitionRegistry = readYaml(PATHS.transitions);
  const variableRegistry = readYaml(PATHS.variables);
  const graph = readJson(PATHS.graph);

  if (!Array.isArray(transitionRegistry?.transitions)) {
    throw new Error(
      "world-transitions.yaml must contain a transitions array."
    );
  }

  if (!Array.isArray(graph?.nodes)) {
    throw new Error("Content Graph must contain a nodes array.");
  }

  if (!Array.isArray(graph?.edges)) {
    throw new Error("Content Graph must contain an edges array.");
  }

  // Load World State files.
  const statesById = new Map();

  for (const filePath of loadYamlFiles(PATHS.states)) {
    let state;

    try {
      state = readYaml(filePath);
    } catch (cause) {
      error(
        `Cannot parse World State ${path.relative(ROOT, filePath)}: ${cause.message}`
      );
      continue;
    }

    if (!state || typeof state !== "object" || Array.isArray(state)) {
      error(`Invalid World State document: ${path.relative(ROOT, filePath)}`);
      continue;
    }

    if (!isNonEmptyString(state.id)) {
      error(`World State has no valid id: ${path.relative(ROOT, filePath)}`);
      continue;
    }

    if (statesById.has(state.id)) {
      error(`Duplicate World State ID: "${state.id}".`);
      continue;
    }

    statesById.set(state.id, {
      ...state,
      _file: path.relative(ROOT, filePath),
    });
  }

  // Load variable definitions.
  const definitions = Array.isArray(variableRegistry)
    ? variableRegistry
    : variableRegistry?.variables;

  if (!Array.isArray(definitions)) {
    throw new Error(
      "world-variable-definitions.yaml must contain a variables array."
    );
  }

  const variablesByKey = new Map();

  for (const definition of definitions) {
    if (!isNonEmptyString(definition?.id)) {
      error("A variable definition has no valid id.");
      continue;
    }

    if (variablesByKey.has(definition.id)) {
      error(`Duplicate variable definition: "${definition.id}".`);
      continue;
    }

    variablesByKey.set(definition.id, definition);
  }

  // Build lookup sets from Content Graph.
  const graphNodeIds = new Set(
    graph.nodes
      .filter((node) => isNonEmptyString(node?.id))
      .map((node) => node.id)
  );

  const timelineEventIds = new Set(
    graph.nodes
      .filter((node) => node?.kind === "timeline-event")
      .map((node) => node.id)
  );

  const causalEdges = graph.edges.filter(
    (edge) =>
      edge?.type === "causes" ||
      edge?.type === "results_in"
  );

  const causalPairs = new Set(
    causalEdges.map((edge) => `${edge.from}->${edge.to}`)
  );

  const transitionIds = new Set();
  const stateTransitions = new Map();

  function validateVariableValue(key, value, context) {
    const definition = variablesByKey.get(key);

    if (!definition) {
      error(`${context}: undefined variable "${key}".`);
      return;
    }

    const type = definition.valueType;

    if (type === "number" && typeof value !== "number") {
      error(`${context}: "${key}" must have a numeric value.`);
      return;
    }

    if (type === "string" && typeof value !== "string") {
      error(`${context}: "${key}" must have a string value.`);
      return;
    }

    if (type === "boolean" && typeof value !== "boolean") {
      error(`${context}: "${key}" must have a boolean value.`);
      return;
    }

    if (
      type === "object" &&
      (value === null || typeof value !== "object" || Array.isArray(value))
    ) {
      error(`${context}: "${key}" must have an object value.`);
      return;
    }

    if (type === "array" && !Array.isArray(value)) {
      error(`${context}: "${key}" must have an array value.`);
      return;
    }

    if (typeof value === "number") {
      const min = definition.min ?? definition.minimum;
      const max = definition.max ?? definition.maximum;

      if (typeof min === "number" && value < min) {
        error(`${context}: "${key}" is below its minimum (${min}).`);
      }

      if (typeof max === "number" && value > max) {
        error(`${context}: "${key}" exceeds its maximum (${max}).`);
      }
    }
  }

  function getStateVariables(state, context) {
    const result = new Map();

    if (!Array.isArray(state.variables)) {
      error(`${context}: "variables" must be an array.`);
      return result;
    }

    for (const variable of state.variables) {
      if (!isNonEmptyString(variable?.key)) {
        error(`${context}: a variable entry has no valid key.`);
        continue;
      }

      if (result.has(variable.key)) {
        error(`${context}: duplicate variable "${variable.key}".`);
        continue;
      }

      if (!Object.hasOwn(variable, "value")) {
        error(`${context}: "${variable.key}" has no value.`);
        continue;
      }

      if (!isNonEmptyString(variable.status)) {
        error(`${context}: "${variable.key}" has no status.`);
      }

      validateVariableValue(variable.key, variable.value, context);
      result.set(variable.key, variable.value);
    }

    return result;
  }

  // Validate variable declarations in every state.
  const stateVariablesById = new Map();

  for (const [stateId, state] of statesById) {
    stateVariablesById.set(
      stateId,
      getStateVariables(state, `World State "${stateId}"`)
    );
  }

  // Validate transitions.
  for (const transition of transitionRegistry.transitions) {
    if (!transition || typeof transition !== "object") {
      error("Invalid transition entry.");
      continue;
    }

    const {
      id,
      worldId,
      fromStateId,
      toStateId,
      eventId,
      changes,
    } = transition;

    if (!isNonEmptyString(id)) {
      error("A transition has no valid id.");
      continue;
    }

    if (transitionIds.has(id)) {
      error(`Duplicate transition ID: "${id}".`);
      continue;
    }

    transitionIds.add(id);

    const context = `Transition "${id}"`;

    for (const [field, value] of Object.entries({
      worldId,
      fromStateId,
      toStateId,
      eventId,
    })) {
      if (!isNonEmptyString(value)) {
        error(`${context}: "${field}" is required.`);
      }
    }

    const fromState = statesById.get(fromStateId);
    const toState = statesById.get(toStateId);

    if (!fromState) {
      error(`${context}: source state "${fromStateId}" does not exist.`);
    }

    // A target state may not exist yet: applying the transition creates it.
    if (!toState) {
      const targetFileYaml = path.join(
        PATHS.states,
        `${toStateId}.yaml`
      );
      const targetFileYml = path.join(
        PATHS.states,
        `${toStateId}.yml`
      );

      if (
        fs.existsSync(targetFileYaml) ||
        fs.existsSync(targetFileYml)
      ) {
        error(
          `${context}: target state "${toStateId}" exists as a file but could not be loaded.`
        );
      }
    }

    if (fromState && toState) {
      if (fromState.id === toState.id) {
        error(`${context}: source and target states must differ.`);
      }

      if (
        fromState.worldId !== worldId ||
        toState.worldId !== worldId
      ) {
        error(
          `${context}: both states must belong to world "${worldId}".`
        );
      }

      if (fromState.worldId !== toState.worldId) {
        error(`${context}: transition crosses between different worlds.`);
      }

      const key = `${fromStateId}->${toStateId}`;

      if (!stateTransitions.has(key)) {
        stateTransitions.set(key, []);
      }

      stateTransitions.get(key).push(id);
    }

    if (!graphNodeIds.has(eventId)) {
      error(`${context}: event "${eventId}" is missing from the Content Graph.`);
    } else if (!timelineEventIds.has(eventId)) {
      error(`${context}: "${eventId}" is not a timeline-event node.`);
    }

    if (
      fromState &&
      isNonEmptyString(eventId) &&
      timelineEventIds.has(eventId)
    ) {
      const hasCausalLink =
        causalPairs.has(`${fromState.divergenceId}->${eventId}`) ||
        causalEdges.some(
          (edge) =>
            edge.to === eventId &&
            timelineEventIds.has(edge.from)
        );

      if (!hasCausalLink) {
        warn(
          `${context}: event "${eventId}" has no incoming causal link from its divergence or a preceding timeline event.`
        );
      }
    }

    if (!Array.isArray(changes)) {
      error(`${context}: "changes" must be an array.`);
      continue;
    }

    const changedKeys = new Set();
    const sourceVariables = fromState
      ? stateVariablesById.get(fromState.id)
      : null;
    const targetVariables = toState
      ? stateVariablesById.get(toState.id)
      : null;

    for (const change of changes) {
      if (!isNonEmptyString(change?.key)) {
        error(`${context}: a change has no valid key.`);
        continue;
      }

      if (changedKeys.has(change.key)) {
        error(`${context}: duplicate change for "${change.key}".`);
        continue;
      }

      changedKeys.add(change.key);

      if (!variablesByKey.has(change.key)) {
        error(
          `${context}: change references undefined variable "${change.key}".`
        );
        continue;
      }

      if (!Object.hasOwn(change, "from")) {
        error(`${context}: change "${change.key}" is missing "from".`);
      } else {
        validateVariableValue(
          change.key,
          change.from,
          `${context}, change "${change.key}" (from)`
        );
      }

      if (!Object.hasOwn(change, "to")) {
        error(`${context}: change "${change.key}" is missing "to".`);
      } else {
        validateVariableValue(
          change.key,
          change.to,
          `${context}, change "${change.key}" (to)`
        );
      }

      if (!isNonEmptyString(change.status)) {
        error(
          `${context}: change "${change.key}" must specify a status.`
        );
      }

      if (
        fromState &&
        sourceVariables &&
        Object.hasOwn(change, "from")
      ) {
        if (!sourceVariables.has(change.key)) {
          if (change.from !== null) {
            error(
              `${context}: "${change.key}" is absent from source state "${fromState.id}"; use from: null only when intentionally introducing the variable.`
            );
          }
        } else if (
          !valuesEqual(sourceVariables.get(change.key), change.from)
        ) {
          error(
            `${context}: "${change.key}" from-value does not match source state "${fromState.id}".`
          );
        }
      }

      if (
        toState &&
        targetVariables &&
        Object.hasOwn(change, "to") &&
        targetVariables.has(change.key) &&
        !valuesEqual(targetVariables.get(change.key), change.to)
      ) {
        error(
          `${context}: "${change.key}" to-value does not match target state "${toState.id}".`
        );
      }

      if (
        Object.hasOwn(change, "from") &&
        Object.hasOwn(change, "to") &&
        valuesEqual(change.from, change.to)
      ) {
        warn(
          `${context}: "${change.key}" has identical from/to values.`
        );
      }
    }
  }

  // Report transitions that reuse the same state pair.
  for (const [pair, ids] of stateTransitions) {
    if (ids.length > 1) {
      warn(
        `Multiple transitions connect the same state pair "${pair}": ${ids.join(", ")}.`
      );
    }
  }

  console.log("");
  console.log("HAD IT GONE — World Transition Validation");
  console.log("-----------------------------------------");
  console.log(`World States:       ${statesById.size}`);
  console.log(`Variable types:     ${variablesByKey.size}`);
  console.log(`Transitions:        ${transitionIds.size}`);
  console.log(`Causal graph edges: ${causalEdges.length}`);
  console.log(`Errors:             ${errors}`);
  console.log(`Warnings:           ${warnings}`);

  if (errors > 0) {
    console.error("\n✗ World Transition validation failed.");
    process.exitCode = 1;
  } else if (warnings > 0) {
    console.warn("\n⚠ Validation passed with warnings.");
  } else {
    console.log("\n✓ World Transition validation passed.");
  }
}

try {
  for (const filePath of Object.values(PATHS)) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required path not found: ${filePath}`);
    }
  }

  validate();
} catch (cause) {
  console.error(`\nFATAL: ${cause.message}`);
  process.exitCode = 1;
}