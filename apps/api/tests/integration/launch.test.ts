// Launching a table into its VTT: only members get a signed ticket; the
// claims name the VTT instance, the member's role and the table's edition; the
// signature checks against the published key; players wait for the DM.
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { after, before, test } from "node:test";

import { resetLaunchKey } from "../../src/integrations/launch-tickets.js";
import { startApi, type TestApi } from "../support/api.js";

let api: TestApi;
before(async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  process.env.PLATFORM_LAUNCH_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  resetLaunchKey();
  api = await startApi();
});
after(async () => {
  await api?.stop();
  delete process.env.PLATFORM_LAUNCH_PRIVATE_KEY;
  resetLaunchKey();
});

type Seat = { token: string; userId: string };
const data = (body: unknown) => (body as { data: Record<string, unknown> }).data;

async function named(name: string): Promise<Seat> {
  const seat = await api.register(name);
  await api.request({ method: "PUT", url: "/api/v1/profile/display-name", token: seat.token, payload: { displayName: name } });
  return seat;
}
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

test("only members launch; the DM opens the table first; the ticket is signed for the table's VTT", async () => {
  const dm = await named("Morgan");
  const player = await named("Robin");
  const outsider = await named("Casey");
  const table = data((await api.request({ method: "POST", url: "/api/v1/tables", token: dm.token, payload: { name: "Lost Mine", edition: "2014" } })).body) as { id: string; joinCode: string };
  await api.request({ method: "POST", url: "/api/v1/tables/join", token: player.token, payload: { joinCode: table.joinCode } });

  const noVtt = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/launch`, token: dm.token, payload: {} });
  assert.equal(noVtt.status, 409, "a VTT must be chosen");
  const instance = data((await api.request({ method: "POST", url: "/api/v1/vtt-instances", token: dm.token, payload: { name: "Home", baseUrl: "http://localhost:4600" } })).body) as { id: string };
  await api.request({ method: "PATCH", url: `/api/v1/tables/${table.id}`, token: dm.token, payload: { vttInstanceId: instance.id } });

  assert.equal((await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/launch`, token: outsider.token, payload: {} })).status, 404, "not a member");
  assert.equal((await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/launch`, token: player.token, payload: {} })).status, 409, "the DM opens it first");

  const launched = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/launch`, token: dm.token, payload: {} });
  assert.equal(launched.status, 200, JSON.stringify(launched.body));
  const url = String(data(launched.body).url);
  assert.ok(url.startsWith("http://localhost:4600/platform/launch#t="), url);
  const token = url.split("#t=")[1]!;
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(decode(header!).alg, "EdDSA");
  const claims = decode(payload!);
  assert.equal(claims.iss, "dndnerds-platform");
  assert.equal(claims.aud, instance.id);
  assert.equal(claims.sub, dm.userId);
  assert.equal(claims.name, "Morgan");
  assert.equal(claims.role, "dm");
  assert.equal(claims.tbl, table.id);
  assert.equal(claims.ed, "2014");
  assert.ok(claims.exp - claims.iat <= 60);
  assert.equal(JSON.stringify(claims).includes("@"), false, "no email in the ticket");

  const keys = data((await api.request({ method: "GET", url: "/api/v1/platform/launch-keys" })).body) as { keys: Array<{ publicKeyPem: string }> };
  const publicKey = createPublicKey(keys.keys[0]!.publicKeyPem);
  assert.equal(verify(null, Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature!, "base64url")), true);

  // Now the player can enter, as a player.
  const playerLaunch = await api.request({ method: "POST", url: `/api/v1/tables/${table.id}/launch`, token: player.token, payload: {} });
  assert.equal(playerLaunch.status, 200);
  assert.equal(decode(String(data(playerLaunch.body).url).split("#t=")[1]!.split(".")[1]!).role, "player");
  const tickets = await api.query(`SELECT role FROM vtt_launch_tickets WHERE table_id = '${table.id}' ORDER BY issued_at`) as Array<{ role: string }>;
  assert.deepEqual(tickets.map((row) => row.role), ["dm", "player"]);
});
