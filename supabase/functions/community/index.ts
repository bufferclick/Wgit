// Public API. Only this function has the service key; clients cannot access the tables or RPC.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const respond = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const salt = Deno.env.get('COMMUNITY_IP_SALT');
const dbHeaders = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (req.method === 'GET') {
      const parent = new URL(req.url).searchParams.get('thread');
      if (parent && !uuid.test(parent)) return respond(400, { error: 'Invalid discussion.' });
      const offset = new URL(req.url).searchParams.get('offset') || '0';
      if (!/^\d{1,6}$/.test(offset)) return respond(400, { error: 'Invalid page.' });
      const query = new URLSearchParams({ offset, select: 'id,parent_id,author,title,body,created_at', parent_id: parent ? `eq.${parent}` : 'is.null', order: parent ? 'created_at.asc' : 'created_at.desc', limit: '100' });
      const result = await fetch(`${base}/rest/v1/community_posts?${query}`, { headers: dbHeaders });
      if (!result.ok) throw new Error('Database read failed');
      return respond(200, await result.json());
    }
    if (req.method !== 'POST') return respond(405, { error: 'Method not allowed.' });
    if (!salt) throw new Error('Rate limit is not configured');
    // Supabase Cloud's Cloudflare edge sets this header. Never trust X-Forwarded-For.
    // Missing or malformed addresses share one bucket rather than bypassing the limit.
    const ipHeader = req.headers.get('cf-connecting-ip') || '';
    const ip = /^[\da-f:.]{3,45}$/i.test(ipHeader) ? ipHeader.toLowerCase() : 'unknown';
    const data = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`)));
    const fingerprint = Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
    if (Number(req.headers.get('content-length') || 0) > 12000) return respond(413, { error: 'Message is too long.' });
    const raw = await req.text(); if (raw.length > 12000) return respond(413, { error: 'Message is too long.' });
    let input; try { input = JSON.parse(raw); } catch { return respond(400, { error: 'Invalid request.' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond(400, { error: 'Invalid request.' });
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const country = typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country) ? input.country : '';
    let countryName = 'unknown';
    if (country) { try { countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || 'unknown'; } catch {} }
    const author = name ? name.slice(0, 50) : `guest - ${countryName.toLowerCase()}`;
    const parent = input.parent || null;
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if ((parent && (typeof parent !== 'string' || !uuid.test(parent))) || (!parent && (!title || title.length > 120)) || !body || body.length > 4000) return respond(400, { error: 'Please enter a valid title and message.' });
    const result = await fetch(`${base}/rest/v1/rpc/community_publish`, { method: 'POST', headers: dbHeaders, body: JSON.stringify({ p_fingerprint: fingerprint, p_author: author, p_title: parent ? null : title, p_body: body, p_parent: parent }) });
    if (!result.ok) { if (result.status === 400) return respond(400, { error: 'Discussion no longer exists or message is invalid.' }); throw new Error('Database write failed'); }
    const post = await result.json();
    if (post.error === 'rate_limited') return respond(429, { error: 'Please wait one minute between messages.' });
    return respond(201, post);
  } catch (error) { console.error('Community error:', error); return respond(503, { error: 'Community is temporarily unavailable. Please try again.' }); }
});
