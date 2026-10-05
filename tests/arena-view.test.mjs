import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ArenaView } from '../src/arena-view.ts';
import { ARENA } from '../src/world-events.ts';

test('ArenaView builds a complete 3D stadium with floor level with ground, cleans ores, and repels enemies', () => {
  const arena = new ArenaView();
  assert.equal(arena.group.name, 'pvp-arena-stadium');
  assert.ok(arena.group.children.length > 20, 'Arena must contain multiple structural meshes');

  const meshes = [];
  arena.group.traverse(o => { if (o instanceof T.Mesh) meshes.push(o); });
  assert.ok(meshes.length >= 25, 'Arena must have floor, rims, emblems, pillars, braziers, flames, ropes, and gate');

  // Verify floor surface is flush with ground (y <= 0.04) so players do not sink into the floor
  const floorMesh = meshes.find(m => m.geometry instanceof T.CylinderGeometry && m.geometry.parameters.radiusTop === ARENA.radius);
  assert.ok(floorMesh, 'Combat floor cylinder must exist');
  assert.ok(floorMesh.position.y <= 0.04, 'Combat floor must be flush with ground level (y <= 0.04)');

  // Verify ropes are 3D Torus meshes with emissive glow
  assert.equal(arena.ringRopes.length, 3, 'Must have exactly 3-tier 3D glowing ropes');
  assert.ok(arena.ringRopes.every(r => r.material.emissiveIntensity > 0.5));

  // Verify 8 flames
  const flames = meshes.filter(m => m.geometry instanceof T.ConeGeometry && m.material instanceof T.MeshBasicMaterial && m.material.color.getHexString() === 'ff6600');
  assert.equal(flames.length, 8, 'Must have 8 torch flames atop pillars');

  // Verify attach & scenery + ore cleaning
  const worldRoot = new T.Group();
  const obstacleInside = new T.Mesh(new T.BoxGeometry(1, 1, 1));
  obstacleInside.position.set(ARENA.x + 2, 0, ARENA.z + 2);
  worldRoot.add(obstacleInside);

  const obstacleOutside = new T.Mesh(new T.BoxGeometry(1, 1, 1));
  obstacleOutside.position.set(ARENA.x + 30, 0, ARENA.z + 30);
  worldRoot.add(obstacleOutside);

  // Ore entity inside arena
  const oreInside = {
    id: 'magma-ore-1',
    kind: 'magma-ore',
    x: ARENA.x + 3,
    z: ARENA.z + 3,
    mesh: new T.Mesh(new T.BoxGeometry(1, 1, 1)),
  };
  const oreOutside = {
    id: 'magma-ore-2',
    kind: 'magma-ore',
    x: ARENA.x + 25,
    z: ARENA.z + 25,
    mesh: new T.Mesh(new T.BoxGeometry(1, 1, 1)),
  };

  // Mock enemy wandering inside arena
  const enemyInside = {
    id: 'slime-1',
    type: 'magmaslime',
    x: ARENA.x + 1,
    z: ARENA.z + 1,
    homeX: ARENA.x + 1,
    homeZ: ARENA.z + 1,
    hp: 100,
    mesh: { position: { x: ARENA.x + 1, y: 0, z: ARENA.z + 1 } },
  };

  const mockWorld = {
    root: worldRoot,
    entities: [oreInside, oreOutside],
    obstacles: [
      { x: ARENA.x + 2, z: ARENA.z + 2, r: 1 },
      { x: ARENA.x + 30, z: ARENA.z + 30, r: 1 },
    ],
    enemies: [enemyInside],
  };

  arena.attach(worldRoot, undefined, mockWorld);
  assert.equal(arena.group.parent, worldRoot);
  assert.equal(obstacleInside.visible, false, 'Scenery inside arena radius must be cleared/hidden');
  assert.equal(obstacleOutside.visible, true, 'Scenery outside arena radius must remain visible');
  assert.equal(oreInside.mesh.visible, false, 'Ore node inside arena must be hidden');
  assert.equal(oreOutside.mesh.visible, true, 'Ore node outside arena must remain visible');
  assert.equal(mockWorld.obstacles.length, 1, 'Obstacles inside arena must be removed from collision');

  // Verify enemy repelling on update
  arena.update(0.1, false, mockWorld);
  const enemyDist = Math.hypot(enemyInside.x - ARENA.x, enemyInside.z - ARENA.z);
  assert.ok(enemyDist >= ARENA.radius + 2, `Enemy must be repelled outside arena (dist=${enemyDist}, radius=${ARENA.radius})`);
  assert.equal(enemyInside.mesh.position.x, enemyInside.x);
  assert.equal(enemyInside.mesh.position.z, enemyInside.z);

  // Verify detach restores scenery
  arena.detach();
  assert.equal(obstacleInside.visible, true, 'Scenery inside arena must be restored on detach');
  assert.equal(mockWorld.obstacles.length, 2, 'Obstacles must be restored on detach');
  assert.equal(arena.group.parent, null);

  arena.dispose();
});
