// B34: database errors must not write user content (query parameters, values) into the logs.
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { DrizzleQueryError } from "drizzle-orm";
import pino from "pino";

import { safeErrorSerializer } from "./log-serializers.js";

const secret = "data:image/webp;base64,UklGRsecretcover";
const userText = "My private campaign notes";

function postgresError() {
  return Object.assign(new Error(`invalid input syntax for type uuid: "${userText}"`), {
    name: "PostgresError", severity: "ERROR", code: "23514", table_name: "game_tables", constraint_name: "game_tables_image_data_check",
    detail: `Failing row contains (${userText}, ${secret}).`, where: "SQL statement", query: "insert into game_tables ...", parameters: [userText, secret],
  });
}

function logged(error: unknown): string {
  let out = "";
  const sink = new Writable({ write(chunk, _enc, done) { out += chunk.toString(); done(); } });
  pino({ serializers: { err: safeErrorSerializer } }, sink).error({ err: error }, "Unhandled API error");
  return out;
}

test("B34: a failed Drizzle query is logged without its SQL parameters or values", () => {
  const error = new DrizzleQueryError(`insert into "game_tables" ("title","image_data") values ($1, $2)`, [userText, secret], postgresError());
  const line = logged(error);
  assert.ok(!line.includes(secret), line);
  assert.ok(!line.includes(userText), line);
  assert.ok(!line.includes("params:"), line);
  const parsed = JSON.parse(line);
  assert.equal(parsed.err.type, "DrizzleQueryError");
  assert.equal(parsed.err.cause.code, "23514");
  assert.equal(parsed.err.cause.table, "game_tables");
  assert.equal(parsed.err.cause.constraint, "game_tables_image_data_check");
  assert.match(parsed.err.stack, /\n\s+at /, "the stack frames stay");
});

test("B34: a bare PostgreSQL error keeps only its code, table and constraint", () => {
  const line = logged(postgresError());
  assert.ok(!line.includes(secret) && !line.includes(userText), line);
  assert.equal(JSON.parse(line).err.code, "23514");
});

test("B34: ordinary errors keep their message and status", () => {
  const parsed = JSON.parse(logged(Object.assign(new Error("Seller insert failed"), { statusCode: 500 })));
  assert.equal(parsed.err.message, "Seller insert failed");
  assert.equal(parsed.err.statusCode, 500);
});
