Status: DONE
Task: Fix dragon basic/skill progression interrupted by delayed authority echoes; isolate ambient dragon lifecycle from World Boss.
Claimed files: none
Commit: 2d40f9f
Files changed: src/world.ts, tests/world.test.ts, .ai/CODEX_STATUS.md
Backup: C:/Users/danhp/Documents/Codex/backups/dragon-combat-20261005

Cause and fix:
- Host was applying stale cooldown, skill, attackCount and skillCount from the server back onto its own running AI. Reproduced attackCount 1 becoming undefined after an old snapshot.
- Preserve existing host AI fields; server HP, damage, status effects and control remain authoritative. Newly received entities and peer clients still adopt snapshot AI state.
- Mark World Boss entities and exclude them from ambient dragon summon/dismiss actions.

Validation:
- Baseline world tests passed.
- Regression failed before fix and passed after fix, including normal hit reaching the player and progression to special skill.
- Related world/boss/authority/event tests: 104 passed.
- Full suite: 1163 total, 1136 passed, 0 failed, 27 skipped.
- Build passed with existing large-bundle warning.
- Actual two-browser gameplay still requires user verification.

Test in game:
- Reload both browsers with the rebuilt client. Summon World Boss dragon on lava.
- Stand on the ground near it, outside spawn protection, without stealth or repeatedly stunning it. Wait for normal windup/strike and the following skill telegraph/projectiles.
- Confirm both clients see the attack and eligible players receive damage; melee deliberately cannot hit a flying player.
- Admin level/high defenses and fast garden healing can make HP changes hard to see.

Pending follow-up from user (not edited in this task):
- Flight briefly walks at takeoff; remove that walking transition.
- Check tilt direction and use 50 degrees when moving.
- User explicitly prioritized completing this dragon fix first.
