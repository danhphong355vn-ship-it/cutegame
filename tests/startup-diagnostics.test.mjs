import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupFailureHint } from '../server/server.mjs';

test('startup diagnostics identify database failures without printing credentials', () => {
  const secret = 'postgresql://user:private-password@example.com/game';
  const failures = [
    [new Error('DATABASE_URL is required for this deployment. No temporary account storage was started.'), 'missing'],
    [Object.assign(new Error(secret), { code: '28P01' }), 'authentication'],
    [new Error('Database read failed', { cause: Object.assign(new Error(secret), { code: 'ENOTFOUND' }) }), 'hostname'],
    [Object.assign(new Error(secret), { code: 'ETIMEDOUT' }), 'could not be reached'],
    [new Error(secret), 'configuration failed'],
  ];
  for (const [error, expected] of failures) {
    const hint = startupFailureHint(error);
    assert.match(hint, new RegExp(expected));
    assert.doesNotMatch(hint, /private-password|example\.com/);
  }
});
