import assert from "node:assert/strict";
import { test } from "node:test";
import { runTestPhases } from "./run-tests.mjs";

test("both phases run even if either phase fails", () => {
  for (const statuses of [[0, 0], [1, 0], [0, 1], [null, 0]]) {
    let calls = 0;
    const result = runTestPhases(() => ({ status: statuses[calls++] }));
    assert.equal(calls, 2);
    assert.equal(result, statuses.every((status) => status === 0) ? 0 : 1);
  }
});
