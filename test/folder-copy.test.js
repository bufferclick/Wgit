import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import LightningFS from '@isomorphic-git/lightning-fs';
import * as git from 'isomorphic-git';
import { importFolderCopy } from '../src/folder-copy.js';
import { initRepository } from '../src/repository.js';

const f = (path, data) => { const file = new Blob([data]); Object.defineProperty(file, 'webkitRelativePath', {value:path}); return file; };
const newfs = () => new LightningFS(`copy-test-${crypto.randomUUID()}`);
test('imports a separate folder copy, excludes all Git metadata, and supports real Git operations', async () => {
  const fs=newfs(), source=[f('project/README.md','hello'),f('project/src/file.bin',new Uint8Array([0,1,255])),f('project/.git/config','old config'),f('project/nested/.GIT/HEAD','old history')];
  const result=await importFolderCopy(fs,source); assert.equal(result.name,'project');assert.equal(result.files,2);assert.equal(result.excludedGit,2);
  assert.equal(await fs.promises.readFile('/workspace/README.md','utf8'),'hello'); assert.deepEqual([...await fs.promises.readFile('/workspace/src/file.bin')],[0,1,255]);
  assert.deepEqual((await fs.promises.readdir('/workspace')).sort(),['README.md','src']);
  await initRepository(fs,'/workspace');await git.add({fs,dir:'/workspace',filepath:'.'});const oid=await git.commit({fs,dir:'/workspace',author:{name:'Test',email:'test@example.com'},message:'first'});assert.equal(oid.length,40);
  assert.equal(await source[2].text(),'old config');
});
test('rejects invalid or oversized imports before writing workspace files', async () => {
  for (const entries of [[f('project/../escape','x')],[f('project/a','x'),f('other/b','x')],[f('project/a','x'),f('project/a','y')],[f('project/.git/config','x')]]) {
    const fs=newfs();await assert.rejects(importFolderCopy(fs,entries));await assert.rejects(fs.promises.stat('/workspace'),{code:'ENOENT'});
  }
  const fs=newfs(), large={webkitRelativePath:'project/huge',size:250*1024*1024+1};await assert.rejects(importFolderCopy(fs,[large]),/250 MiB/);await assert.rejects(fs.promises.stat('/workspace'),{code:'ENOENT'});
});
