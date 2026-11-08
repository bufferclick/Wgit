export const communityApi = 'https://jjkuljatqsjndqwrqtxe.supabase.co/functions/v1/community';
const cacheKey = 'wgit.community.cache.v2';
let pending;
export function cachedCommunity() {
  try { const data = JSON.parse(sessionStorage.getItem(cacheKey)); return Array.isArray(data?.posts) ? data.posts : null; } catch { return null; }
}
export async function fetchCommunity(fresh = false) {
  if (pending) { if (!fresh) return pending; await pending.catch(() => {}); }
  pending = (async () => {
    const posts = [];
    for (let offset = 0; ; offset += 100) {
      const response = await fetch(`${communityApi}?all=1&offset=${offset}`);
      if (!response.ok) throw new Error('Could not load discussions. Please try again.');
      const page = await response.json();
      if (!Array.isArray(page)) throw new Error('Could not load discussions. Please try again.');
      posts.push(...page);
      if (page.length < 100) break;
    }
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ posts })); } catch {}
    return posts;
  })().finally(() => { pending = null; });
  return pending;
}
