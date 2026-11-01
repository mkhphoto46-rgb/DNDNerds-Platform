import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshGate } from '../src/lib/visible-refresh-gate.mjs';

test('refreshes never overlap and coalesce requested follow-up work', async () => {
  const releases = []; let calls = 0; let visible = true;
  const refresh = createRefreshGate(() => { calls++; return new Promise(resolve => releases.push(resolve)); }, () => visible);
  const first = refresh(); refresh(); refresh();
  assert.equal(calls, 1);
  releases.shift()(); await first;
  assert.equal(calls, 2);
  releases.shift()(); await new Promise(resolve => setImmediate(resolve));
  visible = false; await refresh(); assert.equal(calls, 2);
  visible = true; await Promise.all([refresh(), Promise.resolve().then(() => releases.shift()())]);
  assert.equal(calls, 3);
});
