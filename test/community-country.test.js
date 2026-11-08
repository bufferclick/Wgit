import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/community-country.js';
test('country endpoint only returns a valid approximate country code', async () => {
  assert.deepEqual(await onRequestGet({ request: { cf: { country: 'SE' } } }).json(), { country: 'SE' });
  for (const country of ['XX', 'T1', 'sweden', '', null]) assert.deepEqual(await onRequestGet({ request: { cf: { country } } }).json(), { country: null });
  assert.deepEqual(await onRequestGet({ request: {} }).json(), { country: null });
});
