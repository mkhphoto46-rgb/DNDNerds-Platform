import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { requestVttTableDeletion } from '../../src/integrations/vtt-table-deletion.js';

test('deletion bridge signs the exact owner/table intent and rejects untrusted destinations', async () => {
  const input = { tableId: '11111111-1111-4111-8111-111111111111', hostUserId: '22222222-2222-4222-8222-222222222222' };
  const secret = 'a'.repeat(64);
  let calls = 0;
  const fake = (async (url, init) => {
    calls++;
    assert.equal(String(url), 'http://127.0.0.1:4200/api/platform/delete-table');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.signature, createHmac('sha256', secret).update(`${body.timestamp}:delete:${JSON.stringify(input)}`).digest('hex'));
    assert.equal(body.hostUserId, input.hostUserId);
    return new Response(JSON.stringify({ data: { deleted: true } }), { status: 200 });
  }) as typeof fetch;
  assert.equal(await requestVttTableDeletion(input, secret, 'https://attacker.invalid', fake), false);
  assert.equal(calls, 0);
  assert.equal(await requestVttTableDeletion(input, secret, undefined, fake), true);
  assert.equal(calls, 1);
  assert.equal(await requestVttTableDeletion(input, secret, undefined, (async () => new Response('{}')) as typeof fetch), false);
  assert.equal(await requestVttTableDeletion(input, secret, undefined, (async () => { throw new Error('network'); }) as typeof fetch), false);
});
