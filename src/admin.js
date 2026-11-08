import { pageShell } from './page-shell.js';
import { verifiedUser, signIn, signOut, apiRequest } from './auth.js';
const main = pageShell('admin', '');
main.innerHTML = `<section class="community-main"><div class="community-heading"><div><p class="community-eyebrow">WGIT SETTINGS</p><h1>Admin</h1><p>Community moderation and data management.</p></div></div><div class="community-auth"><span id="admin-auth">Checking GitHub verification…</span><button class="button" id="admin-signin" hidden>Verify with GitHub</button><button class="button" id="admin-signout" hidden>Sign out</button></div><p id="admin-status" class="community-status" role="status" aria-live="polite"></p><div id="admin-controls" hidden><section class="panel admin-panel"><h2>Ban an account</h2><p>Banned GitHub accounts cannot start discussions or reply. Accounts are matched by GitHub ID, even if renamed.</p><form id="ban-form" class="admin-ban"><label for="ban-email">GitHub username email</label><input id="ban-email" type="email" placeholder="username@github.com" required /><button class="button primary" type="submit">Ban account</button></form><h3>Banned accounts</h3><div id="ban-list"></div></section><section class="panel admin-panel admin-danger"><h2>Delete selected data</h2><p>This is irreversible. Select exactly what to delete. The database schema, project settings and storage files are not deleted.</p><div class="admin-options"><label><input type="checkbox" value="posts" /> Discussions and all replies</label><label><input type="checkbox" value="votes" /> Update votes</label><label><input type="checkbox" value="bans" /> Account bans</label><label><input type="checkbox" value="limits" /> Posting rate-limit records</label><label><input type="checkbox" value="accounts" /> All Supabase authentication accounts, including yours</label></div><button id="wipe-data" type="button" class="button danger-button">Review deletion</button></section></div></section><aside class="sidebar community-sidebar"><div class="about"><h2>Admin access</h2><p>Only the verified BufferClick GitHub account can access these controls. Each operation is checked on the server.</p></div></aside>`;
const $ = s => document.querySelector(s);
const label = { posts:'discussions and replies', votes:'update votes', bans:'account bans', limits:'posting rate-limit records', accounts:'all Supabase authentication accounts, including yours' };
const status = (text, error = false) => { $('#admin-status').textContent = text; $('#admin-status').classList.toggle('error', error); };
async function listBans() {
  const list = $('#ban-list'); list.replaceChildren(); const bans = await apiRequest('bans');
  if (!bans.length) { list.textContent = 'No banned accounts.'; return; }
  for (const ban of bans) { const row = document.createElement('div'); row.className = 'ban-row'; const name = document.createElement('span'); name.textContent = `${ban.github_login}@github.com`; const button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.textContent = 'Unban'; button.addEventListener('click', async () => { button.disabled = true; try { await apiRequest('unban', { method:'POST', data:{ email: `${ban.github_login}@github.com` } }); await listBans(); status('Account unbanned.'); } catch (e) { status(e.message, true); button.disabled = false; } }); row.append(name, button); list.append(row); }
}
async function initialize() {
  try { const user = await verifiedUser(); $('#admin-signin').hidden = !!user; $('#admin-signout').hidden = !user; $('#admin-auth').textContent = !user ? 'Verify with GitHub to check admin access.' : user.admin ? `Verified as @${user.login}` : `Verified as @${user.login} · access denied`;
    $('#admin-controls').hidden = !user?.admin; if (user?.admin) await listBans();
  } catch (e) { $('#admin-controls').hidden = true; $('#admin-signin').hidden = false; status(e.message, true); }
}
$('#admin-signin').addEventListener('click', () => signIn().catch(e => status(e.message, true)));
$('#admin-signout').addEventListener('click', () => signOut().then(initialize).catch(e => status(e.message, true)));
$('#ban-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; try { await apiRequest('ban', { method:'POST', data:{ email: $('#ban-email').value } }); $('#ban-email').value = ''; await listBans(); status('Account banned.'); } catch (err) { status(err.message, true); } finally { button.disabled = false; } });
$('#wipe-data').addEventListener('click', async () => {
  const categories = [...document.querySelectorAll('.admin-options input:checked')].map(x => x.value);
  if (!categories.length) return status('Select at least one category.', true);
  const description = categories.map(x => label[x]).join(', ');
  if (!confirm(`Confirmation 1 of 3: Delete ${description}?`)) return;
  if (!confirm(`Confirmation 2 of 3: This permanently deletes ${description}. It cannot be undone. Continue?`)) return;
  if (prompt('Confirmation 3 of 3: Type DELETE SELECTED DATA to confirm.') !== 'DELETE SELECTED DATA') return status('Deletion cancelled.');
  const button = $('#wipe-data'); button.disabled = true;
  try { await apiRequest('wipe', { method:'POST', data:{ categories, confirmations:['reviewed','irreversible','DELETE SELECTED DATA'] } }); status('Selected data deleted.'); if (categories.includes('accounts')) { await signOut().catch(() => {}); } await initialize(); }
  catch (e) { status(e.message, true); }
  finally { button.disabled = false; }
});
initialize();
