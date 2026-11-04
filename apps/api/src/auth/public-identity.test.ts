import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeUsername, publicAccountId, usernameSchema } from "./public-identity.js";

test("public account reference is a stable 12-character display identifier", () => {
  const id = "23a99f86-adca-4b48-8adc-e985c6db6908";
  assert.match(publicAccountId(id), /^[A-Za-z0-9_-]{12}$/);
  assert.equal(publicAccountId(id), publicAccountId(id));
});

test("chat usernames accept ASCII letters and digits with a letter first", () => {
  assert.equal(normalizeUsername("  Player_42 "), "Player_42");
  assert.equal(usernameSchema.safeParse("Player_42").success, true);
  assert.equal(usernameSchema.safeParse("42player").success, false);
  assert.equal(usernameSchema.safeParse("a b").success, false);
});
