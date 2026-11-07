import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';
import * as git from 'isomorphic-git';
import { syncBranch } from '../src/sync.js';
const run = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wgit-sync-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'project.git'), seed = path.join(root, 'seed'), local = path.join(root, 'local');
  await fs.mkdir(seed); await fs.mkdir(local);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
  run(seed, 'init', '-b', 'main'); run(seed, 'config', 'user.name', 'Remote'); run(seed, 'config', 'user.email', 'remote@example.com');
  await fs.writeFile(path.join(seed, 'README.md'), 'GitHub README\n'); await fs.writeFile(path.join(seed, 'remote-only.txt'), 'remote file\n');
  run(seed, 'add', '.'); run(seed, 'commit', '-m', 'remote initial'); run(seed, 'push', remote, 'main');
  run(local, 'init', '-b', 'main'); run(local, 'config', 'user.name', 'Local'); run(local, 'config', 'user.email', 'local@example.com');
  await fs.writeFile(path.join(local, 'README.md'), 'Local README\n'); await fs.writeFile(path.join(local, 'local-only.txt'), 'local file\n');
  run(local, 'add', '.'); run(local, 'commit', '-m', 'local initial'); run(local, 'remote', 'add', 'origin', 'https://github.com/acme/project.git');
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = Buffer.concat(chunks), url = new URL(req.url, 'http://localhost');
    const result = spawnSync('git', ['http-backend'], { input: body, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_PROJECT_ROOT: root, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname.replace('/github.com/acme', ''), QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method, CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: String(body.length), REMOTE_USER: 'test', SERVER_PROTOCOL: 'HTTP/1.1' } });
    let i = result.stdout.indexOf('\r\n\r\n'), n = 4; if (i < 0) { i = result.stdout.indexOf('\n\n'); n = 2; }
    if (result.status || i < 0) { res.writeHead(500); return res.end('backend failed'); }
    let status = 200; for (const line of result.stdout.subarray(0, i).toString().split(/\r?\n/)) { const j = line.indexOf(':'); if (j < 0) continue; const key = line.slice(0,j), value = line.slice(j+1).trim(); if (key.toLowerCase() === 'status') status = parseInt(value, 10); else res.setHeader(key, value); }
    res.writeHead(status); res.end(result.stdout.subarray(i+n));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  return { local, remote, opts: { fs: { promises: fs }, dir: local }, target: { remote: 'origin', branch: 'main', url: 'https://github.com/acme/project.git' }, proxy: `http://127.0.0.1:${server.address().port}` };
}

test('syncs unrelated histories with explicit file choice, then pushes without force', async t => {
  const { local, remote, opts, target, proxy } = await fixture(t); const seen = [];
  const result = await syncBranch(opts, target, 'dummy', { name: 'Local', email: 'local@example.com' }, conflict => { seen.push(conflict.path); return 'local'; }, proxy);
  assert.deepEqual(seen, ['README.md']); assert.equal(result.unrelated, true);
  assert.equal(await fs.readFile(path.join(local, 'README.md'), 'utf8'), 'Local README\n');
  assert.equal(await fs.readFile(path.join(local, 'remote-only.txt'), 'utf8'), 'remote file\n');
  assert.equal(run(local, 'status', '--porcelain'), '');
  assert.equal(run(local, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
  run(local, 'push', remote, 'main');
  assert.equal(run(local, 'rev-parse', 'HEAD'), execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding:'utf8' }).trim());
});

test('sync cancellation and dirty files never change HEAD or working files', async t => {
  const { local, opts, target, proxy } = await fixture(t), before = run(local, 'rev-parse', 'HEAD');
  const result = await syncBranch(opts, target, 'dummy', { name:'Local', email:'local@example.com' }, () => null, proxy);
  assert.equal(result.cancelled, true); assert.equal(run(local, 'rev-parse', 'HEAD'), before); assert.equal(await fs.readFile(path.join(local, 'README.md'), 'utf8'), 'Local README\n');
  await fs.writeFile(path.join(local, 'local-only.txt'), 'uncommitted\n');
  await assert.rejects(syncBranch(opts, target, 'dummy', { name:'Local', email:'local@example.com' }, () => 'remote', proxy), /Commit or move/);
  assert.equal(await fs.readFile(path.join(local, 'local-only.txt'), 'utf8'), 'uncommitted\n');
});

test('keeps ignored local files safe from an incoming remote path', async t => {
  const { local, opts, target, proxy } = await fixture(t);
  await fs.writeFile(path.join(local, '.gitignore'), 'remote-only.txt\n');
  run(local, 'add', '.gitignore'); run(local, 'commit', '-m', 'ignore local file');
  await fs.writeFile(path.join(local, 'remote-only.txt'), 'do not overwrite\n');
  const before = run(local, 'rev-parse', 'HEAD');
  await assert.rejects(syncBranch(opts, target, 'dummy', { name:'Local', email:'local@example.com' }, () => 'remote', proxy), /might be overwritten/);
  assert.equal(await fs.readFile(path.join(local, 'remote-only.txt'), 'utf8'), 'do not overwrite\n');
  assert.equal(run(local, 'rev-parse', 'HEAD'), before);
});

