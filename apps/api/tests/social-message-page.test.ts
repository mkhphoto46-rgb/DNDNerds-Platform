import assert from "node:assert/strict";
import test from "node:test";
import { messagePage } from "../src/routes/social-message-page.js";

test("private and group message cursors point to the oldest returned message", () => {
  const newestFirst = Array.from({ length: 50 }, (_, index) => ({ id: String(100 - index) }));
  const first = messagePage(newestFirst);
  assert.equal(first.nextBeforeId, "51");
  assert.equal(first.data[0].id, "51");
  assert.equal(first.data.at(-1)?.id, "100");

  const older = messagePage(Array.from({ length: 10 }, (_, index) => ({ id: String(50 - index) })));
  assert.equal(older.nextBeforeId, null);
  assert.equal(older.data.at(-1)?.id, "50");
  assert.equal(first.data.some(row => older.data.some(previous => previous.id === row.id)), false);
});
