import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import LightningFS from '@isomorphic-git/lightning-fs';
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot } from '../src/snapshots.js';
import { replyNotifications } from '../src/notification-data.js';
import { listGithubRepos } from '../src/github-repos.js';

test('snapshots restore saved paths without removing extras or touching Git metadata', async () => {
  const fs=new LightningFS(`snapshot-${Date.now()}`); await fs.promises.mkdir('/workspace');await fs.promises.mkdir('/workspace/.git');await fs.promises.writeFile('/workspace/.git/config','original');await fs.promises.writeFile('/workspace/file.txt','before');
  const snap=await createSnapshot(fs,'example');assert.deepEqual(snap.files.map(f=>f.path),['file.txt']);
  await fs.promises.writeFile('/workspace/file.txt','changed');await fs.promises.writeFile('/workspace/extra','keep');await fs.promises.writeFile('/workspace/.git/config','new git data');
  await restoreSnapshot(fs,snap);assert.equal(await fs.promises.readFile('/workspace/file.txt','utf8'),'before');assert.equal(await fs.promises.readFile('/workspace/extra','utf8'),'keep');assert.equal(await fs.promises.readFile('/workspace/.git/config','utf8'),'new git data');
  assert.ok((await listSnapshots()).some(s=>s.id===snap.id)); await deleteSnapshot(snap.id);assert.ok(!(await listSnapshots()).some(s=>s.id===snap.id));
  await assert.rejects(()=>restoreSnapshot(fs,{dirs:[],files:[{path:'../escape',data:new Uint8Array()}]}),/Invalid snapshot/);
  await assert.rejects(()=>restoreSnapshot(fs,{dirs:['.git'],files:[]}),/Invalid snapshot/);
});
test('notifications include replies to owned ancestors, excluding self, unrelated and deleted', () => {
  const p=(id,parent,github,deleted=false)=>({id,parent_id:parent,github_id:github,deleted,created_at:`2026-01-0${id}T00:00:00Z`,title:'thread'});
  const posts=[p('1',null,'42'),p('2','1','43'),p('3','2','42'),p('4','3','43'),p('5','1','43',true),p('6',null,'44'),p('7','6','44')];
  assert.deepEqual(replyNotifications(posts,'42').map(x=>x.post.id),['4','2']);
});
test('repository picker calls only the GitHub API and rejects unsafe repository URLs', async () => {
  const original=globalThis.fetch;let request;try{globalThis.fetch=async (url,opts)=>{request={url,opts};return new Response(JSON.stringify([{full_name:'owner/repo',html_url:'https://github.com/owner/repo',private:true}]));};const rows=await listGithubRepos('mock-token');assert.equal(rows[0].url,'https://github.com/owner/repo.git');assert.match(request.url,/^https:\/\/api.github.com\/user\/repos/);assert.equal(request.opts.headers.Authorization,'Bearer mock-token');globalThis.fetch=async()=>new Response(JSON.stringify([{full_name:'bad',html_url:'https://evil.example/steal'}]));await assert.rejects(()=>listGithubRepos('mock-token'),/GitHub/);}finally{globalThis.fetch=original;}
});
