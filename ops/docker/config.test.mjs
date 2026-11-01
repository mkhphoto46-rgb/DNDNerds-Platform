import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../..', import.meta.url));
function config(file, extra = []) {
  return JSON.parse(execFileSync('docker', ['compose', '--profile', '*', ...extra, '-f', file, 'config', '--no-env-resolution', '--format', 'json'], {
    cwd, encoding: 'utf8', timeout: 15_000, env: { ...process.env, RELEASE_TAG: 'test-immutable-source' },
  }));
}
test('production staging cannot own database volumes and only exposes app ports on loopback', () => {
  const c = config('ops/docker/compose.production.yml', ['--env-file', 'ops/docker/compose-settings.env.example']);
  assert.deepEqual(Object.keys(c.services).sort(), ['api', 'finance-worker', 'web']);
  assert.equal(c.networks.existing_data.external, true);
  assert.ok(!c.volumes || Object.keys(c.volumes).length === 0);
  for (const name of ['api', 'web']) {
    const service = c.services[name];
    assert.equal(service.read_only, true);
    assert.ok(service.cap_drop.includes('ALL'));
    assert.ok(service.security_opt.includes('no-new-privileges:true'));
    assert.equal(service.platform, 'linux/amd64');
    for (const port of service.ports) assert.equal(port.host_ip, '127.0.0.1');
  }
  assert.deepEqual(c.services['finance-worker'].profiles, ['finance-approved']);
  assert.equal(c.services.web.environment.MARKETPLACE_API_BASE_URL, 'http://api:4100');
  assert.equal(c.services.web.tmpfs.length, 2);
});
test('isolated stack has private databases and explicit opt-in migration', () => {
  const c = config('ops/docker/compose.test.yml');
  assert.equal(c.services.postgres.ports, undefined);
  assert.equal(c.services.redis.ports, undefined);
  assert.deepEqual(c.services.migrate.profiles, ['migration-test']);
  assert.equal(c.services.migrate.command[1], 'dist/db/migrate-production.js');
  for (const service of Object.values(c.services)) {
    assert.equal(service.network_mode, undefined);
    for (const volume of service.volumes ?? []) assert.equal(volume.type, 'volume');
  }
});
