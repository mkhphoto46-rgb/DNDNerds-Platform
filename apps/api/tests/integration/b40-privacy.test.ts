// B40: DMs and the public see players and hosts by name and public ID only:
// no email addresses and no internal account UUIDs in these responses.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { publicAccountId } from "../../src/auth/public-identity.js";
import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
let dm: Awaited<ReturnType<TestApi["register"]>>;
let player: Awaited<ReturnType<TestApi["register"]>>;
let tableId: string;

const tableInput = { title: "B40 privacy table", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستانی", levelRange: "1-5", schedule: "Friday", capacity: 4, status: "PUBLISHED", visibility: "PUBLIC" };

function assertClean(label: string, body: unknown) {
  const text = JSON.stringify(body);
  for (const secret of [dm.email, player.email, dm.userId, player.userId]) assert.ok(!text.includes(secret), `${label} leaks ${secret === dm.email || secret === player.email ? "an email" : "an internal user id"}: ${text.slice(0, 400)}`);
  assert.ok(!/"email"/.test(text), `${label} has an email field`);
}

before(async () => {
  api = await startApi(); api.app.log.level = "silent";
  dm = await api.register("b40dm");
  player = await api.register("b40player");
  const profile = await api.request({ method: "PUT", url: "/api/v1/game-hub/dms/me", token: dm.token, payload: { displayName: "B40 Host", bio: "", playStyle: "داستانی", languages: "فارسی", experienceYears: 2, visible: true } });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  const created = await api.request({ method: "POST", url: "/api/v1/game-hub/tables", token: dm.token, payload: tableInput });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  tableId = created.body.data.id;
  const applied = await api.request({ method: "POST", url: `/api/v1/game-hub/tables/${tableId}/apply`, token: player.token, payload: { note: "hi" } });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  const review = await api.request({ method: "PUT", url: `/api/v1/game-hub/tables/${tableId}/review`, token: player.token, payload: { comment: "Great table" } });
  assert.ok(review.status < 300, JSON.stringify(review.body));
  const dmReview = await api.request({ method: "PUT", url: `/api/v1/game-hub/dms/${publicAccountId(dm.userId)}/review`, token: player.token, payload: { comment: "Great DM" } });
  assert.ok(dmReview.status < 300, JSON.stringify(dmReview.body));
});
after(async () => { await api?.stop(); });

test("B40: the DM's applications list names the player without email or account id", async () => {
  const list = await api.request({ method: "GET", url: `/api/v1/game-hub/tables/${tableId}/applications`, token: dm.token });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assertClean("applications", list.body);
  assert.ok(list.body.data[0].applicantName, JSON.stringify(list.body.data[0]));
  assert.equal(list.body.data[0].applicantPublicId, publicAccountId(player.userId));
});

test("B40: public table list, table detail and DM list carry no internal ids", async () => {
  const tables = await api.request({ method: "GET", url: "/api/v1/game-hub/tables" });
  assertClean("table list", tables.body);
  assert.ok(tables.body.data.some((row: { hostPublicId: string }) => row.hostPublicId === publicAccountId(dm.userId)));
  const detail = await api.request({ method: "GET", url: `/api/v1/game-hub/tables/${tableId}` });
  assert.equal(detail.status, 200);
  assertClean("table detail", detail.body);
  const dms = await api.request({ method: "GET", url: "/api/v1/game-hub/dms" });
  assertClean("DM list", dms.body);
  assert.ok(dms.body.data.some((row: { publicId: string }) => row.publicId === publicAccountId(dm.userId)));
});

test("B40: the public DM page opens by public ID, still opens by old UUID links, and leaks no ids", async () => {
  const byPublicId = await api.request({ method: "GET", url: `/api/v1/game-hub/dms/${publicAccountId(dm.userId)}/page` });
  assert.equal(byPublicId.status, 200, JSON.stringify(byPublicId.body));
  assertClean("DM page", byPublicId.body);
  const byUuid = await api.request({ method: "GET", url: `/api/v1/game-hub/dms/${dm.userId}/page` });
  assert.equal(byUuid.status, 200);
  const playerPage = await api.request({ method: "GET", url: `/api/v1/game-hub/players/${publicAccountId(player.userId)}/page` });
  assert.equal(playerPage.status, 200, JSON.stringify(playerPage.body));
  assertClean("player page", playerPage.body);
});

test("B40: searching by a raw account UUID finds nothing", async () => {
  const tables = await api.request({ method: "GET", url: `/api/v1/game-hub/tables?q=${dm.userId}` });
  assert.equal(tables.body.data.length, 0);
  const dms = await api.request({ method: "GET", url: `/api/v1/game-hub/dms?q=${dm.userId}` });
  assert.equal(dms.body.data.length, 0);
});

test("B40: activating a DM page without a username never uses the email prefix", async () => {
  const fresh = await api.register("b40nousername");
  await api.query(`update users set username = null where id = '${fresh.userId}'`);
  const activated = await api.request({ method: "POST", url: "/api/v1/game-hub/dms/me/activate", token: fresh.token });
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  assert.equal(activated.body.data.displayName, "DM");
});
