import { pageShell } from './page-shell.js';
import { verifiedUser, githubIdentity, signIn } from './auth.js';
import { fetchCommunity } from './community-data.js';
import { replyNotifications } from './notification-data.js';
const main = pageShell('notifications', 'notifications');
main.innerHTML = `<section class="community-main"><div class="community-heading"><div><p class="community-eyebrow">WGIT COMMUNITY</p><h1>Reply notifications</h1><p>Replies to your discussions and comments. Read status is saved on this device.</p></div></div><div class="community-auth"><span id="notification-status">Loading…</span><button class="button" id="notification-login" hidden>Verify with GitHub</button><button class="button" id="notification-refresh" hidden>Refresh</button><button class="button" id="notification-read" hidden>Mark all read</button></div><div id="notification-list" class="panel"></div></section><aside class="sidebar community-sidebar"><div class="about"><h2>How it works</h2><p>Wgit checks public discussions when you open or refresh this page. Notifications are not emails or push alerts.</p></div></aside>`;
const $ = s => document.querySelector(s); let current = [], seen = new Set(), key = '';
$('#notification-login').onclick = () => signIn().catch(e => $('#notification-status').textContent=e.message);
function render() {
  const list=$('#notification-list'); list.replaceChildren();
  if (!current.length) { const p=document.createElement('p'); p.className='empty-community'; p.textContent='No replies yet.'; list.append(p); return; }
  for(const {post,root} of current) { const row=document.createElement('a'); row.className='notification-item'; row.href=`/community/${encodeURIComponent(root.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'discussion')}--${root.id}#comment-${post.id}`; const strong=document.createElement('strong'); strong.textContent=`${seen.has(post.id)?'':'● '}@${post.github_username || post.author} replied in ${root.title}`; const detail=document.createElement('span'); detail.textContent=`${post.body.slice(0,160)} · ${new Date(post.created_at).toLocaleString()}`; row.append(strong,detail); row.addEventListener('click',()=>{ seen.add(post.id); try{localStorage.setItem(key,JSON.stringify([...seen]));}catch{} }); list.append(row); }
  $('#notification-status').textContent=`${current.filter(x=>!seen.has(x.post.id)).length} unread · ${current.length} replies`;
}
async function load() {
  try {
    const user=await verifiedUser(); if(!user) { $('#notification-status').textContent='Verify with GitHub to see replies.'; $('#notification-login').hidden=false; return; }
    const id=await githubIdentity(); if(!id) throw new Error('Could not verify your GitHub identity. Sign in again.');
    key=`wgit.notifications.seen.${id}`; try { seen=new Set(JSON.parse(localStorage.getItem(key)||'[]')); } catch { seen=new Set(); }
    const posts=await fetchCommunity(true); current=replyNotifications(posts,id); $('#notification-login').hidden=true; $('#notification-refresh').hidden=false; $('#notification-read').hidden=false; render();
  } catch(e) { $('#notification-status').textContent=e.message || 'Could not load notifications.'; }
}
$('#notification-refresh').onclick=load; $('#notification-read').onclick=()=>{ current.forEach(x=>seen.add(x.post.id)); try{localStorage.setItem(key,JSON.stringify([...seen]));}catch{} render(); }; load();
