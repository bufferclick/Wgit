import test from 'node:test';
import assert from 'node:assert/strict';
import { githubUsername } from '../src/identity.js';
test('accepts only GitHub username emails', () => {
  assert.equal(githubUsername(' BufferClick@github.com '), 'BufferClick');
  assert.equal(githubUsername('user-name@GITHUB.COM'), 'user-name');
  for (const value of ['', 'hello@example.com', '@github.com', '-foo@github.com', 'foo-@github.com', 'foo--bar@github.com', `${'a'.repeat(40)}@github.com`, 'a.b@github.com', 'bob@github.com.evil']) assert.equal(githubUsername(value), null);
});
