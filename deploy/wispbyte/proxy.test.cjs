const assert = require('node:assert/strict');
const { test } = require('node:test');
const { routeRequest } = require('./proxy.cjs');

test('the tavern app and its websocket stay on the VTT backend', () => {
  assert.deepEqual(routeRequest('/vtt/api/platform/launch?ticket=x', ''), { port: 4200, path: '/api/platform/launch?ticket=x' });
  assert.deepEqual(routeRequest('/vtt/assets/main.js', ''), { port: 4200, path: '/assets/main.js' });
  assert.deepEqual(routeRequest('/socket.io/?EIO=4', ''), { port: 4200, path: '/socket.io/?EIO=4' });
});

test('VTT fetches use the game backend while platform API calls stay on Next', () => {
  assert.deepEqual(routeRequest('/api/auth/me', 'https://dndnerds.wispbyte.app/vtt/'), { port: 4200, path: '/api/auth/me' });
  assert.deepEqual(routeRequest('/api/xp/heartbeat', 'https://dndnerds.wispbyte.app/vtt/'), { port: 3100, path: '/api/xp/heartbeat' });
  assert.deepEqual(routeRequest('/api/game-hub/tables', 'https://dndnerds.wispbyte.app/tavern'), { port: 3100, path: '/api/game-hub/tables' });
});
