Status: DONE
Task: Polish superhero cape/flight, remake skill sculptures, add articulated Blender fire dragon, reduce mobile effect workload.
Claimed files: none
Implementation commit: dd5afcd
Backup: C:/Users/danhp/Documents/Codex/backups/flight-polish-20261005

Changes:
- Cape: both red GLB surfaces move together about the shoulder hinge. Cloth excluded from the oversized ink hull and self shadows. No shared geometry/material edits.
- Hero flight: 18 degrees when moving, upright hover. Exponential stance blending for local/remote avatars; local visual takeoff/landing height correction. Flight accessory transition follows the same blend.
- Rebuilt five original Blender skill props: fractured mountain, layered flower, leafed spiral vine, branching blossom tree, bordered fairy wings.
- New original Blender dragon: muzzle, horns, eyes, fangs, belly, claws, tapered tail and articulated scalloped wings; existing combat hitboxes/AI unchanged.
- Mobile FX: prop budget 11 at density .45 versus 24 at full density; lazy flyer list evaluated only when trails emit (~7/sec rather than every frame).

Exact files changed during this task:
- src/costume-motion.ts
- src/outline.ts
- src/world.ts
- src/costume-fx.ts
- src/main.ts
- src/assets.ts
- src/creature-art.ts
- src/late-art.ts
- art/blender/kit/build_skill_art.py
- art/blender/kit/build_dragon.py
- public/assets/models/skill-art.glb
- public/assets/models/dragon.glb
- art/previews/kit/skill-art.png
- art/previews/kit/dragon.png
- tests/cape-flight.test.ts
- tests/costume-visuals.test.ts
- tests/world.test.ts
- tests/creature-art.test.ts
- tests/graphics-frame.test.mjs
- tests/static-host.test.mjs
- tests/context-gear-controller.test.mjs
- .ai/CODEX_STATUS.md

Validation:
- Baseline full suite: 1156 total, 1126 passed, 3 failed, 27 skipped; failures preceded these changes.
- Related visual/art/world/graphics/static tests: 81 passed; final real-GLB cape check: 3 passed.
- Final full suite: 1160 total, 1133 passed, 0 failed, 27 skipped.
- Final npm.cmd run build passed, existing large-bundle warning remains.
- Both Blender exports and preview renders succeeded. Dragon 70,080 bytes; skill kit 165,324 bytes.
- Preview browser startup: no console errors.
- Physical phone FPS and live two-account skill casting have not been measured. Unit tests cover shared poses, GLB geometry, quality budgets and remote projectile lifetime.

Coordination:
- Concurrent commits included our generators/assets, initial regression tests, main.ts/world.ts integration and static-host fixture before our final commit. Kept intact; no rollback or broad staging.
- dd5afcd contains only remaining owned changes in 14 files. Other pending work was left untouched.

Two-player test:
1. Restart multiplayer server if needed, open http://127.0.0.1:8787 in two browsers/accounts, reload the new build.
2. Equip hero and use Q: wait upright in air, begin moving, stop, turn and land. Both views should show smooth tilt up to 18 degrees and a red cape.
3. Hero W/E/R: landing burst, eye beams, spinning mountain impact. Watch both clients nearby and from separate homes.
4. Fairy Q/W/E/R: layered flowers, flapping leaf wings, charm pose, branching blossom/vines; no lingering props after travel.
5. Admin summon fire dragon; confirm model replacement, leg/wing motion, targeting and damage.
6. On phone compare Balanced/Battery Saver during repeated casts. Report actual FPS before claiming device performance gains.

