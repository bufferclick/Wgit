// Service credentials stay in the Edge Function; all public reads use an explicit field list.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const github = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const salt = Deno.env.get('COMMUNITY_IP_SALT');
const dbHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url), parent = url.searchParams.get('thread'), offset = url.searchParams.get('offset') || '0';
      if ((parent && !uuid.test(parent)) || !/^\d{1,6}$/.test(offset)) return respond(400, { error: 'Invalid request.' });
      const all = url.searchParams.get('all') === '1';
      const query = new URLSearchParams({ offset, select: 'id,parent_id,author,title,body,created_at,github_username,deleted', order: all || parent ? 'created_at.asc,id.asc' : 'created_at.desc,id.desc', limit: '100' });
      if (!all) query.set('parent_id', parent ? `eq.${parent}` : 'is.null');
      const result = await fetch(`${base}/rest/v1/community_posts?${query}`, { headers: dbHeaders });
      if (!result.ok) throw new Error('Database read failed');
      return respond(200, await result.json());
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') return respond(405, { error: 'Method not allowed.' });
    if (Number(req.headers.get('content-length') || 0) > 12000) return respond(413, { error: 'Message is too long.' });
    const raw = await req.text(); if (raw.length > 12000) return respond(413, { error: 'Message is too long.' });
    let input; try { input = JSON.parse(raw); } catch { return respond(400, { error: 'Invalid request.' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond(400, { error: 'Invalid request.' });
    if (req.method === 'DELETE') {
      if (typeof input.id !== 'string' || !uuid.test(input.id) || typeof input.token !== 'string' || !/^[0-9a-f]{64}$/.test(input.token)) return respond(400, { error: 'Invalid request.' });
      const result = await fetch(`${base}/rest/v1/rpc/community_delete`, { method: 'POST', headers: dbHeaders, body: JSON.stringify({ p_id: input.id, p_owner_hash: await hash(input.token) }) });
      if (!result.ok) throw new Error('Database delete failed');
      return await result.json() ? respond(200, { deleted: true }) : respond(403, { error: 'You can only delete your own post in the browser where it was created.' });
    }
    if (!salt) throw new Error('Rate limit is not configured');
    const ipHeader = req.headers.get('cf-connecting-ip') || '';
    const ip = /^[\da-f:.]{3,45}$/i.test(ipHeader) ? ipHeader.toLowerCase() : 'unknown';
    const fingerprint = await hash(`${salt}:${ip}`);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const country = typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country) ? input.country : '';
    let countryName = 'unknown';
    if (country) { try { countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || 'unknown'; } catch {} }
    const author = name ? name.slice(0, 50) : `guest - ${countryName.toLowerCase()}`;
    const parent = input.parent || null;
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    const user = name && typeof input.github === 'string' && github.test(input.github) && !input.github.includes('--') ? input.github : null;
    if ((parent && (typeof parent !== 'string' || !uuid.test(parent))) || (!parent && (!title || title.length > 120)) || !body || body.length > 4000) return respond(400, { error: 'Please enter a valid title and message.' });
    // Old clients can keep posting; their existing posts have no deletion capability.
    const owner = typeof input.owner_hash === 'string' && /^[0-9a-f]{64}$/.test(input.owner_hash) ? input.owner_hash : null;
    const endpoint = owner ? 'community_publish_v2' : 'community_publish';
    const payload = { p_fingerprint: fingerprint, p_author: author, p_title: parent ? null : title, p_body: body, p_parent: parent, ...(owner ? { p_github: user, p_owner_hash: owner } : {}) };
    const result = await fetch(`${base}/rest/v1/rpc/${endpoint}`, { method: 'POST', headers: dbHeaders, body: JSON.stringify(payload) });
    if (!result.ok) { if (result.status === 400) return respond(400, { error: 'Discussion no longer exists or message is invalid.' }); throw new Error('Database write failed'); }
    const post = await result.json();
    if (post.error === 'rate_limited') return respond(429, { error: 'Please wait one minute between messages.' });
    delete post.owner_hash;
    return respond(201, post);
  } catch (error) { console.error('Community error:', error); return respond(503, { error: 'Community is temporarily unavailable. Please try again.' }); }
});
