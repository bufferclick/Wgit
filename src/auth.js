import { createClient } from '@supabase/supabase-js';
import { communityApi } from './community-data.js';
const supabase = createClient('https://jjkuljatqsjndqwrqtxe.supabase.co', 'sb_publishable_wibtQsDb-qgIajnCnZ-oEA_HcSlYoH1', { auth: { flowType: 'pkce', storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
export async function token() { const { data, error } = await supabase.auth.getSession(); if (error) throw error; return data.session?.access_token || ''; }
export async function signIn() {
  const redirectTo = `${location.origin}${location.pathname}${location.search}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
  if (error) throw error;
}
export async function signOut() { const { error } = await supabase.auth.signOut(); if (error) throw error; try { sessionStorage.removeItem('wgit.github.provider'); } catch {} }
export async function apiRequest(action, { method = 'GET', data, authenticated = true } = {}) {
  const t = authenticated ? await token() : '';
  if (authenticated && !t) throw new Error('Verify your GitHub account first.');
  const headers = {}; if (t) headers.Authorization = `Bearer ${t}`; if (data) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${communityApi}${action ? `?action=${encodeURIComponent(action)}` : ''}`, { method, headers, ...(data ? { body: JSON.stringify(data) } : {}) });
  let payload; try { payload = await r.json(); } catch { throw new Error('Community is temporarily unavailable.'); }
  if (!r.ok) throw new Error(payload.error || 'Community is temporarily unavailable.');
  return payload;
}
export async function verifiedUser() { if (!await token()) return null; return apiRequest('me'); }
// GitHub's repo OAuth scope also grants write access to private repositories.
// It is requested only after the user explicitly opts in from the picker.
export async function connectRepositories() {
  const redirectTo = `${location.origin}${location.pathname}${location.search}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider:'github', options:{ redirectTo, scopes:'repo read:user' } });
  if (error) throw error;
}
function rememberProvider(session) {
  try {
    if (!session?.user?.id) { sessionStorage.removeItem('wgit.github.provider'); return; }
    if (session.provider_token) sessionStorage.setItem('wgit.github.provider', JSON.stringify({user:session.user.id, token:session.provider_token}));
  } catch {}
}
supabase.auth.onAuthStateChange((_event, session) => { rememberProvider(session); });
export async function providerToken() {
  const { data, error } = await supabase.auth.getSession(); if (error) throw error;
  const session=data.session; rememberProvider(session);
  try { const saved=JSON.parse(sessionStorage.getItem('wgit.github.provider')); return saved?.user === session?.user?.id ? saved.token : (session?.provider_token || ''); } catch { return session?.provider_token || ''; }
}
export async function githubIdentity() {
  const { data, error } = await supabase.auth.getUser(); if (error) throw error;
  const identity = data.user?.identities?.find(i => i.provider === 'github');
  const id = String(identity?.provider_id || identity?.identity_data?.sub || '');
  return /^[0-9]{1,20}$/.test(id) ? id : null;
}
