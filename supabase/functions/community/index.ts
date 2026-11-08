// Supabase service credentials remain server-side. All identities come from Auth's
// verified GitHub identities, never from user-editable metadata or request bodies.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const respond = (status, value) => new Response(JSON.stringify(value), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const github = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const releases = new Set(['pr-1','pr-2','pr-3','pr-4','pr-5','pr-6','pr-7','pr-8','pr-9','pr-11','pr-12','v0.1.3','v0.1.4']);
const base = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), salt = Deno.env.get('COMMUNITY_IP_SALT');
const dbHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const validLogin = value => typeof value === 'string' && github.test(value) && !value.includes('--');
async function rpc(name, body) {
  const r = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: dbHeaders, body: JSON.stringify(body) });
  if (!r.ok) { const body = await r.json().catch(() => ({})); throw new Error(`Database operation ${name} failed (${r.status}, ${body.code || 'unknown'})`); }
  if (r.status === 204) return null;
  const text = await r.text(); return text ? JSON.parse(text) : null;
}
async function identity(req) {
  const bearer = req.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(bearer)) return null;
  const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: bearer } });
  if (!res.ok) return null;
  const user = await res.json();
  const provider = (user.identities || []).find(i => i.provider === 'github');
  const id = String(provider?.provider_id || provider?.identity_data?.sub || '');
  const login = provider?.identity_data?.user_name || provider?.identity_data?.preferred_username;
  if (!/^[0-9]{1,20}$/.test(id) || !validLogin(login)) return null;
  return { id, login, admin: id === '266074872' };
}
async function banned(user) {
  const query = new URLSearchParams({ select: 'github_id', or: `(github_id.eq.${user.id},github_login.eq.${user.login.toLowerCase()})`, limit: '1' });
  const res = await fetch(`${base}/rest/v1/community_bans?${query}`, { headers: dbHeaders });
  if (!res.ok) throw new Error('Ban lookup failed');
  return (await res.json()).length > 0;
}
async function wipeAccounts() {
  // Auth's admin API handles cascading sessions and identities. Never delete
  // auth system tables directly. Repeat page 1 because successful deletions shift pages.
  let count = 0;
  for (;;) {
    const response = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=100`, { headers: dbHeaders });
    if (!response.ok) throw new Error('Could not list authentication accounts');
    const users = (await response.json()).users;
    if (!Array.isArray(users)) throw new Error('Unexpected authentication response');
    if (!users.length) return count;
    for (const user of users) {
      if (!uuid.test(user.id) || count >= 10000) throw new Error('Authentication deletion limit reached');
      const removed = await fetch(`${base}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: dbHeaders });
      if (!removed.ok) throw new Error('Some accounts could not be deleted');
      count++;
    }
  }
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const url = new URL(req.url), action = url.searchParams.get('action') || '';
    if (req.method === 'GET' && !action) {
      const parent = url.searchParams.get('thread'), offset = url.searchParams.get('offset') || '0';
      if ((parent && !uuid.test(parent)) || !/^\d{1,6}$/.test(offset)) return respond(400, { error: 'Invalid request.' });
      const all = url.searchParams.get('all') === '1';
      const q = new URLSearchParams({ offset, select: 'id,parent_id,author,title,body,created_at,github_username,github_id,deleted', order: all || parent ? 'created_at.asc,id.asc' : 'created_at.desc,id.desc', limit: '100' });
      if (!all) q.set('parent_id', parent ? `eq.${parent}` : 'is.null');
      const res = await fetch(`${base}/rest/v1/community_posts?${q}`, { headers: dbHeaders });
      if (!res.ok) throw new Error('Read failed');
      return respond(200, await res.json());
    }
    if (req.method === 'GET' && action === 'votes') {
      const totals = await rpc('release_vote_totals', {}), user = await identity(req);
      let mine = [];
      if (user) { const q = new URLSearchParams({ select: 'release_id,direction', github_id: `eq.${user.id}` }); const r = await fetch(`${base}/rest/v1/release_votes?${q}`, { headers: dbHeaders }); if (!r.ok) throw new Error('Votes unavailable'); mine = await r.json(); }
      return respond(200, { totals, mine });
    }
    if (req.method === 'GET' && action === 'me') {
      const user = await identity(req); if (!user) return respond(401, { error: 'Verify your GitHub account first.' });
      return respond(200, { login: user.login, admin: user.admin, banned: await banned(user) });
    }
    if (req.method === 'GET' && action === 'bans') {
      const user = await identity(req); if (!user?.admin) return respond(403, { error: 'Access denied.' });
      const r = await fetch(`${base}/rest/v1/community_bans?select=github_id,github_login,created_at&order=created_at.desc`, { headers: dbHeaders });
      if (!r.ok) throw new Error('Ban list unavailable'); return respond(200, await r.json());
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') return respond(405, { error: 'Method not allowed.' });
    if (Number(req.headers.get('content-length') || 0) > 12000) return respond(413, { error: 'Message is too long.' });
    const raw = await req.text(); if (raw.length > 12000) return respond(413, { error: 'Message is too long.' });
    let input; try { input = JSON.parse(raw); } catch { return respond(400, { error: 'Invalid request.' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond(400, { error: 'Invalid request.' });
    // Legacy browser-held deletion keys remain valid for posts created in v0.1.2.
    if (req.method === 'DELETE' && !action) {
      if (typeof input.id !== 'string' || !uuid.test(input.id) || typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token)) return respond(400, { error: 'Invalid request.' });
      const ok = await rpc('community_delete', { p_id: input.id, p_owner_hash: await hash(input.token) });
      return ok ? respond(200, { deleted: true }) : respond(403, { error: 'You can only delete your own post.' });
    }
    const user = await identity(req); if (!user) return respond(401, { error: 'Verify your GitHub account first.' });
    if (req.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
    if (action === 'vote') {
      if (!releases.has(input.release) || ![-1, 0, 1].includes(input.direction)) return respond(400, { error: 'Invalid vote.' });
      await rpc('release_vote', { p_release_id: input.release, p_github_id: user.id, p_direction: input.direction }); return respond(200, { ok: true });
    }
    if (action === 'ban' || action === 'unban' || action === 'wipe') {
      if (!user.admin) return respond(403, { error: 'Access denied.' });
      if (action === 'wipe') {
        const allowed = ['posts', 'votes', 'bans', 'limits', 'accounts'];
        if (!Array.isArray(input.categories) || !input.categories.length || input.categories.some(x => !allowed.includes(x)) || new Set(input.categories).size !== input.categories.length || JSON.stringify(input.confirmations) !== JSON.stringify(['reviewed', 'irreversible', 'DELETE SELECTED DATA'])) return respond(400, { error: 'Review all three confirmations and choose data to delete.' });
        const categories = input.categories.filter(x => x !== 'accounts');
        let deleted = {};
        try { if (categories.length) { deleted = await rpc('community_wipe_v2', { p_categories: categories }); if (!deleted || categories.some(x => !Number.isSafeInteger(deleted[x]) || deleted[x] < 0)) throw new Error('Invalid database wipe response'); } }
        catch (error) { console.error('Database wipe failed:', error); return respond(503, { error: 'Could not confirm database deletion. Selected app data may already be deleted; authentication accounts were not touched. Check Supabase and the Edge Function logs before retrying.' }); }
        try { if (input.categories.includes('accounts')) deleted.accounts = await wipeAccounts(); }
        catch (error) { console.error('Authentication wipe failed:', error); return respond(503, { error: 'Authentication deletion did not finish. Some accounts and selected app data may already be deleted; check Supabase before retrying.' }); }
        return respond(200, { ok: true, deleted });
      }
      const email = typeof input.email === 'string' ? input.email.toLowerCase().trim() : '';
      const match = /^([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)@github\.com$/.exec(email);
      if (!match || !validLogin(match[1])) return respond(400, { error: 'Use a valid username@github.com.' });
      let id, login = match[1];
      if (action === 'ban') {
        const r = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, { headers: { 'User-Agent': 'Wgit-Community', Accept: 'application/vnd.github+json' } });
        if (r.status === 404) return respond(404, { error: 'GitHub account not found.' });
        if (!r.ok) throw new Error('Could not verify the GitHub account');
        const account = await r.json(); id = String(account.id); login = account.login.toLowerCase();
        if (!/^[0-9]{1,20}$/.test(id) || !validLogin(login) || id === '266074872') return respond(400, { error: 'This account cannot be banned.' });
      } else {
        const q = new URLSearchParams({ select: 'github_id,github_login', github_login: `eq.${login}`, limit: '1' });
        const r = await fetch(`${base}/rest/v1/community_bans?${q}`, { headers: dbHeaders }); if (!r.ok) throw new Error('Ban lookup failed'); const entries = await r.json();
        if (!entries.length) return respond(404, { error: 'That account is not banned.' }); id = entries[0].github_id; login = entries[0].github_login;
      }
      await rpc('community_set_ban', { p_github_id: id, p_login: login, p_banned: action === 'ban' }); return respond(200, { ok: true });
    }
    if (action) return respond(400, { error: 'Invalid request.' });
    if (!salt) throw new Error('Rate limit is not configured');
    const ipHeader = req.headers.get('cf-connecting-ip') || '';
    const ip = /^[\da-f:.]{3,45}$/i.test(ipHeader) ? ipHeader.toLowerCase() : 'unknown';
    const fingerprint = await hash(`${salt}:${ip}`);
    const parent = input.parent || null, title = typeof input.title === 'string' ? input.title.trim() : '', body = typeof input.body === 'string' ? input.body.trim() : '';
    if ((parent && (typeof parent !== 'string' || !uuid.test(parent))) || (!parent && (!title || title.length > 120)) || !body || body.length > 4000 || typeof input.owner_hash !== 'string' || !/^[0-9a-f]{64}$/.test(input.owner_hash)) return respond(400, { error: 'Please enter a valid title and message.' });
    const post = await rpc('community_publish_verified', { p_fingerprint: fingerprint, p_github_id: user.id, p_login: user.login, p_title: parent ? null : title, p_body: body, p_parent: parent, p_owner_hash: input.owner_hash });
    if (post.error === 'rate_limited') return respond(429, { error: 'Please wait one minute between messages.' });
    if (post.error === 'banned') return respond(403, { error: 'This GitHub account is banned from posting.' });
    return respond(201, post);
  } catch (error) { console.error('Community error:', error); return respond(503, { error: 'Community is temporarily unavailable. Please try again.' }); }
});