test('explicit GitHub conflict choice updates worktree and retains both parents', async t => {
  const { local, opts, target, proxy } = await fixture(t);
  await syncBranch(opts, target, 'dummy', { name:'Local', email:'local@example.com' }, () => 'remote', proxy);
  assert.equal(await fs.readFile(path.join(local, 'README.md'), 'utf8'), 'GitHub README\n');
  assert.equal(run(local, 'status', '--porcelain'), '');
  assert.equal(run(local, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ').length, 3);
});

test('wgit push stages the whole working tree, syncs existing history and pushes without force', async t => {
  const { local, remote, opts, proxy } = await fixture(t);
  const { prepareAutoPush, autoPush } = await import('../src/auto-push.js');
  await fs.writeFile(path.join(local, '.gitignore'), 'secret.txt\n');
  await fs.writeFile(path.join(local, 'secret.txt'), 'ignored\n');
  await fs.writeFile(path.join(local, 'added.txt'), 'added\n');
  await fs.rm(path.join(local, 'local-only.txt'));
  const target = await prepareAutoPush(opts, 'main'); const log = [];
  const result = await autoPush(opts, target, { name: 'Local', email: 'local@example.com' }, 'dummy', () => 'local', line => log.push(line), proxy);
  assert.equal(result.synced, true); assert.ok(result.commit);
  assert.match(log.join('\n'), /Staged[\s\S]*Created commit[\s\S]*syncing/);
  assert.equal(run(local, 'status', '--porcelain'), '');
  assert.equal(execFileSync('git', ['--git-dir', remote, 'show', 'main:added.txt'], { encoding:'utf8' }), 'added\n');
  assert.equal(execFileSync('git', ['--git-dir', remote, 'show', 'main:remote-only.txt'], { encoding:'utf8' }), 'remote file\n');
  assert.equal(execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'], { encoding:'utf8' }).includes('secret.txt'), false);
  assert.equal(execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'], { encoding:'utf8' }).includes('local-only.txt'), false);
});

test('wgit push can create a differently named remote branch without changing the local branch upstream', async t => {
  const { local, remote, opts, proxy } = await fixture(t);
  const { prepareAutoPush, autoPush } = await import('../src/auto-push.js');
  await fs.writeFile(path.join(local, 'new.txt'), 'new branch\n');
  const target = await prepareAutoPush(opts, 'feature/new');
  assert.equal(target.branch, 'main'); assert.equal(target.upstream, false);
  const result = await autoPush(opts, target, { name:'Local', email:'local@example.com' }, 'dummy', () => { throw new Error('unexpected conflict'); }, () => {}, proxy);
  assert.equal(result.synced, false);
  assert.equal(execFileSync('git', ['--git-dir', remote, 'show', 'feature/new:new.txt'], { encoding:'utf8' }), 'new branch\n');
  assert.equal(run(local, 'branch', '--show-current'), 'main');
  assert.equal(await git.getConfig({ ...opts, path:'branch.main.remote' }), undefined);
});

test('cancelled conflict keeps the auto commit and does not update the remote', async t => {
  const { local, remote, opts, proxy } = await fixture(t);
  const { prepareAutoPush, autoPush } = await import('../src/auto-push.js');
  const original = execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding:'utf8' }).trim();
  await fs.writeFile(path.join(local, 'new.txt'), 'kept\n');
  const target = await prepareAutoPush(opts, 'main');
  const result = await autoPush(opts, target, { name:'Local', email:'local@example.com' }, 'dummy', () => null, () => {}, proxy);
  assert.equal(result.cancelled, true); assert.ok(result.commit); assert.equal(run(local, 'rev-parse', 'HEAD'), result.commit);
  assert.equal(execFileSync('git', ['--git-dir', remote, 'rev-parse', 'main'], { encoding:'utf8' }).trim(), original);
});


test('wgit push syncs an existing differently named destination without switching local branches', async t => {
  const { local, remote, opts, proxy } = await fixture(t);
  const { prepareAutoPush, autoPush } = await import('../src/auto-push.js');
  execFileSync('git', ['--git-dir', remote, 'update-ref', 'refs/heads/feature/new', 'refs/heads/main']);
  await fs.writeFile(path.join(local, 'file.txt'), 'local data\n');
  const result = await autoPush(opts, await prepareAutoPush(opts, 'feature/new'), { name:'Local', email:'local@example.com' }, 'dummy', () => 'local', () => {}, proxy);
  assert.equal(result.synced, true);
  assert.equal(execFileSync('git', ['--git-dir', remote, 'show', 'feature/new:remote-only.txt'], { encoding:'utf8' }), 'remote file\n');
  assert.equal(execFileSync('git', ['--git-dir', remote, 'show', 'feature/new:file.txt'], { encoding:'utf8' }), 'local data\n');
  assert.equal(run(local, 'branch', '--show-current'), 'main');
  assert.equal(await git.getConfig({ ...opts, path:'branch.main.remote' }), undefined);
});

test('wgit push validates target and authentication before staging anything', async t => {
  const { local, opts, proxy } = await fixture(t);
  const { prepareAutoPush, autoPush } = await import('../src/auto-push.js');
  await fs.writeFile(path.join(local, 'new.txt'), 'unstaged\n');
  await assert.rejects(prepareAutoPush(opts, '../bad'), /valid branch/);
  const result = await autoPush(opts, await prepareAutoPush(opts, 'main'), { name:'Local', email:'local@example.com' }, '', () => null, () => {}, proxy);
  assert.equal(result.cancelled, true);
  assert.match(run(local, 'status', '--porcelain'), /\?\? new.txt/);
});
