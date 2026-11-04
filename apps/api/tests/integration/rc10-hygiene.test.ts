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

const sellerApplication = (slug: string) => ({ name: "RC10 store", slug, description: "Dice and maps", category: "accessories" });

test("B51: a taken store slug is refused with 409 SLUG_TAKEN, not a 500", async () => {
  const first = await api.register("b51a");
  const second = await api.register("b51b");
  const slug = `rc10-slug-${Date.now()}`;
  const ok = await api.request({ method: "POST", url: "/api/v1/marketplace/v21/seller/apply", token: first.token, payload: sellerApplication(slug) });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const taken = await api.request({ method: "POST", url: "/api/v1/marketplace/v21/seller/apply", token: second.token, payload: sellerApplication(slug) });
  assert.equal(taken.status, 409, JSON.stringify(taken.body));
  assert.equal(taken.body.error.code, "SLUG_TAKEN");
});

test("B51: two applications from one user at once give one 201 and one 409", async () => {
  const applicant = await api.register("b51c");
  const stamp = Date.now();
  const results = await Promise.all([1, 2].map((n) => api.request({ method: "POST", url: "/api/v1/marketplace/v21/seller/apply", token: applicant.token, payload: sellerApplication(`rc10-twice-${stamp}-${n}`) })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], JSON.stringify(results.map((r) => r.body)));
  const refused = results.find((r) => r.status === 409)!;
  assert.equal(refused.body.error.code, "APPLICATION_EXISTS");
});

async function seatPlayers(owner: { token: string }, tableId: string, count: number) {
  const players = [];
  for (let n = 0; n < count; n += 1) {
    const player = await api.register(`seat${n}`);
    const applied = await api.request({ method: "POST", url: `/api/v1/game-hub/tables/${tableId}/apply`, token: player.token, payload: { note: "" } });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const accepted = await api.request({ method: "POST", url: `/api/v1/game-hub/applications/${applied.body.data.id}/respond`, token: owner.token, payload: { accept: true } });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    players.push({ ...player, applicationId: applied.body.data.id as string });
  }
  return players;
}

test("B73: capacity can't be set below the number of seated players", async () => {
  const owner = await api.register("b73");
  const created = await api.request({ method: "POST", url: "/api/v1/game-hub/tables", token: owner.token, payload: tableInput() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const tableId = created.body.data.id;
  await seatPlayers(owner, tableId, 3);
  const lowered = await api.request({ method: "PUT", url: `/api/v1/game-hub/tables/${tableId}`, token: owner.token, payload: tableInput({ capacity: 2 }) });
  assert.equal(lowered.status, 409, JSON.stringify(lowered.body));
  assert.equal(lowered.body.error.code, "CAPACITY_BELOW_SEATED");
  const listed = await api.request({ method: "GET", url: `/api/v1/game-hub/tables/${tableId}` });
  assert.equal(listed.body.data.capacity, 4);
  const same = await api.request({ method: "PUT", url: `/api/v1/game-hub/tables/${tableId}`, token: owner.token, payload: tableInput({ capacity: 3 }) });
  assert.equal(same.status, 200, JSON.stringify(same.body));
});

test("B55: a 2V2 arena invitation accepts joins until four players, then closes", async () => {
  const owner = await api.register("b55owner");
  const created = await api.request({ method: "POST", url: "/api/v1/game-hub/arena", token: owner.token, payload: { mode: "2V2", title: "Team fight", note: "" } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const listingId = created.body.data.id;
  const joiners = [await api.register("b55a"), await api.register("b55b"), await api.register("b55c"), await api.register("b55d")];
  const join = (token: string) => api.request({ method: "POST", url: `/api/v1/game-hub/arena/${listingId}/join`, token });
  const first = await join(joiners[0]!.token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.status, "OPEN");
  assert.equal((await join(joiners[0]!.token)).status, 409, "the same player can't join twice");
  assert.equal((await join(owner.token)).status, 409, "the owner can't join their own invitation");
  const second = await join(joiners[1]!.token);
  assert.equal(second.body.data.status, "OPEN");
  const third = await join(joiners[2]!.token);
  assert.equal(third.status, 200, JSON.stringify(third.body));
  assert.equal(third.body.data.status, "MATCHED");
  assert.equal(third.body.data.playerCount, 4);
  assert.equal((await join(joiners[3]!.token)).status, 409, "a full invitation refuses more players");
  const mine = await api.request({ method: "GET", url: "/api/v1/game-hub/arena/me", token: joiners[1]!.token });
  assert.ok(mine.body.data.some((row: { id: string }) => row.id === listingId), "a joined player sees the invitation in their list");
});

test("B55: a 1V1 invitation still closes after one opponent", async () => {
  const owner = await api.register("b55solo");
  const created = await api.request({ method: "POST", url: "/api/v1/game-hub/arena", token: owner.token, payload: { mode: "1V1", title: "Duel", note: "" } });
  const opponent = await api.register("b55opp");
  const joined = await api.request({ method: "POST", url: `/api/v1/game-hub/arena/${created.body.data.id}/join`, token: opponent.token });
  assert.equal(joined.body.data.status, "MATCHED");
  assert.equal(joined.body.data.opponentUserId, opponent.userId);
});
