import assert from 'node:assert/strict';
import test from 'node:test';
import { safeAuthDestination } from '../apps/web/src/lib/auth-destination.ts';

test('preserves an invitation anchor and a table edit query after authentication', () => {
  assert.equal(safeAuthDestination('/find-game#join'), '/find-game#join');
  assert.equal(safeAuthDestination('/create-game?edit=table-123'), '/create-game?edit=table-123');
  assert.equal(safeAuthDestination('/account/games'), '/account/games');
});

test('rejects external, protocol-relative, encoded and malformed destinations', () => {
  for (const path of [null, '', 'https://evil.example/', '//evil.example', '/\\evil.example', '/%2f%2fevil.example', '/\nevil.example', 'javascript:alert(1)']) {
    assert.equal(safeAuthDestination(path), '/', JSON.stringify(path));
  }
});
