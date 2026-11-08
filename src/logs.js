import { pageShell } from './page-shell.js';
import { releases } from './releases.js';
import { verifiedUser, signIn, signOut, apiRequest } from './auth.js';
const main = pageShell('logs', 'logs');
main.innerHTML = `<section class="community-main"><div class="community-heading"><div><p class="community-eyebrow">WGIT</p><h1>Update logs</h1><p>See what changed in each Wgit update.</p></div></div><div class="community-auth"><span id="logs-auth">Checking GitHub verification…</span><button class="button" id="logs-signin" hidden>Verify with GitHub</button><button class="button" id="logs-signout" hidden>Sign out</button></div><p id="logs-status" class="community-status" role="status" aria-live="polite"></p><div id="release-list" class="panel community-list"></div></section><aside class="sidebar community-sidebar"><div class="about"><h2>About updates</h2><p>Newest updates appear first. Sign in with GitHub to vote once on each update; you can change or remove your vote.</p></div></aside>`;
const $ = s => document.querySelector(s); let user = null, totals = [], mine = [];
const node = (tag, cls, value) => { const n = document.createElement(tag); n.className = cls; if (value != null) n.textContent = value; return n; };
function status(value, error = false) { $('#logs-status').textContent = value; $('#logs-status').classList.toggle('error', error); }
function render() {
  const list = $('#release-list'); list.replaceChildren();
  for (const r of releases) {
    const item = node('article', 'release-item'); const top = node('div', 'release-title'); top.append(node('span', 'release-version', r.label), node('h2', '', r.title)); item.append(top, node('p', 'release-details', r.details));
    const details = node('ul', 'release-changes'); for (const change of r.changes) details.append(node('li', '', change)); item.append(details);
    const votes = totals.find(x => x.release_id === r.id) || {}; const current = mine.find(x => x.release_id === r.id)?.direction || 0; const bar = node('div', 'vote-actions');
    for (const [direction, text, count] of [[1, '↑ Upvote', votes.upvotes || 0], [-1, '↓ Downvote', votes.downvotes || 0]]) {
      const button = node('button', 'vote-button', `${text} ${count}`); button.type = 'button'; button.disabled = !user; button.setAttribute('aria-pressed', String(current === direction));
      button.addEventListener('click', async () => { button.disabled = true; try { await apiRequest('vote', { method: 'POST', data: { release: r.id, direction: current === direction ? 0 : direction } }); await updateVotes(); status('Vote saved.'); } catch (e) { status(e.message, true); button.disabled = false; } }); bar.append(button);
    }
    item.append(bar); list.append(item);
  }
}
async function updateVotes() { const result = await apiRequest('votes', { authenticated: !!user }); totals = result.totals || []; mine = result.mine || []; render(); }
async function initialize() { try { user = await verifiedUser(); $('#logs-auth').textContent = user ? `Verified as @${user.login}` : 'Verify with GitHub to vote.'; $('#logs-signin').hidden = !!user; $('#logs-signout').hidden = !user; await updateVotes(); } catch (e) { status(e.message, true); render(); } }
$('#logs-signin').addEventListener('click', () => signIn().catch(e => status(e.message, true)));
$('#logs-signout').addEventListener('click', () => signOut().then(initialize).catch(e => status(e.message, true)));
render(); initialize();
