import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let handler, mockFetch;
const realFetch = globalThis.fetch, originalDeno = globalThis.Deno;
globalThis.Deno = { env: { get: k => ({SUPABASE_URL:'https://db.example', SUPABASE_SERVICE_ROLE_KEY:'service', COMMUNITY_IP_SALT:'private-salt'})[k] }, serve: h => { handler = h; } };
globalThis.fetch = (...args) => mockFetch(...args);
const source = await readFile(new URL('../supabase/functions/community/index.ts', import.meta.url), 'utf8');
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers:{'content-type':'application/json'} });
const user = (id, login, metadata = {}) => ({ user_metadata:metadata, identities:[{provider:'github',provider_id:id,identity_data:{sub:id,user_name:login}}] });
const req = (action, body, auth = '') => new Request(`https://test/community${action ? '?action='+action : ''}`, { method:'POST', headers:{'content-type':'application/json', ...(auth ? {authorization:`Bearer ${auth}`} : {}), 'cf-connecting-ip':'203.0.113.1', 'x-forwarded-for':'1.2.3.4'}, body:JSON.stringify(body) });
const owner = 'a'.repeat(64);
let seen;
function stub(authUser = null, result = {}) {
  seen = [];
  mockFetch = async (url, init = {}) => {
    seen.push({url:String(url),init});
    if (String(url).includes('/auth/v1/user')) return authUser ? json(authUser) : json({},401);
    if (String(url).includes('/rpc/community_publish_verified')) return json(result.post || { id:'12345678-1234-4234-8234-123456789abc', github_id:'42' });
    if (String(url).includes('/rpc/release_vote')) return json(null);
    if (String(url).includes('/rpc/community_wipe_v2')) return json({posts:6,votes:1});
    if (String(url).includes('/rpc/community_set_ban')) return json(null);
    if (String(url).includes('/rest/v1/community_bans')) return json([]);
    if (String(url).includes('api.github.com/users/')) return json({ id:42, login:'real-user' });
    return json({error:'unexpected'},500);
  };
}
test('unverified and spoofed requests cannot post or access admin', async () => {
  stub(); let r = await handler(req('',{title:'hi',body:'hello',owner_hash:owner,name:'bufferclick',github:'bufferclick'})); assert.equal(r.status,401);
  assert.ok(!seen.some(x => x.url.includes('/rpc/community_publish')));
  stub(user('42','real-user',{provider_id:'266074872',user_name:'bufferclick'}));
  r = await handler(req('wipe',{categories:['posts'],confirmations:['reviewed','irreversible','DELETE SELECTED DATA']},'valid.jwt'));
  assert.equal(r.status,403); assert.ok(!seen.some(x => x.url.includes('/rpc/community_wipe_v2')));
  r = await handler(req('ban',{email:'someone@github.com'},'valid.jwt')); assert.equal(r.status,403);
});
test('only the verified GitHub identity controls author, with atomic ban and rate checks', async () => {
  stub(user('42','real-user',{user_name:'bufferclick'}));
  const r = await handler(req('',{title:'hello',body:'world',owner_hash:owner,name:'bufferclick',github:'bufferclick'},'valid.jwt'));
  assert.equal(r.status,201);
  const call = seen.find(x => x.url.includes('/rpc/community_publish_verified'));
  const p = JSON.parse(call.init.body); assert.equal(p.p_login,'real-user'); assert.equal(p.p_github_id,'42'); assert.equal(p.p_owner_hash,owner); assert.match(p.p_fingerprint,/^[a-f0-9]{64}$/);
  stub(user('42','real-user'),{post:{error:'banned'}}); assert.equal((await handler(req('',{title:'x',body:'x',owner_hash:owner},'valid.jwt'))).status,403);
  stub(user('42','real-user'),{post:{error:'rate_limited'}}); assert.equal((await handler(req('',{title:'x',body:'x',owner_hash:owner},'valid.jwt'))).status,429);
  stub({ user_metadata:{user_name:'bufferclick'}, identities:[{provider:'email',identity_data:{sub:'266074872',user_name:'bufferclick'}}] });
  assert.equal((await handler(req('',{title:'x',body:'x',owner_hash:owner},'valid.jwt'))).status,401);
});
test('admin operations require immutable owner id and three wipe confirmations', async () => {
  stub(user('266074872','bufferclick'));
  assert.equal((await handler(req('wipe',{categories:['posts'],confirmations:['reviewed','irreversible']},'valid.jwt'))).status,400);
  assert.ok(!seen.some(x=>x.url.includes('community_wipe')));
  const r = await handler(req('wipe',{categories:['posts','votes'],confirmations:['reviewed','irreversible','DELETE SELECTED DATA']},'valid.jwt'));
  assert.equal(r.status,200); assert.deepEqual((await r.json()).deleted, {posts:6,votes:1}); assert.deepEqual(JSON.parse(seen.find(x=>x.url.includes('community_wipe_v2')).init.body).p_categories,['posts','votes']);
  stub(user('266074872','bufferclick')); const banned = await handler(req('ban',{email:'real-user@github.com'},'valid.jwt'));
  assert.equal(banned.status,200); assert.deepEqual(JSON.parse(seen.find(x=>x.url.includes('community_set_ban')).init.body),{p_github_id:'42',p_login:'real-user',p_banned:true});
});
test('wipe handles empty responses and reports a failed database stage without touching accounts', async () => {
  stub(user('266074872','bufferclick')); const upstream = mockFetch;
  mockFetch = async (url, init) => String(url).includes('/rpc/community_wipe_v2') ? json({code:'PGRST202'},404) : upstream(url,init);
  const originalError = console.error; let r;
  try { console.error = () => {}; r = await handler(req('wipe',{categories:['posts','accounts'],confirmations:['reviewed','irreversible','DELETE SELECTED DATA']},'valid.jwt')); } finally { console.error = originalError; }
  assert.equal(r.status,503); assert.match((await r.json()).error,/may already be deleted/);
  assert.ok(!seen.some(x => x.url.includes('/admin/users')));
});
test('void RPC responses may be empty without failing successful bans', async () => {
  stub(user('266074872','bufferclick')); const upstream = mockFetch;
  mockFetch = async (url, init) => String(url).includes('/rpc/community_set_ban') ? new Response(null,{status:204}) : upstream(url,init);
  assert.equal((await handler(req('ban',{email:'real-user@github.com'},'valid.jwt'))).status,200);
});
test('votes require verification and only accept known updates and directions', async () => {
  stub(); assert.equal((await handler(req('vote',{release:'v0.1.3',direction:1}))).status,401);
  stub(user('42','real-user')); assert.equal((await handler(req('vote',{release:'bogus',direction:1},'jwt'))).status,400);
  assert.equal((await handler(req('vote',{release:'v0.1.3',direction:-1},'jwt'))).status,200);
});
test.after(() => { globalThis.fetch = realFetch; globalThis.Deno = originalDeno; });
