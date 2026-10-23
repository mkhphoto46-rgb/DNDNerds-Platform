// Friends, blocks, direct messages and groups against a real database.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => { api = await startApi(); });
after(async () => { await api?.stop(); });

const find = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object") return undefined;
  if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key];
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = find(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
};

async function friendCode(token: string): Promise<string> {
  const activated = await api.request({ method: "POST", url: "/api/v1/social/me/activate", token, payload: {} });
  assert.equal(activated.status, 200, JSON.stringify(activated.body));
  const code = find(activated.body, "friendCode");
  assert.equal(typeof code, "string", JSON.stringify(activated.body));
  return code as string;
}

async function befriend(a: { token: string }, b: { token: string; userId: string }) {
  const sent = await api.request({ method: "POST", url: "/api/v1/social/requests", token: a.token, payload: { friendCode: await friendCode(b.token) } });
  assert.ok(sent.status === 200 || sent.status === 201, JSON.stringify(sent.body));
  const incoming = await api.request({ method: "GET", url: "/api/v1/social/requests", token: b.token });
  const requestId = JSON.stringify(incoming.body).match(/"id":"([0-9a-f-]{36})"/)?.[1];
  assert.ok(requestId, JSON.stringify(incoming.body));
  const accepted = await api.request({ method: "POST", url: `/api/v1/social/requests/${requestId}/accept`, token: b.token, payload: {} });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
}

test("a friend request by friend code, accepted, lets the two send messages", async () => {
  const ann = await api.register("ann");
  const ben = await api.register("ben");
  await friendCode(ann.token);
  await befriend(ann, ben);
  const friends = await api.request({ method: "GET", url: "/api/v1/social/friends", token: ann.token });
  assert.ok(JSON.stringify(friends.body).includes(ben.userId), JSON.stringify(friends.body));

  const sent = await api.request({ method: "POST", url: `/api/v1/social/friends/${ben.userId}/messages`, token: ann.token, payload: { body: "Session on Friday?" } });
  assert.ok(sent.status === 200 || sent.status === 201, JSON.stringify(sent.body));
  const read = await api.request({ method: "GET", url: `/api/v1/social/friends/${ann.userId}/messages`, token: ben.token });
  assert.ok(JSON.stringify(read.body).includes("Session on Friday?"), JSON.stringify(read.body));
});

test("a stranger can't message, and a block stops messages between friends", async () => {
  const cat = await api.register("cat");
  const dan = await api.register("dan");
  await friendCode(cat.token);
  await friendCode(dan.token);
  const stranger = await api.request({ method: "POST", url: `/api/v1/social/friends/${dan.userId}/messages`, token: cat.token, payload: { body: "hi" } });
  assert.ok(stranger.status >= 400, `stranger message allowed: ${stranger.status}`);

  await befriend(cat, dan);
  const blocked = await api.request({ method: "POST", url: `/api/v1/social/blocks/${cat.userId}`, token: dan.token, payload: {} });
  assert.equal(blocked.status, 200, JSON.stringify(blocked.body));
  const afterBlock = await api.request({ method: "POST", url: `/api/v1/social/friends/${dan.userId}/messages`, token: cat.token, payload: { body: "still there?" } });
  assert.ok(afterBlock.status >= 400, `message after block allowed: ${afterBlock.status}`);
});

test("a group: create, invite a friend, accept, post, and the member list shows both", async () => {
  const eve = await api.register("eve");
  const fay = await api.register("fay");
  await friendCode(eve.token);
  await befriend(eve, fay);
  const created = await api.request({ method: "POST", url: "/api/v1/social/groups", token: eve.token, payload: { title: "Friday Table" } });
  assert.ok(created.status === 200 || created.status === 201, JSON.stringify(created.body));
  const groupId = (find(created.body, "id") ?? find(created.body, "groupId")) as string;
  assert.ok(groupId, JSON.stringify(created.body));

  const invited = await api.request({ method: "POST", url: `/api/v1/social/groups/${groupId}/invites`, token: eve.token, payload: { friendCode: await friendCode(fay.token) } });
  assert.ok(invited.status === 200 || invited.status === 201, JSON.stringify(invited.body));
  const invites = await api.request({ method: "GET", url: "/api/v1/social/groups/invites", token: fay.token });
  const inviteId = JSON.stringify(invites.body).match(/"id":"([0-9a-f-]{36})"/)?.[1];
  assert.ok(inviteId, JSON.stringify(invites.body));
  assert.equal((await api.request({ method: "POST", url: `/api/v1/social/groups/invites/${inviteId}/accept`, token: fay.token, payload: {} })).status, 200);

  const posted = await api.request({ method: "POST", url: `/api/v1/social/groups/${groupId}/messages`, token: fay.token, payload: { body: "Bringing snacks" } });
  assert.ok(posted.status === 200 || posted.status === 201, JSON.stringify(posted.body));
  const members = await api.request({ method: "GET", url: `/api/v1/social/groups/${groupId}/members`, token: eve.token });
  assert.ok(JSON.stringify(members.body).includes(fay.userId) && JSON.stringify(members.body).includes(eve.userId), JSON.stringify(members.body));
});
