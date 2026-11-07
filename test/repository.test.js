import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeFs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as git from 'isomorphic-git';
import { nativeFS } from '../src/native-fs.js';
import { initRepository, repositoryState } from '../src/repository.js';

const exec = promisify(execFile);
function browserError(error) {
  if (error.code === 'ENOENT') error.name = 'NotFoundError';
  else if (error.code === 'ENOTDIR' || error.code === 'EISDIR') error.name = 'TypeMismatchError';
  return error;
}
class DirectoryHandle {
  constructor(dir, options = {}) { this.dir = dir; this.options = options; }
  async getDirectoryHandle(name, { create = false } = {}) {
    const dir = path.join(this.dir, name);
    if (this.options.blockAll || (this.options.blockHooks && create && name === 'hooks' && path.basename(this.dir) === '.git') || (this.options.blockInfo && create && name === 'info' && path.basename(this.dir) === '.git')) {
      throw new DOMException('Blocked by the user agent', 'SecurityError');
    }
    try {
      if (create) await nodeFs.mkdir(dir);
      const stat = await nodeFs.stat(dir);
      if (!stat.isDirectory()) throw new DOMException('Not a directory', 'TypeMismatchError');
      return new DirectoryHandle(dir, this.options);
    } catch (error) { throw browserError(error); }
  }
  async getFileHandle(name, { create = false } = {}) {
    const filename = path.join(this.dir, name);
    try {
      if (create) await nodeFs.appendFile(filename, '');
      const stat = await nodeFs.stat(filename);
      if (!stat.isFile()) throw new DOMException('Not a file', 'TypeMismatchError');
      return new FileHandle(filename);
    } catch (error) { throw browserError(error); }
  }
  async *keys() { yield* await nodeFs.readdir(this.dir); }
  async removeEntry(name) { try { await nodeFs.rm(path.join(this.dir, name)); } catch (e) { throw browserError(e); } }
}
class FileHandle {
  constructor(filename) { this.filename = filename; }
  async getFile() {
    const data = await nodeFs.readFile(this.filename), stat = await nodeFs.stat(this.filename);
    return { size: data.length, lastModified: stat.mtimeMs, text: async () => data.toString(), arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  }
  async createWritable() { return { write: data => nodeFs.writeFile(this.filename, data), close: async () => {} }; }
}
async function workspace(t, options = {}) {
  const dir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'wgit-test-'));
  t.after(() => nodeFs.rm(dir, { force: true, recursive: true }));
  return { dir, fs: nativeFS(new DirectoryHandle(dir, options)) };
}

test('recovers from blocked hooks during init and produces a native Git repository', async t => {
  const { dir, fs } = await workspace(t, { blockHooks: true });
  await nodeFs.writeFile(path.join(dir, 'README.md'), 'Hello!\n');
  await assert.rejects(git.init({ fs, dir: '/workspace', defaultBranch: 'main' }), { code: 'EACCES' });
  assert.equal(await repositoryState(fs, '/workspace'), 'empty');
  await initRepository(fs, '/workspace');
  assert.equal(await repositoryState(fs, '/workspace'), 'ready');
  await assert.rejects(nodeFs.stat(path.join(dir, '.git/hooks')), { code: 'ENOENT' });
  assert.deepEqual(await git.statusMatrix({ fs, dir: '/workspace' }), [['README.md', 0, 2, 0]]);
  await git.add({ fs, dir: '/workspace', filepath: 'README.md' });
  await git.commit({ fs, dir: '/workspace', author: { name: 'Test', email: 'test@example.com' }, message: 'First commit' });
  assert.match((await exec('git', ['-C', dir, 'log', '-1', '--format=%s'])).stdout, /First commit/);
  assert.equal((await exec('git', ['-C', dir, 'status', '--porcelain'])).stdout, '');
  await assert.rejects(initRepository(fs, '/workspace'), /already a Git repository/);
});

test('does not overwrite a nonempty incomplete repository', async t => {
  const { dir, fs } = await workspace(t);
  await nodeFs.mkdir(path.join(dir, '.git'));
  await nodeFs.writeFile(path.join(dir, '.git/config'), 'important data');
  assert.equal(await repositoryState(fs, '/workspace'), 'incomplete');
  await assert.rejects(initRepository(fs, '/workspace'), /will not overwrite/);
  assert.equal(await nodeFs.readFile(path.join(dir, '.git/config'), 'utf8'), 'important data');
});

test('reports security restrictions instead of treating them as missing files', async t => {
  const { fs } = await workspace(t, { blockAll: true });
  await assert.rejects(repositoryState(fs, '/workspace'), { code: 'EACCES' });
  await assert.rejects(initRepository(fs, '/workspace'), /Browser blocked access/);
});

test('refuses a .git file rather than overwriting it', async t => {
  const { dir, fs } = await workspace(t);
  await nodeFs.writeFile(path.join(dir, '.git'), 'gitdir: elsewhere\n');
  assert.equal(await repositoryState(fs, '/workspace'), 'unsupported');
  await assert.rejects(initRepository(fs, '/workspace'), /linked worktrees/);
});

test('initializes the browser-storage demo filesystem', async () => {
  await import('fake-indexeddb/auto');
  const { default: LightningFS } = await import('@isomorphic-git/lightning-fs');
  const fs = new LightningFS(`wgit-test-${Date.now()}`);
  await fs.promises.mkdir('/workspace');
  await fs.promises.writeFile('/workspace/README.md', 'demo\n');
  await initRepository(fs, '/workspace');
  assert.equal(await repositoryState(fs, '/workspace'), 'ready');
  assert.deepEqual(await git.statusMatrix({ fs, dir: '/workspace' }), [['README.md', 0, 2, 0]]);
});

test('does not suppress security errors for other Git directories', async t => {
  const { fs } = await workspace(t, { blockInfo: true });
  await assert.rejects(initRepository(fs, '/workspace'), { code: 'EACCES' });
  assert.notEqual(await repositoryState(fs, '/workspace'), 'ready');
});
