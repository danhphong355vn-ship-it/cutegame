import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ArenaView } from '../src/arena-view.ts';
import { ARENA } from '../src/world-events.ts';

test('ArenaView builds a complete 3D stadium with floor, pillars, torches, and glowing ropes', () => {
  const arena = new ArenaView();
  assert.equal(arena.group.name, 'pvp-arena-stadium');
  assert.ok(arena.group.children.length > 20, 'Arena must contain multiple structural meshes');

  const meshes = [];
  arena.group.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
  assert.ok(meshes.length >= 25, 'Arena must have floor, rims, emblems, pillars, braziers, flames, ropes, and gate');

  // Verify ropes are 3D Torus meshes with emissive glow
  assert.equal(arena.ringRopes.length, 3, 'Must have exactly 3-tier 3D glowing ropes');
  assert.ok(arena.ringRopes.every(r => r.material.emissiveIntensity > 0.5));

  // Verify 8 flames
  const flames = meshes.filter(m => m.geometry instanceof T.ConeGeometry && m.material instanceof T.MeshBasicMaterial && m.material.color.getHexString() === 'ff6600');
  assert.equal(flames.length, 8, 'Must have 8 torch flames atop pillars');

  // Verify attach & scenery cleaning
  const worldRoot = new T.Group();
  const obstacleInside = new T.Mesh(new T.BoxGeometry(1, 1, 1));
  obstacleInside.position.set(ARENA.x + 2, 0, ARENA.z + 2);
  worldRoot.add(obstacleInside);

  const obstacleOutside = new T.Mesh(new T.BoxGeometry(1, 1, 1));
  obstacleOutside.position.set(ARENA.x + 30, 0, ARENA.z + 30);
  worldRoot.add(obstacleOutside);

  arena.attach(worldRoot);
  assert.equal(arena.group.parent, worldRoot);
  assert.equal(obstacleInside.visible, false, 'Scenery inside arena radius must be cleared/hidden');
  assert.equal(obstacleOutside.visible, true, 'Scenery outside arena radius must remain visible');

  // Verify update loop does not crash
  arena.update(0.1, false);
  arena.update(0.1, true);

  // Verify detach and dispose
  arena.detach();
  assert.equal(obstacleInside.visible, true, 'Scenery inside arena must be restored on detach');
  assert.equal(arena.group.parent, null);

  arena.dispose();
});
