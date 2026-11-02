// RC10: Platform API hygiene fixes, each reproduced on a database built only
// from the repository's migrations.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); api.app.log.level = "silent"; });
after(async () => { await api?.stop(); });

function cover(bytes: number) {
  const data = Buffer.alloc(bytes);
  data.write("RIFF"); data.writeUInt32LE(bytes - 8, 4); data.write("WEBP", 8); data.write("VP8X", 12);
  data.writeUIntLE(1279, 24, 3); data.writeUIntLE(799, 27, 3);
  return "data:image/webp;base64," + data.toString("base64");
}
const tableInput = (extra: Record<string, unknown> = {}) => ({
  title: "RC10 fixture table", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستانی",
  levelRange: "1-5", schedule: "Friday", capacity: 4, status: "PUBLISHED", visibility: "PUBLIC", ...extra,
});

test("B35: a 500 KB cover is accepted on a database built only from migrations", async () => {
  const owner = await api.register("b35");
  const created = await api.request({ method: "POST", url: "/api/v1/game-hub/tables", token: owner.token, payload: tableInput({ imageData: cover(500_000) }) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
});

test("B1: the embedded PostgreSQL cluster is created in UTF8, not the Windows code page", async () => {
  const rows = await api.query("select pg_encoding_to_char(encoding) as encoding from pg_database where datname = 'template1'") as { encoding: string }[];
  assert.equal(rows[0]?.encoding, "UTF8");
});
