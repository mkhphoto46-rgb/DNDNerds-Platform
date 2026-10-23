// Game tables (roadmap phase 10): a DM creates a table, invites a friend or
// shares a join code; seats, roles, blocks and the edition lock are enforced.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); });
after(async () => { await api?.stop(); });

type Seat = { token: string; userId: string };

const find = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = find(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};
const data = (body: unknown) => (body as { data: Record<string, unknown> }).data;

async function friendCode(token: string): Promise<string> {
  const activated = await api.request({ method: "POST", url: "/api/v1/social/me/activate", token, payload: {} });
  return find(activated.body, "friendCode") as string;
}
async function befriend(a: Seat, b: Seat) {
  await friendCode(a.token);
  await api.request({ method: "POST", url: "/api/v1/social/requests", token: a.token, payload: { friendCode: await friendCode(b.token) } });
  const incoming = await api.request({ method: "GET", url: "/api/v1/social/requests", token: b.token });
  const requestId = JSON.stringify(incoming.body).match(/"id":"([0-9a-f-]{36})"/)?.[1];
  await api.request({ method: "POST", url: `/api/v1/social/requests/${requestId}/accept`, token: b.token, payload: {} });
}
async function named(name: string, displayName = name[0]!.toUpperCase() + name.slice(1)): Promise<Seat> {
  const seat = await api.register(name);
  const set = await api.request({ method: "PUT", url: "/api/v1/profile/display-name", token: seat.token, payload: { displayName } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  return seat;
}
async function createTable(dm: Seat, payload: Record<string, unknown> = {}) {
  const created = await api.request({ method: "POST", url: "/api/v1/tables", token: dm.token, payload: { name: "Curse of the Crypt", edition: "2014", ...payload } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return data(created.body) as { id: string; joinCode: string; edition: string };
}

test("a display name is required, and the DM's table starts with the DM seated", async () => {
  const nameless = await api.register("nameless");
  const refused = await api.request({ method: "POST", url: "/api/v1/tables", token: nameless.token, payload: { name: "No name" } });
  assert.equal(refused.status, 409);
  const short = await api.request({ method: "PUT", url: "/api/v1/profile/display-name", token: nameless.token, payload: { displayName: "x" } });
  assert.equal(short.status, 400);

  const dm = await named("dungeon", "Morgan");
  const table = await createTable(dm);
  assert.match(table.joinCode, /^[A-Z0-9]{8}$/);
  const mine = await api.request({ method: "GET", url: "/api/v1/tables", token: dm.token });
  assert.deepEqual((data(mine.body) as unknown as Array<{ id: string; role: string }>).map((row) => [row.id, row.role]), [[table.id, "dm"]]);
  const details = data((await api.request({ method: "GET", url: `/api/v1/tables/${table.id}`, token: dm.token })).body)
  assert.deepEqual((details.members as Array<{ displayName: string; role: string }>).map((member) => [member.displayName, member.role]), [["Morgan", "dm"]]);
  assert.equal(JSON.stringify(details).includes("@"), false, "no email in the table");
});

test("an invited friend accepts; a stranger can't be invited; members see no join code", async () => {
  const dm = await named("keeper");
  const friend = await named("friend");
  const stranger = await named("stranger");
  await befriend(dm, friend);
  const table = await createTable(dm);
  const invited = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/invites`, token: dm.token, payload: { friendCode: await friendCode(friend.token) } });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  const notFriend = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/invites`, token: dm.token, payload: { friendCode: await friendCode(stranger.token) } });
  assert.equal(notFriend.status, 403);

  const invites = data(await api.request({ method: "GET", url: "/api/v1/tables/invites/mine", token: friend.token }).then((r) => r.body)) as unknown as Array<{ id: string }>;
  const accepted = await api.request({ method: "POST", url: `/api/v1/tables/invites/${invites[0]!.id}/accept`, token: friend.token, payload: {} });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const asMember = data((await api.request({ method: "GET", url: `/api/v1/tables/${table.id}`, token: friend.token })).body);
  assert.equal(asMember.joinCode, null);
  assert.equal(asMember.role, "player");
  const outsider = await api.request({ method: "GET", url: `/api/v1/tables/${table.id}`, token: stranger.token });
  assert.equal(outsider.status, 404);
  const notDm = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/invites`, token: friend.token, payload: { friendCode: await friendCode(stranger.token) } });
  assert.equal(notDm.status, 403, "only the DM invites");
});

test("the join code fills player seats up to the limit; one observer; roles change within the seats", async () => {
  const dm = await named("host");
  const table = await createTable(dm, { maxPlayers: 1 });
  const first = await named("first");
  const second = await named("second");
  const joined = await api.request({ method: "POST", url: "/api/v1/tables/join", token: first.token, payload: { joinCode: table.joinCode } });
  assert.equal(joined.status, 201, JSON.stringify(joined.body));
  const full = await api.request({ method: "POST", url: "/api/v1/tables/join", token: second.token, payload: { joinCode: table.joinCode } });
  assert.equal(full.status, 409, "one player seat");

  // The first player becomes the observer, which frees the player seat.
  const moved = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}/members/${first.userId}`, token: dm.token, payload: { role: "observer" } });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal((await api.request({ method: "POST", url: "/api/v1/tables/join", token: second.token, payload: { joinCode: table.joinCode } })).status, 201);
  const secondObserver = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}/members/${second.userId}`, token: dm.token, payload: { role: "observer" } });
  assert.equal(secondObserver.status, 409, "one observer seat");

  assert.equal((await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/leave`, token: second.token, payload: {} })).status, 200);
  assert.equal((await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/leave`, token: dm.token, payload: {} })).status, 409, "the DM stays");
  assert.equal((await api.request({ method: "DELETE", url: `/api/v1/tables/${table.id}/members/${first.userId}`, token: dm.token })).status, 200);
});

test("a block keeps a user from joining; the edition is locked after the first launch unless confirmed", async () => {
  const dm = await named("warden");
  const pest = await named("pest");
  await friendCode(dm.token);
  await friendCode(pest.token);
  const block = await api.request({ method: "POST", url: `/api/v1/social/blocks/${pest.userId}`, token: dm.token, payload: {} });
  assert.equal(block.status, 200, JSON.stringify(block.body));
  const table = await createTable(dm);
  const refused = await api.request({ method: "POST", url: "/api/v1/tables/join", token: pest.token, payload: { joinCode: table.joinCode } });
  assert.equal(refused.status, 403);

  const changed = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}`, token: dm.token, payload: { edition: "2024" } });
  assert.equal(changed.status, 200, "free before the first launch");
  await api.query(`UPDATE game_tables SET first_launched_at = now() WHERE id = '${table.id}'`);
  const locked = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}`, token: dm.token, payload: { edition: "2014" } });
  assert.equal(locked.status, 409);
  const confirmed = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}`, token: dm.token, payload: { edition: "2014", confirmEditionChange: true } });
  assert.equal(confirmed.status, 200);
});

test("a VTT address must be https (or http on localhost) and belong to the DM", async () => {
  const dm = await named("builder");
  const other = await named("other");
  const insecure = await api.request({ method: "POST", url: "/api/v1/vtt-instances", token: dm.token, payload: { name: "Home", baseUrl: "http://example.com" } });
  assert.equal(insecure.status, 400);
  const local = await api.request({ method: "POST", url: "/api/v1/vtt-instances", token: dm.token, payload: { name: "Home", baseUrl: "http://localhost:4600/some/path" } });
  assert.equal(local.status, 201, JSON.stringify(local.body));
  assert.equal(data(local.body).baseUrl, "http://localhost:4600");
  const table = await createTable(other);
  const notTheirs = await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}`, token: other.token, payload: { vttInstanceId: data(local.body).id } });
  assert.equal(notTheirs.status, 400);
});
