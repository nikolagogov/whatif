import {
  compareStoredWorldStates,
} from "../src/lib/world-comparison.ts";
import assert from "node:assert/strict";
import test from "node:test";

import {
  compareWorldStates,
} from "../src/lib/world-comparison.ts";

const initialState = {
  id: "initial",
  worldId: "world-alexander-west",
  variables: [
    {
      key: "territorial_control",
      value: {
        macedonian_empire: "Survives under Alexander",
        western_mediterranean: "Emerging strategic frontier",
      },
    },
  ],
};

const laterState = {
  id: "after-arabian-campaign",
  worldId: "world-alexander-west",
  variables: [
    {
      key: "territorial_control",
      value: {
        macedonian_empire: "Survives under Alexander",
        arabian_coast: "Arabian expedition underway",
        western_mediterranean: "Future campaign objective",
      },
    },
  ],
};

test("detects changed variables between two world states", () => {
  const result = compareWorldStates(initialState, laterState);

  assert.equal(result.summary.changed, 1);
  assert.equal(result.summary.unchanged, 0);
  assert.equal(result.summary.unknown, 0);

  assert.equal(result.items[0].key, "territorial_control");
  assert.equal(result.items[0].status, "changed");
});

test("recognizes identical values", () => {
  const result = compareWorldStates(initialState, {
    ...initialState,
    id: "identical-state",
  });

  assert.equal(result.summary.changed, 0);
  assert.equal(result.summary.unchanged, 1);
  assert.equal(result.summary.unknown, 0);
});

test("marks missing variables as unknown", () => {
  const result = compareWorldStates(initialState, {
    id: "state-without-variables",
    worldId: "world-alexander-west",
    variables: [],
  });

  assert.equal(result.summary.unknown, 1);
});
test("compares stored Alexander world states", () => {
  const result = compareStoredWorldStates(
    "world-state-alexander-west-initial",
    "world-state-alexander-west-after-arabian-campaign"
  );

  assert.equal(result.summary.changed, 1);
  assert.equal(result.summary.unchanged, 0);
  assert.equal(result.summary.unknown, 0);
});


test("explains territorial changes in stored Alexander states", () => {
  const result = compareStoredWorldStates(
    "world-state-alexander-west-initial",
    "world-state-alexander-west-after-arabian-campaign"
  );

  const territorialControl = result.items.find(
    (item) => item.key === "territorial_control"
  );

  assert.ok(territorialControl);
  assert.equal(territorialControl.status, "changed");

  assert.deepEqual(territorialControl.changes.added, [
    {
      key: "arabian_coast",
      value: "Arabian expedition underway",
    },
  ]);

  assert.deepEqual(territorialControl.changes.removed, []);

  assert.deepEqual(territorialControl.changes.modified, [
    {
      key: "western_mediterranean",
      referenceValue: "Emerging strategic frontier",
      alternateValue: "Future campaign objective",
    },
  ]);
});

test("detects deeply nested changes", () => {
  const reference = {
    id: "reference",
    worldId: "test-world",
    variables: [
      {
        key: "territorial_control",
        value: {
          macedonian_empire: {
            cities: {
              babylon: "Macedonian",
              tyre: "Macedonian",
            },
          },
        },
      },
    ],
  };

  const alternate = {
    id: "alternate",
    worldId: "test-world",
    variables: [
      {
        key: "territorial_control",
        value: {
          macedonian_empire: {
            cities: {
              babylon: "Macedonian",
              tyre: "Independent",
              alexandria: "Macedonian",
            },
          },
        },
      },
    ],
  };

  const result = compareWorldStates(reference, alternate);
  const item = result.items[0];

  assert.equal(item.status, "changed");

  assert.deepEqual(item.changes.added, [
    {
      key: "macedonian_empire.cities.alexandria",
      value: "Macedonian",
    },
  ]);

  assert.deepEqual(item.changes.removed, []);

  assert.deepEqual(item.changes.modified, [
    {
      key: "macedonian_empire.cities.tyre",
      referenceValue: "Macedonian",
      alternateValue: "Independent",
    },
  ]);
});
test("rejects comparisons between different worlds", () => {
  const reference = {
    id: "reference",
    worldId: "world-alpha",
    variables: [],
  };

  const alternate = {
    id: "alternate",
    worldId: "world-beta",
    variables: [],
  };

  assert.throws(
    () => compareWorldStates(reference, alternate),
    /Cannot compare World States from different worlds/
  );
});