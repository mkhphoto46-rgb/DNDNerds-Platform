import assert from "node:assert/strict";
import test from "node:test";
import { accruePresence, pvpXpForOutcome, xpSnapshot } from "./xp-policy.js";

test("registration starts an account at level 2", () => {
  assert.deepEqual(xpSnapshot(1000), { totalXp: 1000, level: 2, levelXp: 0, xpToNextLevel: 1000 });
  assert.equal(xpSnapshot(1999).level, 2);
  assert.equal(xpSnapshot(2000).level, 3);
});

test("visible site and game minutes earn one and two XP respectively", () => {
  assert.deepEqual(accruePresence(0, 60, "site"), { earned: 1, activeSeconds: 0 });
  assert.deepEqual(accruePresence(0, 60, "game"), { earned: 2, activeSeconds: 0 });
  assert.deepEqual(accruePresence(25, 35, "game"), { earned: 2, activeSeconds: 0 });
});

test("short repeated pings and long idle gaps cannot mint extra minutes", () => {
  assert.deepEqual(accruePresence(0, 0, "game"), { earned: 0, activeSeconds: 0 });
  assert.deepEqual(accruePresence(0, 600, "site"), { earned: 0, activeSeconds: 0 });
  assert.deepEqual(accruePresence(0, 29.8, "site"), { earned: 0, activeSeconds: 29.8 });
  assert.deepEqual(accruePresence(29.8, 30.2, "site"), { earned: 1, activeSeconds: 0 });
});

test("future verified PvP results have fixed awards", () => {
  assert.equal(pvpXpForOutcome("win"), 100);
  assert.equal(pvpXpForOutcome("loss"), 50);
});
