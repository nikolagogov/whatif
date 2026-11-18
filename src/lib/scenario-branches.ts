
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";

const ROOT = process.cwd();
const STATES_DIR = join(ROOT, "src", "data", "world-states");
const BRANCHES_DIR = join(ROOT, "src", "data", "scenario-branches");

export type ScenarioBranch = {
  schemaVersion: 1;
  id: string;
  name: string;
  worldId: string;
  divergenceId: string;
  parentStateId: string;
  assumption: string;
  status: "USER";
  createdAt: string;
};

type WorldState = {
  id: string;
  worldId: string;
  divergenceId: string;
  variables: Array<{
    key: string;
    value: unknown;
    status?: string;
  }>;
};

function requireText(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function readState(stateId: string): WorldState {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(stateId)) {
    throw new Error("Invalid World State ID.");
  }

  const filePath = join(STATES_DIR, `${stateId}.yaml`);

  if (!existsSync(filePath)) {
    throw new Error(`World State not found: ${stateId}`);
  }

  const state: unknown = YAML.parse(readFileSync(filePath, "utf8"));

  if (
    !state ||
    typeof state !== "object" ||
    !("id" in state) ||
    !("worldId" in state) ||
    !("divergenceId" in state) ||
    !("variables" in state) ||
    state.id !== stateId ||
    typeof state.worldId !== "string" ||
    typeof state.divergenceId !== "string" ||
    !Array.isArray(state.variables)
  ) {
    throw new Error(`Invalid World State: ${stateId}`);
  }

  return state as WorldState;
}

export function createScenarioBranch(input: {
  name: string;
  parentStateId: string;
  assumption: string;
}): ScenarioBranch {
  const name = requireText(input.name, "Branch name");
  const assumption = requireText(input.assumption, "Assumption");
  const parentStateId = requireText(
    input.parentStateId,
    "Parent state ID",
  );

  const parent = readState(parentStateId);

  mkdirSync(BRANCHES_DIR, { recursive: true });

  const branch: ScenarioBranch = {
    schemaVersion: 1,
    id: `branch-${randomUUID()}`,
    name,
    worldId: parent.worldId,
    divergenceId: parent.divergenceId,
    parentStateId: parent.id,
    assumption,
    status: "USER",
    createdAt: new Date().toISOString(),
  };

  const outputPath = join(BRANCHES_DIR, `${branch.id}.yaml`);

  writeFileSync(outputPath, YAML.stringify(branch), {
    encoding: "utf8",
    flag: "wx",
  });

  return branch;
}

export function getScenarioBranches(): ScenarioBranch[] {
  if (!existsSync(BRANCHES_DIR)) {
    return [];
  }

  return readdirSync(BRANCHES_DIR)
    .filter((file) => file.endsWith(".yaml"))
    .sort()
    .map((file) => {
      const branch: unknown = YAML.parse(
        readFileSync(join(BRANCHES_DIR, file), "utf8"),
      );

      if (
        !branch ||
        typeof branch !== "object" ||
        !("schemaVersion" in branch) ||
        !("id" in branch) ||
        !("name" in branch) ||
        !("worldId" in branch) ||
        !("divergenceId" in branch) ||
        !("parentStateId" in branch) ||
        !("assumption" in branch) ||
        branch.schemaVersion !== 1 ||
        typeof branch.id !== "string" ||
        typeof branch.name !== "string" ||
        typeof branch.worldId !== "string" ||
        typeof branch.divergenceId !== "string" ||
        typeof branch.parentStateId !== "string" ||
        typeof branch.assumption !== "string"
      ) {
        throw new Error(`Invalid scenario branch file: ${file}`);
      }

      return branch as ScenarioBranch;
    });
}