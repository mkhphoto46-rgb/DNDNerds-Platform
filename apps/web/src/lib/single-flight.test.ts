import test from "node:test";
import assert from "node:assert/strict";
import { singleFlight } from "./single-flight.js";

test("B74: a second submit while the first is saving is ignored", async () => {
  let calls = 0;
  let release!: () => void;
  const save = singleFlight(() => { calls += 1; return calls === 1 ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve(); });
  const first = save();
  const second = save();
  assert.equal(calls, 1);
  assert.equal(await Promise.race([second, Promise.resolve("pending")]), undefined, "the ignored call resolves at once");
  release();
  await first;
  await save();
  assert.equal(calls, 2, "after the first save finishes, the next submit runs");
});

test("B74: a failed save frees the guard", async () => {
  let calls = 0;
  const save = singleFlight(async () => { calls += 1; throw new Error("refused"); });
  await assert.rejects(save());
  await assert.rejects(save());
  assert.equal(calls, 2);
});
