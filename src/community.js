import { createIcons, GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, MessageSquare, Moon, Sun, ArrowLeft, Lightbulb } from 'lucide';
import { version } from '../package.json';
import './style.css';
import './community.css';
import { githubUsername } from './identity.js';
import { communityApi as api, cachedCommunity, fetchCommunity } from './community-data.js';

const icons = { GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, MessageSquare, Moon, Sun, ArrowLeft, Lightbulb };
const icon = name => `<i data-lucide="${name}"></i>`;
const app = document.querySelector('#app');
app.innerHTML = `
<header class="topbar"><div class="top-left"><a class="brand-mark" href="/" aria-label="Wgit home">${icon('git-branch')}</a><span class="top-divider"></span><span class="top-product">Wgit <span class="version-badge">v${version}</span></span><span class="top-slash">/</span><span class="top-context">community</span></div><div class="top-right"><span class="open-source">Open source &amp; free</span><button class="theme-button" id="theme-toggle" type="button" aria-label="Switch theme">${icon('moon')}</button><a class="github-top" href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">${icon('github')} <span>View on GitHub</span> ${icon('arrow-up-right')}</a></div></header>
<div class="repo-head"><div class="repo-title"><div class="repo-icon">${icon('book-marked')}</div><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">bufferclick</a><span class="slash">/</span><strong>Wgit</strong><span class="public-pill">Public</span></div></div>
<nav class="tabs" aria-label="Project navigation"><div class="tabs-inner"><a class="tab" href="/">${icon('code-xml')} Workspace</a><a class="tab active" href="/community" aria-current="page">${icon('message-square')} Community</a></div></nav>
<main class="layout community-layout"><section class="community-main"><div class="community-heading"><div><p class="community-eyebrow">WGIT COMMUNITY</p><h1>Discussions</h1><p>Share ideas and discuss what you'd like to see in Wgit.</p></div><button class="button primary" id="new-discussion" type="button">New discussion</button></div>
<div id="community-status" class="community-status" role="status" aria-live="polite"></div>
<div id="discussion-list" class="panel community-list" aria-label="Discussions"></div>
<section id="discussion-detail" hidden></section>
<section id="composer" class="panel composer" hidden><h2 id="composer-title">Start a discussion</h2><p id="composer-intro">What would you like to see added to Wgit?</p><form id="post-form"><label id="title-label" for="post-title">Title</label><input id="post-title" maxlength="120" placeholder="Give your idea a title" /><label for="post-body">Message</label><textarea id="post-body" maxlength="4000" rows="7" required placeholder="Share your idea or feedback..."></textarea><div class="composer-footer"><span id="posting-as"></span><div><button class="button" id="cancel-post" type="button">Cancel</button><button class="button primary" type="submit" id="submit-post">Post discussion</button></div></div></form></section></section>
<aside class="sidebar community-sidebar"><div class="about"><h2>About discussions</h2><p>Share feedback, ask questions, and suggest features for Wgit.</p></div><div class="side-section"><h3>POSTING</h3><p>Posts are public. Your Wgit settings name is shown; otherwise you appear as a guest with your approximate country. GitHub links are not verified. Posts can be deleted only in the browser where they were created.</p><p>To reduce spam, one post per minute is allowed per network address. A salted hash of the address is stored for rate limiting; people sharing an address share the limit.</p><a href="/settings">Change your name in Settings ↗</a></div></aside></main>
<footer><div><span class="footer-logo">${icon('git-branch')}</span> <strong>Wgit</strong><span>Made by Buffer</span><span>© 2026 Wgit contributors</span></div><div><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow-up-right')}</a></div></footer>`;
const $ = s => document.querySelector(s);
let theme; try { theme = localStorage.getItem('wgit.theme'); } catch {}
function setTheme(value, persist = false) { document.documentElement.dataset.theme = value; $('#theme-toggle').setAttribute('aria-label', value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); $('#theme-toggle').setAttribute('aria-pressed', String(value === 'dark')); $('#theme-toggle').innerHTML = icon(value === 'dark' ? 'sun' : 'moon'); createIcons({ icons }); if (persist) try { localStorage.setItem('wgit.theme', value); } catch {} }
setTheme(['dark', 'light'].includes(theme) ? theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
let posts = cachedCommunity(), selected = null, replyTo = null, country = null, loading = true;
let name = '', github = null; try { name = (localStorage.getItem('wgit.name') || '').trim().slice(0, 50); github = name ? githubUsername(localStorage.getItem('wgit.email') || '') : null; } catch {}
const showStatus = (text, error = false) => { $('#community-status').textContent = text; $('#community-status').classList.toggle('error', error); };
const element = (tag, className, text) => { const e = document.createElement(tag); e.className = className; if (text != null) e.textContent = text; return e; };
const date = value => { const d = new Date(value); return Number.isNaN(d.valueOf()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const slug = post => (post.title || 'discussion').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'discussion';
const threadUrl = post => `/community/${slug(post)}--${post.id}`;
const tokenKey = id => `wgit.community.owner.${id}`;
const ownerToken = id => { try { return localStorage.getItem(tokenKey(id)); } catch { return null; } };
function postingName() { let label = 'guest - unknown'; if (country) try { label = `guest - ${(new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || 'unknown').toLowerCase()}`; } catch {} return name || label; }
function navigate(url) { history.pushState(null, '', url); render(); }
window.addEventListener('popstate', render);
async function request(url, options) { const response = await fetch(url, options); let data; try { data = await response.json(); } catch { throw new Error('Community is temporarily unavailable. Please try again.'); } if (!response.ok) throw new Error(data.error || 'Community is temporarily unavailable. Please try again.'); return data; }
function authorNode(post) {
  const wrap = element('span', 'post-author');
  const user = typeof post.github_username === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(post.github_username) && !post.github_username.includes('--') ? post.github_username : null;
  if (user && !post.deleted) {
    const href = `https://github.com/${encodeURIComponent(user)}`;
    const avatar = element('a', 'author-avatar'); avatar.href = href; avatar.target = '_blank'; avatar.rel = 'noopener noreferrer'; avatar.setAttribute('aria-label', `GitHub profile of ${post.author}`);
    const img = element('img', ''); img.src = `${href}.png?size=64`; img.alt = ''; img.loading = 'lazy'; avatar.append(img);
    const link = element('a', 'author-name', post.author); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; wrap.append(avatar, link);
  } else wrap.append(element('strong', '', post.author));
  return wrap;
}
function composer(parent = null) {
  replyTo = parent; $('#composer').hidden = false; const reply = !!parent;
  $('#composer-title').textContent = reply ? `Reply to ${parent.author}` : 'Start a discussion';
  $('#composer-intro').textContent = reply ? 'Add to the conversation.' : "What would you like to see added to Wgit?";
  $('#title-label').hidden = reply; $('#post-title').hidden = reply; $('#post-title').required = !reply;
  $('#post-form').reset(); $('#posting-as').textContent = `Posting as ${postingName()} · public`; $('#submit-post').textContent = reply ? 'Post reply' : 'Post discussion';
  $('#composer').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); (reply ? $('#post-body') : $('#post-title')).focus();
}
function actions(post, card) {
  const bar = element('div', 'post-actions');
  if (!post.deleted) { const reply = element('button', 'post-action', 'Reply'); reply.type = 'button'; reply.addEventListener('click', () => navigate(`${threadUrl(selected)}/reply/${post.id}`)); bar.append(reply); }
  const permalink = element('a', 'post-action', 'Link'); permalink.href = `${threadUrl(selected)}#comment-${post.id}`; bar.append(permalink);
  if (ownerToken(post.id) && !post.deleted) {
    const del = element('button', 'post-action delete-post', 'Delete'); del.type = 'button';
    del.addEventListener('click', async () => {
      const root = !post.parent_id;
      if (!confirm(root ? 'Delete this discussion and all its replies?' : 'Delete your reply? Its replies will be kept.')) return;
      del.disabled = true;
      try { await request(api, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: post.id, token: ownerToken(post.id) }) }); try { localStorage.removeItem(tokenKey(post.id)); } catch {} await refresh(true); if (root) navigate('/community'); else render(); showStatus('Deleted.'); }
      catch (error) { showStatus(error.message, true); del.disabled = false; }
    }); bar.append(del);
  }
  card.append(bar);
}
function postCard(post, isReply = false) { const card = element('article', 'post-card'); card.id = `comment-${post.id}`; const meta = element('div', 'post-meta'); meta.append(authorNode(post), element('span', '', ` · ${date(post.created_at)}`)); card.append(meta); if (!isReply) card.append(element('h2', 'post-title', post.title)); card.append(element('p', 'post-body', post.body)); actions(post, card); return card; }
function render() {
  const path = location.pathname.replace(/\/$/, ''); const match = /^\/community\/[^/]+--([0-9a-f-]{36})(?:\/reply\/([0-9a-f-]{36}))?$/i.exec(path);
  $('#composer').hidden = true; $('#discussion-detail').hidden = true; $('#discussion-list').hidden = true; $('#new-discussion').hidden = true; selected = null;
  if (!posts) { showStatus('Loading discussions…'); return; }
  if (match) {
    selected = posts.find(post => post.id === match[1] && !post.parent_id);
    if (!selected) { showStatus(loading ? 'Loading discussion…' : 'Discussion not found.', !loading); return; }
    showStatus(''); const detail = $('#discussion-detail'); detail.hidden = false; detail.replaceChildren();
    const back = element('a', 'back-discussions', '← All discussions'); back.href = '/community'; back.addEventListener('click', e => { e.preventDefault(); navigate('/community'); }); detail.append(back, postCard(selected));
    const heading = element('div', 'replies-heading'); heading.append(element('h2', '', 'Replies')); detail.append(heading);
    const children = new Map(); for (const post of posts) if (post.parent_id) { if (!children.has(post.parent_id)) children.set(post.parent_id, []); children.get(post.parent_id).push(post); }
    // Iterative rendering avoids recursion limits and caps visual indentation, not thread depth.
    const replies = element('div', 'replies-tree'); const stack = (children.get(selected.id) || []).slice().reverse().map(post => ({ post, depth: 0 }));
    if (!stack.length) replies.append(element('p', 'empty-community', 'No replies yet.'));
    while (stack.length) { const { post, depth } = stack.pop(); const wrapper = element('div', 'reply-node'); wrapper.style.marginLeft = `${Math.min(depth, 4) * 18}px`; wrapper.append(postCard(post, true)); replies.append(wrapper); const nested = children.get(post.id) || []; for (let i = nested.length - 1; i >= 0; i--) stack.push({ post: nested[i], depth: depth + 1 }); }
    detail.append(replies);
    if (match[2]) { const parent = posts.find(post => post.id === match[2] && !post.deleted); if (parent && (parent.id === selected.id || detail.querySelector(`#comment-${parent.id}`))) composer(parent); else showStatus('Reply not found.', true); }
    if (location.hash && /^#comment-[0-9a-f-]{36}$/i.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
  } else {
    showStatus(''); $('#discussion-list').hidden = false; $('#new-discussion').hidden = false;
    const list = $('#discussion-list'); list.replaceChildren(); const roots = posts.filter(post => !post.parent_id).sort((a,b) => b.created_at.localeCompare(a.created_at));
    if (!roots.length) list.append(element('p', 'empty-community', 'No discussions yet. Start one to share an idea.'));
    for (const post of roots) { const item = element('article', 'discussion-item'); const title = element('a', 'discussion-title', post.title); title.href = threadUrl(post); title.addEventListener('click', e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); navigate(title.href); } }); const meta = element('div', 'discussion-meta'); meta.append(authorNode(post), element('span', '', ` · ${date(post.created_at)}`)); item.append(title, meta); list.append(item); }
    if (path === '/community/new') composer();
  }
}
async function refresh(fresh = false) { posts = await fetchCommunity(fresh); loading = false; if ($('#composer').hidden) render(); }
$('#new-discussion').addEventListener('click', () => navigate('/community/new'));
$('#cancel-post').addEventListener('click', () => navigate(selected ? threadUrl(selected) : '/community'));
$('#post-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('#submit-post'); button.disabled = true; showStatus('Posting…');
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(32)); const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const ownerHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
    // Ensure this browser can save deletion keys before publishing.
    localStorage.setItem('wgit.community.storage-check', '1'); localStorage.removeItem('wgit.community.storage-check');
    const posted = await request(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, country, github, title: $('#post-title').value, body: $('#post-body').value, parent: replyTo?.id || null, owner_hash: ownerHash }) });
    let keySaved = true; try { localStorage.setItem(tokenKey(posted.id), token); } catch { keySaved = false; }
    const destination = selected ? threadUrl(selected) : threadUrl(posted);
    posts = [...(posts || []), posted]; navigate(destination); showStatus(keySaved ? 'Posted. Please wait one minute before posting again.' : 'Posted, but this browser could not save its deletion key.', !keySaved);
    refresh(true).catch(() => showStatus('Posted, but could not refresh discussions.', true));
  } catch (error) { showStatus(error.message || 'Could not post. Browser storage is required to manage your posts.', true); }
  finally { button.disabled = false; }
});
fetch('/api/community-country').then(r => r.ok ? r.json() : null).then(data => { country = data?.country || null; if (!$('#composer').hidden) $('#posting-as').textContent = `Posting as ${postingName()} · public`; }).catch(() => {});
render(); refresh().catch(error => { loading = false; if (!posts) showStatus(error.message, true); });
