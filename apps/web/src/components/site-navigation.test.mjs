import { test } from 'node:test';
import assert from 'node:assert/strict';

test('all six destinations retain a visible Persian label and a working route', async () => {
  const { siteDestinations } = await import('./site-destinations.ts');
  assert.deepEqual(siteDestinations.map(item => item.label), ['خانه', 'دانشنامه', 'میز بازی', 'بازارچه', 'آرنا', 'نقشه‌ساز']);
  assert.equal(new Set(siteDestinations.map(item => item.href)).size, 6);
  assert.ok(siteDestinations.every(item => item.href.startsWith('/') && item.icon));
});

test('deep links activate their own section without activating similar prefixes', async () => {
  const { activeSiteDestination } = await import('./site-destinations.ts');
  for (const [path, expected] of [['/', '/'], ['/find-game/abc', '/games'], ['/account/create-game', '/games'], ['/play/abc', '/games'], ['/dm/person', '/games'], ['/player/person', '/games'], ['/checkout', '/store'], ['/seller/dashboard', '/store'], ['/cartography', '/cartography']]) {
    assert.equal(activeSiteDestination(path), expected, path);
  }
  assert.equal(activeSiteDestination('/storehouse'), undefined);
  assert.equal(activeSiteDestination('/login'), undefined);
});

test('knowledge and games have separate landing destinations', async () => {
 const {siteDestinations,activeSiteDestination}=await import('./site-destinations.ts');
 assert.equal(siteDestinations.find(x=>x.label==='میز بازی').href,'/games');
 assert.equal(siteDestinations.find(x=>x.label==='دانشنامه').href,'/knowledge');
 assert.equal(activeSiteDestination('/knowledge/homebrew/new'),'/knowledge');
 assert.equal(activeSiteDestination('/find-dm'),'/games');
});
