Status: DONE
Task: Fix summoned boss unable to reach attack range; remove airborne walking and set superhero moving flight to 50 degrees forward.
Claimed files: none
Implementation commit: 20a013a
Backup: C:/Users/danhp/Documents/Codex/backups/boss-flight-20261005

Actual cause of persistent boss stall:
- World Boss radius is scaled 1.8x (dragon radius 2.88), and separation keeps the player 3.332 metres away.
- Dragon windup still required distance below 3.2, so collision prevented it reaching its own attack threshold.
- Real World update + combat-authority timed loop reproduced one initial strike followed by permanent chase with zero skill casts. This was absent from the prior AI-only test, which omitted separation.
- Windup, strike and chase stopping distances now include the extra collision radius. Ordinary unscaled creature reach is unchanged.

Flight:
- Moving superhero tilt changed from 18 to 50 degrees, toward +Z local forward and the current heading.
- Walking gait is disabled while flying; flight legs applied immediately on takeoff.
- Hover-cast startup no longer prevents flight stance on either local or remote avatars.
- Body/arms and takeoff altitude retain smooth transitions; idle hover stays upright.

Exact files changed:
- src/world.ts
- src/costume-motion.ts
- tests/world.test.ts
- tests/cape-flight.test.ts
- tests/costume-visuals.test.ts
- tests/world-boss-loop.test.ts
- .ai/CODEX_STATUS.md

Validation:
- New live authority-loop regression runs actual World.update (including collision separation), summon, timed server broadcasts, host uploads and durable player-health updates.
- After fix, stationary player outside the boss collision circle receives a normal strike, boss progresses to a skill, server authorizes the cast and commits HP loss. Test passed with actual player max HP.
- Local/remote first-frame takeoff assertions passed; 50 degree lean points forward at all four cardinal headings.
- Full suite: 1165 total, 1138 passed, 0 failed, 27 skipped.
- Latest strengthened authority HP and remote takeoff assertions passed separately after the full run.
- Build passed; existing bundle-size warning remains.
- This integration test connects the real client world and server authority directly; it is not a manual two-browser WebSocket gameplay check.

In-game check:
1. Reload both game browsers using Ctrl+F5 to load the rebuilt client.
2. Summon dragon on lava, stand nearby on ground without attacking or stunning it; watch windup, normal hit and the following skill. Both accounts should see attacks and eligible ground players lose HP.
3. Hero Q while moving: flight legs start immediately, body eases toward 50 degrees forward; stop to hover upright, move again, turn and land.
4. All other pending files were preserved and excluded from this commit; no server source edits were necessary.
