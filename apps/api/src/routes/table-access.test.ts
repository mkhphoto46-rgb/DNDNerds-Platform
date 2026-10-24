import assert from "node:assert/strict";
import { test } from "node:test";
import { canLaunchTable } from "./table-access.js";

const table = { hostUserId: "host", status: "PUBLISHED", visibility: "PUBLIC" };

test("only the host can launch the DM view", () => {
  assert.equal(canLaunchTable(table, "host", "dm", false), true);
  assert.equal(canLaunchTable(table, "guest", "dm", true), false);
});

test("public tables allow players and private tables require an invitation", () => {
  assert.equal(canLaunchTable(table, "guest", "player", false), true);
  assert.equal(canLaunchTable({ ...table, visibility: "PRIVATE" }, "guest", "player", false), false);
  assert.equal(canLaunchTable({ ...table, visibility: "PRIVATE" }, "guest", "player", true), true);
  assert.equal(canLaunchTable({ ...table, status: "CLOSED" }, "guest", "player", true), false);
});
