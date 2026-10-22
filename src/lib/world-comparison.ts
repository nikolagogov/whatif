
import { getWorldStates } from "./world-states.ts";

export type WorldVariable = {
  key: string;
  value: unknown;
  status?: string;
};

export type WorldStateSnapshot = {
  id: string;
  worldId: string;
  time?: {
    label?: string;
    year?: number | null;
    precision?: string;
  };
  variables: WorldVariable[];
};

export type ComparisonStatus =
  | "changed"
  | "unchanged"
  | "unknown";

export type WorldComparisonItem = {
  key: string;
  status: ComparisonStatus;
  referenceValue: unknown;
  alternateValue: unknown;
  changes: {
    added: Array<{ key: string; value: unknown }>;
    removed: Array<{ key: string; value: unknown }>;
    modified: Array<{
      key: string;
      referenceValue: unknown;
      alternateValue: unknown;
    }>;
  };
};

export type WorldComparisonResult = {
  referenceStateId: string;
  alternateStateId: string;
  items: WorldComparisonItem[];
  summary: {
    changed: number;
    unchanged: number;
    unknown: number;
  };
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }

    return (
      a.length === b.length &&
      a.every((value, index) => valuesEqual(value, b[index]))
    );
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;

  const aKeys = Object.keys(aRecord).sort();
  const bKeys = Object.keys(bRecord).sort();

  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (key, index) =>
        key === bKeys[index] &&
        valuesEqual(aRecord[key], bRecord[key])
    )
  );
}

type ValueChanges = WorldComparisonItem["changes"];

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function getValueChanges(
  referenceValue: unknown,
  alternateValue: unknown,
  path = ""
): ValueChanges {
  const changes: ValueChanges = {
    added: [],
    removed: [],
    modified: [],
  };

  if (isRecord(referenceValue) && isRecord(alternateValue)) {
    const keys = [
      ...new Set([
        ...Object.keys(referenceValue),
        ...Object.keys(alternateValue),
      ]),
    ].sort();

    for (const key of keys) {
      const childPath = path ? `${path}.${key}` : key;
      const hasReference = Object.hasOwn(referenceValue, key);
      const hasAlternate = Object.hasOwn(alternateValue, key);

      if (!hasReference && hasAlternate) {
        changes.added.push({
          key: childPath,
          value: alternateValue[key],
        });
      } else if (hasReference && !hasAlternate) {
        changes.removed.push({
          key: childPath,
          value: referenceValue[key],
        });
      } else {
        const nested = getValueChanges(
          referenceValue[key],
          alternateValue[key],
          childPath
        );

        changes.added.push(...nested.added);
        changes.removed.push(...nested.removed);
        changes.modified.push(...nested.modified);
      }
    }

    return changes;
  }

  if (!valuesEqual(referenceValue, alternateValue)) {
    changes.modified.push({
      key: path || "(value)",
      referenceValue,
      alternateValue,
    });
  }

  return changes;
}

export function compareWorldStates(
  reference: WorldStateSnapshot,
  alternate: WorldStateSnapshot
): WorldComparisonResult {
  if (reference.worldId !== alternate.worldId) {
    throw new Error(
      `Cannot compare World States from different worlds: ${reference.worldId} and ${alternate.worldId}`
    );
  }

  const referenceVariables = new Map(
    reference.variables.map((variable) => [
      variable.key,
      variable.value,
    ])
  );

  const alternateVariables = new Map(
    alternate.variables.map((variable) => [
      variable.key,
      variable.value,
    ])
  );

  const keys = [
    ...new Set([
      ...referenceVariables.keys(),
      ...alternateVariables.keys(),
    ]),
  ].sort();

  const items: WorldComparisonItem[] = keys.map((key) => {
    const hasReference = referenceVariables.has(key);
    const hasAlternate = alternateVariables.has(key);

    const referenceValue = referenceVariables.get(key);
    const alternateValue = alternateVariables.get(key);

    if (!hasReference || !hasAlternate) {
      return {
        key,
        status: "unknown",
        referenceValue: hasReference ? referenceValue : null,
        alternateValue: hasAlternate ? alternateValue : null,
        changes: {
          added: [],
          removed: [],
          modified: [],
        },
      };
    }

    return {
      key,
      status: valuesEqual(referenceValue, alternateValue)
        ? "unchanged"
        : "changed",
      referenceValue,
      alternateValue,
      changes: getValueChanges(referenceValue, alternateValue),
    };
  });

  return {
    referenceStateId: reference.id,
    alternateStateId: alternate.id,
    items,
    summary: {
      changed: items.filter((item) => item.status === "changed").length,
      unchanged: items.filter((item) => item.status === "unchanged").length,
      unknown: items.filter((item) => item.status === "unknown").length,
    },
  };
}

export function compareStoredWorldStates(
  referenceStateId: string,
  alternateStateId: string
): WorldComparisonResult {
  const states = getWorldStates();

  const reference = states.find(
    (state) => state.id === referenceStateId
  );

  const alternate = states.find(
    (state) => state.id === alternateStateId
  );

  if (!reference) {
    throw new Error(
      `Reference World State not found: ${referenceStateId}`
    );
  }

  if (!alternate) {
    throw new Error(
      `Alternate World State not found: ${alternateStateId}`
    );
  }

  return compareWorldStates(reference, alternate);
}