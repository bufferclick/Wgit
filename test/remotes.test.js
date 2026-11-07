import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as git from 'isomorphic-git';
import { githubUrl, remoteCommand, preparePush } from '../src/remotes.js';
import { onRequest } from '../functions/api/git/[[path]].js';

async function repo(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wgit-remotes-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const opts = { fs: { promises: fs }, dir };
  await git.init({ ...opts, defaultBranch: 'main' });
  await fs.writeFile(path.join(dir, 'hello.txt'), 'hello');
  await git.add({ ...opts, filepath: 'hello.txt' });
  await git.commit({ ...opts, author: { name: 'Test', email: 'test@example.com' }, message: 'first' });
  return opts;
}

test('remote commands configure Git and select the intended push target', async t => {
  const opts = await repo(t);
  assert.equal(githubUrl('https://github.com/acme/repo'), 'https://github.com/acme/repo.git');
  for (const url of ['https://github.com.evil.example/a/b.git', 'https://user:secret@github.com/a/b.git', 'http://github.com/a/b', 'https://github.com/a/b?key=secret', 'https://github.com/a/../b']) assert.throws(() => githubUrl(url));
  await remoteCommand(opts, ['add', 'origin', 'https://github.com/acme/repo']);
  assert.match(await remoteCommand(opts, ['-v']), /https:\/\/github.com\/acme\/repo.git/);
  assert.deepEqual(await preparePush(opts, ['-u', 'origin', 'main']), { remote: 'origin', branch: 'main', url: 'https://github.com/acme/repo.git', upstream: true });
  await assert.rejects(preparePush(opts, []), /No upstream/);
  await assert.rejects(preparePush(opts, ['--force', 'origin', 'main']), /Force pushes/);
  await remoteCommand(opts, ['set-url', 'origin', 'https://github.com/acme/new']);
  assert.match(await remoteCommand(opts, ['get-url', 'origin']), /new.git/);
  await remoteCommand(opts, ['remove', 'origin']);
  assert.equal(await remoteCommand(opts, []), 'No remotes configured.');
});

test('relay accepts only same-origin GitHub receive-pack and does not follow redirects', async () => {
  let requestCount = 0;
  const mockFetch = async (url, init) => { requestCount++; assert.equal(url, 'https://github.com/acme/repo.git/info/refs?service=git-receive-pack'); assert.equal(init.headers.get('authorization'), 'Basic abc'); assert.equal(init.headers.get('cookie'), null); assert.equal(init.redirect, 'manual'); return new Response('ok', { headers: { 'content-type': 'application/x-git-receive-pack-advertisement', 'set-cookie': 'not-forwarded=1' } }); };
  const valid = new Request('https://wgit.example/api/git/github.com/acme/repo.git/info/refs?service=git-receive-pack', { headers: { origin: 'https://wgit.example', authorization: 'Basic abc', cookie: 'session=secret' } });
  const response = await onRequest({ request: valid }, mockFetch);
  assert.equal(response.status, 200); assert.equal(await response.text(), 'ok'); assert.equal(response.headers.get('set-cookie'), null);
  for (const url of ['https://wgit.example/api/git/evil.com/acme/repo.git/info/refs?service=git-receive-pack', 'https://wgit.example/api/git/github.com/acme/repo.git/info/refs?service=git-upload-pack', 'https://wgit.example/api/git/github.com/acme/repo.git/other']) assert.notEqual((await onRequest({ request: new Request(url) }, mockFetch)).status, 200);
  const crossOrigin = new Request(valid.url, { headers: { origin: 'https://evil.example' } });
  assert.equal((await onRequest({ request: crossOrigin }, mockFetch)).status, 403);
  assert.equal(requestCount, 1);
  const redirected = await onRequest({ request: valid }, async () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }));
  assert.equal(redirected.status, 502); assert.equal(redirected.headers.get('location'), null);
});
