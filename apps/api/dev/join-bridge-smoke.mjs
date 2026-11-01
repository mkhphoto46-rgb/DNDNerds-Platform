// Isolated local PostgreSQL fixture; never targets production or sends email.
// Requires the local VTT test server and a separate Redis logical DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import postgres from 'postgres';
import { freePort, migrateDatabase, startPostgres } from './stack-lib.mjs';

const origin = process.env.JOIN_TEST_VTT_ORIGIN ?? 'http://127.0.0.1:4319';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dnd-join-api-'));
let pg, app;
const sockets = [];
try {
  pg = await startPostgres({ dir: data, port: await freePort(), database: 'join_parent' });
  const setup = postgres(pg.url);
  await setup.unsafe("CREATE DATABASE join_utf8 TEMPLATE template0 ENCODING 'UTF8'");
  await setup.end();
  const databaseUrl = pg.url.replace('/join_parent', '/join_utf8');
  await migrateDatabase(databaseUrl);
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: databaseUrl,
    REDIS_URL: process.env.JOIN_TEST_REDIS_URL ?? 'redis://127.0.0.1:6380/15',
    FREE_LAUNCH_MODE: 'true', VTT_BRIDGE_SECRET: 'a'.repeat(64),
    VTT_INTERNAL_URL: origin, VTT_PUBLIC_URL: origin + '/',
    MFA_ENCRYPTION_KEY: 'a'.repeat(64), PAYOUT_DESTINATION_ENCRYPTION_KEY: 'b'.repeat(64),
  });
  const require = createRequire(import.meta.url);
  const { buildApp } = require('../dist/app.js');
  const { sqlClient } = require('../dist/db/client.js');
  const { issueSession } = require('../dist/auth/session.js');
  app = await buildApp(); app.log.level = 'silent';
  const people = [];
  for (let index = 0; index < 4; index++) {
    const [person] = await sqlClient`INSERT INTO users (email,username,status,email_verified) VALUES (${`join${index}@example.invalid`},${`join_audit_${index}`},'ACTIVE',true) RETURNING id`;
    people.push({ id: person.id, token: (await issueSession(person.id)).token });
  }
  const [dm, player, native, overflow] = people;
  async function api(person, url, payload) {
    return app.inject({ method: 'POST', url: '/api/v1/game-hub/' + url, headers: { authorization: `Bearer ${person.token}` }, payload });
  }
  const created = await api(dm, 'tables', {
    title: 'Local player-first bridge audit ' + 'x'.repeat(65), description: '', system: 'D&D 5e', language: 'English',
    playStyle: 'Story', levelRange: '1-5', schedule: 'Weekly', capacity: 2, status: 'PUBLISHED', visibility: 'PRIVATE',
  });
  assert.equal(created.statusCode, 201, created.body);
  const table = created.json().data;
  let response = await api(player, 'tables/join-by-code', { code: ` ${table.inviteCode.toLowerCase()} ` });
  assert.equal(response.statusCode, 200, response.body);
  response = await api(player, `tables/${table.id}/launch`, { role: 'player' });
  assert.equal(response.statusCode, 200, response.body);
  async function redeem(url) {
    const result = await fetch(url, { redirect: 'manual', headers: { 'X-Forwarded-For': '198.51.100.60' } });
    assert.equal(result.status, 303, await result.text());
    return { campaignId: new URL(result.headers.get('location'), origin).searchParams.get('platformCampaignId'), cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  const first = await redeem(response.json().data.url);
  response = await api(dm, `tables/${table.id}/launch`, { role: 'dm' });
  assert.equal(response.statusCode, 200);
  const owner = await redeem(response.json().data.url);
  assert.equal(owner.campaignId, first.campaignId);
  const rows = await (await fetch(origin + '/api/my-campaigns', { headers: { Cookie: owner.cookie, 'X-Forwarded-For': '198.51.100.60' } })).json();
  const campaign = rows.find(row => row.id === owner.campaignId);
  assert.equal(campaign.membershipRole, 'dm'); assert.equal(campaign.joinCode.length, 6);
  response = await api(native, 'tables/join-by-code', { code: campaign.joinCode });
  assert.equal(response.statusCode, 200, response.body);
  const invited = await redeem(response.json().data.launchUrl);
  assert.equal(invited.campaignId, owner.campaignId);
  response = await api(overflow, 'tables/join-by-code', { code: campaign.joinCode });
  assert.equal(response.statusCode, 409, response.body);
  const [seatCount] = await sqlClient`SELECT count(*)::int AS total FROM game_applications WHERE table_id=${table.id} AND status='ACCEPTED'`;
  assert.equal(seatCount.total, 2);
  const socketPackage = process.env.JOIN_TEST_SOCKET_PACKAGE;
  if (!socketPackage) throw Error('Set JOIN_TEST_SOCKET_PACKAGE to the local VTT socket.io-client package directory');
  const { io } = require(socketPackage);
  for (const [seat, role] of [[first, 'player'], [owner, 'dm'], [invited, 'player']]) {
    const identity = await (await fetch(origin + '/api/auth/me', { headers: { Cookie: seat.cookie } })).json();
    const socket = io(origin, { transports: ['websocket'], extraHeaders: { Cookie: seat.cookie, 'X-Forwarded-For': '198.51.100.60' } }); sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); setTimeout(() => reject(Error('socket timeout')), 5000).unref(); });
    const ack = await new Promise((resolve, reject) => socket.timeout(5000).emit('session:join', { role, campaignId: seat.campaignId, name: identity.account.username }, (error, value) => error ? reject(error) : resolve(value)));
    assert.equal(ack.ok, true, ack.error);
  }
  console.log(JSON.stringify({ isolatedDatabase: true, siteCodeAccepted: true, playerFirstSeated: true, actualDmOwnership: true, nativeCodeAccepted: true, seatCapacityPreserved: true, allThreeSocketsJoined: true }));
} finally {
  for (const socket of sockets) socket.disconnect();
  if (app) await app.close();
  if (pg) await pg.stop();
  // Keep this named local fixture for diagnosis. No production cleanup or email.
}
process.exit(0);
