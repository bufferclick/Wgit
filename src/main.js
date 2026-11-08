import './polyfills.js';
import * as git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import { createIcons, GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, CircleDot, Terminal, FolderOpen, Trash2, Command, Link, Folder, ArrowUpLeft, Settings, Maximize2, Minimize2, Moon, Sun } from 'lucide';
const icons = { GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, CircleDot, Terminal, FolderOpen, Trash2, Command, Link, Folder, ArrowUpLeft, Settings, Maximize2, Minimize2, Moon, Sun };
import { nativeFS } from './native-fs.js';
import { repositoryState, initRepository, incompleteMessage } from './repository.js';
import { remoteCommand, preparePush, pushBranch } from './remotes.js';
import { prepareSync, syncBranch } from './sync.js';
import { prepareAutoPush, autoPush } from './auto-push.js';
import { readTextFile } from './cat.js';
import { version } from '../package.json';
import gitIcon from '../favicon.svg';
import './style.css';

const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
document.querySelector('#app').innerHTML = `
<header class="topbar">
  <div class="top-left"><a class="brand-mark" href="#" aria-label="Wgit home">${icon('git-branch')}</a><span class="top-divider"></span><span class="top-product">Wgit <span class="version-badge">v${version}</span></span><span class="top-slash">/</span><span class="top-context">workspace</span></div>
  <div class="top-right"><span class="open-source">Open source &amp; free</span><button class="theme-button" id="theme-toggle" type="button" aria-label="Switch to dark mode" title="Switch theme">${icon('moon')}</button><button class="settings-button" id="open-settings">${icon('settings')} Settings</button><a class="github-top" href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">${icon('github')} <span>View on GitHub</span> ${icon('arrow-up-right', 'external')}</a></div>
</header>
<div class="repo-head"><div class="repo-title"><div class="repo-icon">${icon('book-marked')}</div><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">bufferclick</a><span class="slash">/</span><strong>Wgit</strong><span class="public-pill">Public</span></div></div>
<nav class="tabs" aria-label="Project navigation"><div class="tabs-inner"><a class="tab active" href="#workspace">${icon('code-xml')} Workspace</a></div></nav>
<main id="workspace" class="layout">
  <section class="main-column">
    <div class="workspace-label"><img src="${gitIcon}" alt="" /><h1>Browser-based Git workspace</h1></div>
    <div class="panel folder-panel"><div class="folder-illustration">${icon('folder-open')}</div><div class="folder-copy"><div class="folder-title" id="folder-title">Open a project folder</div><div class="folder-description" id="folder-description">Choose a local folder to use with Git.</div></div><button class="button primary" id="open-folder">${icon('folder-open')} Open folder</button></div>
    <div class="terminal panel"><div class="terminal-top"><div class="terminal-title">${icon('terminal')} <strong>Terminal</strong><span class="terminal-divider"></span><span>Wgit shell</span></div><div class="terminal-actions"><span id="copy-state" role="status" aria-live="polite">Select text to copy</span><span id="terminal-state"><span class="status-dot"></span> Ready</span><button id="fullscreen-terminal" class="icon-button" title="Expand terminal" aria-label="Expand terminal">${icon('maximize-2')}</button><button id="clear-terminal" class="icon-button" title="Clear terminal" aria-label="Clear terminal">${icon('trash-2')}</button></div></div><div class="terminal-body" id="terminal-body"><div class="terminal-welcome"><div class="terminal-hint">Open a folder or type <span>help</span> for commands.</div></div><div id="terminal-output" aria-live="polite"></div><form id="terminal-form" autocomplete="off"><label for="command-input" class="prompt"><span>➜</span> <span class="prompt-path" id="prompt-path">~</span></label><input id="command-input" aria-label="Terminal command" spellcheck="false" placeholder="Type a command..." /></form></div><div class="terminal-bottom"><span>${icon('command')} Wgit shell <span class="terminal-shortcut">· ↑ ↓ command history</span></span><span>Type <kbd>help</kbd> for a list of commands</span></div></div>
    <div class="demo-row"><span>Demo workspace · stored in browser only</span><button id="try-demo" type="button">Open demo</button></div>
  </section>
  <aside class="sidebar"><div class="about"><h2>About Wgit</h2><p>Wgit (Web-Git) runs Git commands in your browser.</p><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">${icon('link')} github.com/bufferclick/Wgit</a></div><div class="side-section"><h3>YOUR WORKSPACE</h3><div class="side-status"><div class="side-icon">${icon('folder')}</div><div><strong id="side-folder">No folder selected</strong><p id="side-detail">Open a folder to get started</p></div></div><div class="side-meta"><span>${icon('git-branch')} Branch</span><strong id="branch-label">—</strong></div><div class="side-meta"><span>${icon('circle-dot')} Status</span><strong id="status-label">Not connected</strong></div></div><div class="side-section commands"><div class="side-heading"><h3>QUICK COMMANDS</h3><span>Click to insert</span></div><button data-command="git init"><code>git init</code>${icon('arrow-up-left')}</button><button data-command="git status"><code>git status</code>${icon('arrow-up-left')}</button><button data-command="git add ."><code>git add .</code>${icon('arrow-up-left')}</button><button data-command="git commit -m &quot;First commit&quot;"><code>git commit -m "..."</code>${icon('arrow-up-left')}</button><button data-command="git log"><code>git log</code>${icon('arrow-up-left')}</button><button data-command="git remote -v"><code>git remote -v</code>${icon('arrow-up-left')}</button><button data-command="git push -u origin main"><code>git push -u origin main</code>${icon('arrow-up-left')}</button><button data-command="wgit push main"><code>wgit push main</code>${icon('arrow-up-left')}</button></div></aside>
</main><dialog id="settings-dialog" aria-labelledby="settings-title"><form id="settings-form"><h2 id="settings-title">Settings</h2><p>Default commit identity for projects in this browser. A repository's own Git config takes precedence.</p><label for="settings-name">Name</label><input id="settings-name" autocomplete="off" /><label for="settings-email">Email</label><input id="settings-email" type="email" autocomplete="off" /><label for="settings-token">GitHub personal access token</label><input id="settings-token" type="password" autocomplete="new-password" spellcheck="false" placeholder="Leave blank to keep existing token" /><p id="token-status" class="dialog-note"></p><p class="dialog-note warning-note">If saved, the token is stored unencrypted in this browser. Anyone with access to this browser profile, developer tools, extensions, or a compromised site can read it. Only save it on a trusted device. Pushes send it through this site's GitHub relay.</p><a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noopener noreferrer">GitHub token permissions ↗</a><p id="settings-error" class="settings-error" role="alert"></p><div class="dialog-actions"><button type="button" id="clear-saved-token" class="button">Remove saved token</button><button type="button" id="cancel-settings" class="button">Cancel</button><button type="submit" class="button primary">Save settings</button></div></form></dialog><dialog id="conflict-dialog" aria-labelledby="conflict-title"><h2 id="conflict-title">Choose a version</h2><p>Both your project and GitHub changed <strong id="conflict-path"></strong>. Choose which version to include in the merged project.</p><p class="conflict-explanation" id="conflict-explanation"></p><div class="dialog-actions"><button type="button" id="cancel-sync" class="button">Cancel sync</button><button type="button" id="keep-remote" class="button"></button><button type="button" id="keep-local" class="button primary"></button></div></dialog><dialog id="push-dialog" aria-labelledby="push-title"><form id="push-form"><h2 id="push-title">Connect to GitHub</h2><p><span id="auth-action">Push</span> <strong id="push-branch"></strong> to <strong id="push-target"></strong>.</p><label for="github-token">GitHub personal access token</label><input id="github-token" type="password" required autocomplete="off" spellcheck="false" placeholder="Paste token here" /><p class="dialog-note">Use a fine-grained token with repository Contents read and write access. It is sent through this site's GitHub-only relay to GitHub, and is not saved by Wgit. Never enter it in the terminal.</p><a href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens" target="_blank" rel="noopener noreferrer">How to create a token ↗</a><div class="dialog-actions"><button type="button" id="cancel-push" class="button">Cancel</button><button type="submit" class="button primary">Push to GitHub</button></div></form></dialog><footer><div><span class="footer-logo">${icon('git-branch')}</span> <strong>Wgit</strong><span>Made by Buffer</span><span>© 2026 Wgit contributors</span></div><div><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow-up-right')}</a></div></footer>`;
createIcons({ icons });

const $ = s => document.querySelector(s);
const input = $('#command-input'), output = $('#terminal-output'), body = $('#terminal-body');
let fs = null, cwd = '/workspace', rootName = '', repo = null, history = [], historyIndex = 0, busy = false;
const pfs = () => fs.promises;
const themeToggle = $('#theme-toggle');
function setTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  themeToggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
  createIcons({ icons });
  if (persist) { try { localStorage.setItem('wgit.theme', theme); } catch {} }
}
let preferredTheme;
try { preferredTheme = localStorage.getItem('wgit.theme'); } catch {}
setTheme(['dark', 'light'].includes(preferredTheme) ? preferredTheme : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
const storageKeys = { name: 'wgit.name', email: 'wgit.email', token: 'wgit.token' };
function stored(key) { try { return localStorage.getItem(storageKeys[key]) || ''; } catch { return ''; } }
async function identity(opts) { return { name: await git.getConfig({ ...opts, path: 'user.name' }) || stored('name'), email: await git.getConfig({ ...opts, path: 'user.email' }) || stored('email') }; }
const settings = $('#settings-dialog'), settingsToken = $('#settings-token');
$('#open-settings').addEventListener('click', () => { if (busy) return; $('#settings-name').value = stored('name'); $('#settings-email').value = stored('email'); settingsToken.value = ''; $('#token-status').textContent = stored('token') ? 'A token is saved. Leave blank to keep it.' : 'No token saved. Leave blank to ask on each push.'; $('#settings-error').textContent = ''; settings.showModal(); });
$('#cancel-settings').addEventListener('click', () => { settingsToken.value = ''; settings.close(); });
settings.addEventListener('cancel', () => { settingsToken.value = ''; });
$('#clear-saved-token').addEventListener('click', () => { try { localStorage.removeItem(storageKeys.token); settingsToken.value = ''; $('#token-status').textContent = 'Saved token removed.'; } catch { $('#settings-error').textContent = 'Could not access browser storage.'; } });
$('#settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const secret = settingsToken.value.trim();
  if (secret && !/^[\x21-\x7e]+$/.test(secret)) { $('#settings-error').textContent = 'The token cannot contain spaces.'; return; }
  try { localStorage.setItem(storageKeys.name, $('#settings-name').value.trim()); localStorage.setItem(storageKeys.email, $('#settings-email').value.trim()); if (secret) localStorage.setItem(storageKeys.token, secret); settingsToken.value = ''; settings.close(); }
  catch { settingsToken.value = ''; $('#settings-error').textContent = 'Could not save settings in browser storage.'; }
});
const terminal = document.querySelector('.terminal'), fullscreen = $('#fullscreen-terminal');
function setExpanded(expanded) { terminal.classList.toggle('expanded', expanded); fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen terminal' : 'Expand terminal'); fullscreen.title = expanded ? 'Exit fullscreen terminal' : 'Expand terminal'; fullscreen.innerHTML = icon(expanded ? 'minimize-2' : 'maximize-2'); createIcons({ icons }); }
fullscreen.addEventListener('click', () => setExpanded(!terminal.classList.contains('expanded')));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && terminal.classList.contains('expanded') && !document.querySelector('dialog[open]')) setExpanded(false); });
function resolveConflict(conflict) {
  return new Promise(resolve => {
    const dialog = $('#conflict-dialog'); $('#conflict-path').textContent = conflict.path;
    $('#conflict-explanation').textContent = conflict.ours ? 'Using your local file means it will replace the version on GitHub after a successful push. The other version remains in Git history. Nothing is pushed until the push succeeds.' : 'Using your local deletion will remove this file from GitHub after a successful push. The other version remains in Git history. Nothing is pushed until the push succeeds.';
    $('#keep-local').textContent = conflict.ours ? 'Use my local file' : 'Use my local deletion';
    $('#keep-remote').textContent = conflict.theirs ? 'Use GitHub file' : 'Use GitHub deletion';
    const local = () => finish('local'), remote = () => finish('remote'), cancel = event => { event.preventDefault(); finish(null); };
    function finish(value) { $('#keep-local').removeEventListener('click', local); $('#keep-remote').removeEventListener('click', remote); $('#cancel-sync').removeEventListener('click', cancel); dialog.removeEventListener('cancel', cancel); if (dialog.open) dialog.close(); resolve(value); }
    $('#keep-local').addEventListener('click', local); $('#keep-remote').addEventListener('click', remote); $('#cancel-sync').addEventListener('click', cancel); dialog.addEventListener('cancel', cancel); dialog.showModal();
  });
}
const clean = path => { const result = []; for (const part of path.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (result.length > 1) result.pop(); } else result.push(part); } return '/' + result.join('/'); };
const resolve = path => clean(path?.startsWith('/') ? path : `${cwd}/${path || ''}`);
const displayPath = path => '~/' + [rootName, ...path.split('/').slice(2)].filter(Boolean).join('/');
function print(text, type = '') { const line = document.createElement('div'); line.className = `output-line ${type}`; line.textContent = text; output.append(line); body.scrollTop = body.scrollHeight; }
function printFile(name, text) {
  const container = document.createElement('div'); container.className = 'output-line file-output';
  const heading = document.createElement('div'); heading.className = 'file-output-heading';
  const glyph = document.createElement('span'); glyph.className = 'file-output-glyph'; glyph.textContent = '▤';
  const label = document.createElement('span'); label.textContent = name;
  const badge = document.createElement('span'); badge.className = 'file-output-badge'; badge.textContent = text ? 'TEXT' : 'EMPTY FILE';
  heading.append(glyph, label, badge);
  const content = document.createElement('pre'); content.className = 'file-output-content'; content.textContent = text;
  container.append(heading, content); output.append(container); body.scrollTop = body.scrollHeight;
}
async function findRepo() { if (!fs) return null; let path = cwd; while (path === '/workspace' || path.startsWith('/workspace/')) { if (await repositoryState(fs, path) !== 'absent') return path; if (path === '/workspace') break; path = path.substring(0, path.lastIndexOf('/')); } return null; }
async function refresh() {
  $('#prompt-path').textContent = fs ? displayPath(cwd) : '~';
  repo = await findRepo();
  $('#branch-label').textContent = '—';
  $('#status-label').textContent = fs ? 'No repository' : 'Not connected';
  if (repo) {
    if (await repositoryState(fs, repo) !== 'ready') { $('#status-label').textContent = 'Incomplete repository'; return; }
    try { $('#branch-label').textContent = await git.currentBranch({ fs, dir: repo, fullname: false }) || 'Detached HEAD'; } catch {}
    try { const matrix = await git.statusMatrix({ fs, dir: repo }); const count = matrix.filter(([,h,w,s]) => h !== w || h !== s).length; $('#status-label').textContent = count ? `${count} changed ${count === 1 ? 'file' : 'files'}` : 'Clean'; } catch { $('#status-label').textContent = 'Repository open'; }
  }
}
async function setWorkspace(newFs, name, demo = false) {
  fs = newFs; cwd = '/workspace'; rootName = name;
  $('#folder-title').textContent = name;
  $('#folder-description').textContent = demo ? 'A sandbox saved in this browser. Your local files are untouched.' : 'Local folder connected. Commands run directly on your files.';
  $('#side-folder').textContent = name; $('#side-detail').textContent = demo ? 'Browser demo workspace' : 'Local folder connected';
  $('#open-folder').innerHTML = `${icon('folder-open')} Change folder`; createIcons({ icons });
  print(`Opened ${demo ? 'demo workspace' : 'folder'}: ${name}`, 'success'); await refresh(); input.focus();
}
$('#open-folder').addEventListener('click', async () => {
  if (busy) return;
  if (!window.showDirectoryPicker) { print('Folder access is not supported in this browser. Try a Chromium-based browser, or use the demo workspace.', 'error'); input.focus(); return; }
  try { const handle = await window.showDirectoryPicker({ mode: 'readwrite' }); await setWorkspace(nativeFS(handle), handle.name); }
  catch (e) { if (e.name !== 'AbortError') print(`Could not open folder: ${e.message}`, 'error'); }
});
$('#try-demo').addEventListener('click', async () => {
  if (busy) return;
  try { const demoFS = new LightningFS('wgit-demo'); let created = false; try { await demoFS.promises.mkdir('/workspace'); created = true; } catch (e) { if (e.code !== 'EEXIST') throw e; } if (created) await demoFS.promises.writeFile('/workspace/README.md', '# My project\n\nHello from Wgit!\n'); await setWorkspace(demoFS, 'demo-project', true); }
  catch (e) { print(`Could not open demo: ${e.message}`, 'error'); }
});
$('#clear-terminal').addEventListener('click', () => { output.replaceChildren(); input.focus(); });
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.command; input.focus(); }));
// Preserve selected text: focusing the input on every click used to clear it.
body.addEventListener('click', event => {
  const selection = window.getSelection();
  if (event.target !== input && (!selection || selection.isCollapsed)) input.focus();
});
const copyState = $('#copy-state');
let copyTimer;
function showCopyState(message, isError = false) {
  clearTimeout(copyTimer);
  copyState.textContent = message;
  copyState.classList.toggle('copy-error', isError);
  copyState.classList.toggle('copied', !isError);
  copyTimer = setTimeout(() => { copyState.textContent = 'Select text to copy'; copyState.classList.remove('copied', 'copy-error'); }, 4000);
}
body.addEventListener('pointerup', async () => {
  let text = '';
  if (document.activeElement === input && input.selectionStart !== input.selectionEnd) {
    text = input.value.slice(input.selectionStart, input.selectionEnd);
  } else {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && body.contains(selection.anchorNode) && body.contains(selection.focusNode)) text = selection.toString();
  }
  if (!text) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showCopyState('Copied');
  } catch {
    // Older browsers can copy the current selection during the same gesture.
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Clipboard access was denied. */ }
    showCopyState(copied ? 'Copied' : 'Copy blocked — use Ctrl/Cmd+C', !copied);
  }
});
input.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { e.preventDefault(); if (historyIndex > 0) input.value = history[--historyIndex]; } if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIndex < history.length) historyIndex++; input.value = history[historyIndex] || ''; } });
function tokenize(str) { const tokens = []; const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g; for (const match of str.matchAll(re)) tokens.push(match[0].replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => a ?? b)); return tokens; }
const help = `Available commands\n  pwd                     Show the current folder\n  ls                      List files and folders\n  cat <file>              Display a UTF-8 text file\n  cd <folder>             Change folder (cd .. to go back)\n  clear                   Clear terminal output\n  git init                Initialize a repository\n  git status [-s]         Show changed files\n  git add <file|.>        Stage files\n  git commit -m "message"  Commit staged changes\n  git log [--oneline] [-n N]  Show commit history\n  git ls-files            List tracked files\n  git branch [name]       List or create branches\n  git branch -M <name>    Rename the current branch\n  git switch <branch>     Switch branches\n  git switch -c <branch>  Create and switch to a branch\n  git config user.name <name>\n  git config user.email <email>\n  git config --get user.name|user.email\n  git remote add <name> <https-url>  Add a GitHub remote\n  git remote -v           List remotes\n  git remote set-url <name> <url>  Change a remote\n  git remote remove <name>       Remove a remote\n  git sync <remote> <branch>      Merge remote history safely\n  git push -u <remote> <branch>   Push and set upstream\n  git push                Push the current branch to its upstream\n  wgit push <branch>      Stage, commit, sync if needed, and push to origin\n\nGitHub HTTPS push is supported. wgit push stages all non-ignored changes and creates an automatic commit. Conflicts require your choice; no force push is used. Use git sync before a regular push when the remote has existing history. Other hosts, force pushes, pull and shell commands are not supported yet.`;
function requestPushToken(target, action = 'Push') {
  const saved = stored('token'); if (saved) return Promise.resolve(saved);
  return new Promise(resolve => {
    const dialog = $('#push-dialog'), form = $('#push-form'), token = $('#github-token');
    $('#auth-action').textContent = action;
    $('#push-target').textContent = target.url;
    $('#push-branch').textContent = target.remoteBranch || target.branch;
    function finish(value) { token.value = ''; form.removeEventListener('submit', submit); $('#cancel-push').removeEventListener('click', cancel); dialog.removeEventListener('cancel', cancel); if (dialog.open) dialog.close(); resolve(value); }
    function cancel(event) { event.preventDefault(); finish(null); }
    function submit(event) { event.preventDefault(); const value = token.value.trim(); if (!value || !/^[\x21-\x7e]+$/.test(value)) { token.setCustomValidity('Enter a token without spaces.'); token.reportValidity(); token.setCustomValidity(''); return; } finish(value); }
    form.addEventListener('submit', submit); $('#cancel-push').addEventListener('click', cancel); dialog.addEventListener('cancel', cancel); dialog.showModal(); token.focus();
  });
}
async function command(line) {
  const args = tokenize(line), cmd = args.shift(); if (!cmd) return;
  if (cmd === 'help') return print(help);
  if (cmd === 'clear') { output.replaceChildren(); return; }
  if (!fs) return print('Open a folder or try the demo workspace first.', 'error');
  if (cmd === 'pwd') return print(displayPath(cwd));
  if (cmd === 'ls') { const names = await pfs().readdir(cwd); return print(names.filter(n => args.includes('-a') || !n.startsWith('.')).sort().join('  ') || '(empty folder)'); }
  if (cmd === 'cat') { if (!args.length || args.some(arg => arg.startsWith('-'))) throw new Error('Use cat <file> [file...] for UTF-8 text files.'); for (const name of args) { try { printFile(name, await readTextFile(fs, resolve(name))); } catch (error) { throw new Error(`cat: ${name}: ${error.message}`); } } return; }
  if (cmd === 'cd') { const target = args[0] ? resolve(args[0]) : '/workspace'; if ((target !== '/workspace' && !target.startsWith('/workspace/')) || !(await pfs().stat(target)).isDirectory()) throw new Error('Not a directory'); cwd = target; return; }
  if (cmd !== 'git' && cmd !== 'wgit') return print(`Command not supported: ${cmd}. Type help to see available commands.`, 'error');
  const sub = args.shift();
  if (cmd === 'wgit') {
    if (sub !== 'push' || args.length !== 1) throw new Error('Use wgit push <branch>, for example wgit push main.');
    if (!repo) throw new Error('Not a Git repository. Run git init and add an origin remote first.');
    if (await repositoryState(fs, repo) !== 'ready') throw new Error(incompleteMessage);
    const opts = { fs, dir: repo }, target = await prepareAutoPush(opts, args[0]), author = await identity(opts);
    if (!author.name || !author.email) throw new Error('Set your name and email in Settings before using wgit push.');
    const token = await requestPushToken(target); if (!token) return print('Push cancelled. This command made no changes.');
    print(`Preparing ${displayPath(repo)} for ${target.url} (${target.remoteBranch}). All non-ignored changes, including deletions, will be committed; check for secrets.`);
    const result = await autoPush(opts, target, author, token, resolveConflict, message => print(message));
    if (result.cancelled) return print('Sync cancelled. No push was made; any new local commit was kept.');
    if (!result.upstreamSaved) return print(`Pushed to ${target.remoteBranch}, but could not save upstream settings. Check folder permissions.`, 'error');
    return print(`Pushed ${target.branch} to ${target.url} branch ${target.remoteBranch}${result.synced ? ' after syncing' : ''}.`, 'success');
  }
  if (sub === '--version' || sub === 'version') return print(`Wgit v${version} · powered by isomorphic-git`);
  if (sub === 'init') { if (args.length) throw new Error('Use cd to choose a folder before running git init.'); await initRepository(fs, cwd); return print(`Initialized empty Git repository in ${displayPath(cwd)}/.git/`, 'success'); }
  if (!repo) return print('Not a Git repository. Run git init to create one.', 'error');
  const state = await repositoryState(fs, repo);
  if (state === 'empty') throw new Error('The .git folder is empty from an incomplete initialization. Run git init to retry.');
  if (state === 'unsupported') throw new Error('This folder uses a .git file; linked worktrees are not supported by Wgit.');
  if (state !== 'ready') throw new Error(incompleteMessage);
  const opts = { fs, dir: repo };
  if (sub === 'remote') return print(await remoteCommand(opts, args));
  if (sub === 'sync') {
    const target = await prepareSync(opts, args), author = await identity(opts);
    if (!author.name || !author.email) throw new Error('Set your name and email in Settings or Git config before syncing.');
    const token = await requestPushToken(target, 'Sync'); if (!token) return print('Sync cancelled.');
    print(`Fetching ${target.remote}/${target.branch} from ${target.url}...`);
    let result;
    try { result = await syncBranch(opts, target, token, author, resolveConflict); }
    catch (error) {
      if (error.code === 'HttpError') throw new Error('Could not fetch from GitHub. Check the URL, access permissions, and connection.');
      throw error;
    }
    if (result.cancelled) return print('Sync cancelled. Your branch and project files were not changed.');
    if (result.already) return print('Your branch already includes the remote history.');
    return print(`Synced ${target.remote}/${target.branch}. Your local and GitHub histories are preserved. You can now run git push -u ${target.remote} ${target.branch}.`, 'success');
  }
  if (sub === 'push') {
    const target = await preparePush(opts, args);
    const token = await requestPushToken(target);
    if (!token) return print('Push cancelled.');
    print(`Pushing ${target.branch} to ${target.url}...`);
    let result;
    try { result = await pushBranch(opts, target, token); }
    catch (error) {
      if (error.code === 'PushRejectedError' || /not-fast-forward|non-fast-forward/.test(error.message || '')) throw new Error(`Push rejected: the remote has commits not in this branch. No force push was attempted. Run git sync ${target.remote} ${target.branch}, choose how to resolve any conflicts, then push again.`);
      if (error.code === 'HttpError' && /\b(401|403|404)\b/.test(error.message || '')) throw new Error('GitHub denied access or the repository was not found. Check the URL, token permissions, and repository access.');
      throw new Error('Push could not be confirmed. Check GitHub before retrying, then check the connection, token permissions, and branch protections.');
    }
    if (!result.upstreamSaved) return print(`Pushed ${target.branch} to ${target.url}, but could not save upstream settings. Check folder permissions.`, 'error');
    return print(`Pushed ${target.branch} to ${target.url}${target.upstream ? ` and set upstream to ${target.remote}/${target.branch}` : ''}.`, 'success');
  }
  if (sub === 'status') {
    if (args.length && !(args.length === 1 && ['-s', '--short'].includes(args[0]))) throw new Error('Use git status or git status --short.');
    if (args.length) { const matrix = await git.statusMatrix(opts); const lines = matrix.flatMap(([name, h, w, st]) => { if (h === w && h === st) return []; if (h === 0 && st === 0 && w !== 0) return [`?? ${name}`]; const x = h === st ? ' ' : st === 0 ? 'D' : h === 0 ? 'A' : 'M'; const y = w === st ? ' ' : w === 0 ? 'D' : 'M'; return [`${x}${y} ${name}`]; }); return print(lines.join('\n')); }
    const branch = await git.currentBranch({ ...opts, fullname: false }); const matrix = await git.statusMatrix(opts); const staged = [], changes = [], untracked = [];
    for (const [name,h,w,s] of matrix) { if (h !== s) staged.push(`  ${s === 0 ? 'deleted' : h === 0 ? 'new file' : 'modified'}: ${name}`); if (w !== s) (h === 0 && s === 0 ? untracked : changes).push(`  ${w === 0 ? 'deleted: ' : ''}${name}`); }
    let text = `On branch ${branch || '(detached HEAD)'}`;
    if (staged.length) text += `\n\nChanges to be committed:\n${staged.join('\n')}`;
    if (changes.length) text += `\n\nChanges not staged for commit:\n${changes.join('\n')}`;
    if (untracked.length) text += `\n\nUntracked files:\n${untracked.join('\n')}`;
    if (!staged.length && !changes.length && !untracked.length) text += '\n\nnothing to commit, working tree clean';
    return print(text);
  }
  if (sub === 'add') {
    if (!args.length) throw new Error('Specify a file or use git add .');
    const matrix = await git.statusMatrix(opts); let count = 0;
    for (const arg of args) { const target = resolve(arg); if (target !== repo && !target.startsWith(repo + '/')) throw new Error('Path is outside the repository.'); const relative = target === repo ? '' : target.slice(repo.length + 1); const matches = matrix.filter(([name]) => !relative || name === relative || name.startsWith(relative + '/')); if (!matches.length && relative) throw new Error(`Path did not match any files: ${arg}`); for (const [filepath,,workdir] of matches) { if (workdir === 0) await git.remove({ ...opts, filepath }); else await git.add({ ...opts, filepath }); count++; } }
    return print(`Staged ${count} ${count === 1 ? 'file' : 'files'}.`, 'success');
  }
  if (sub === 'ls-files') { if (args.length) throw new Error('Use git ls-files without options.'); return print((await git.listFiles(opts)).join('\n') || '(no tracked files)'); }
  if (sub === 'config') { if (args.length === 2 && args[0] === '--get' && ['user.name', 'user.email'].includes(args[1])) { const value = await git.getConfig({ ...opts, path: args[1] }) || stored(args[1] === 'user.name' ? 'name' : 'email'); return print(value || '(not set)'); } if (!['user.name','user.email'].includes(args[0]) || !args[1]) throw new Error('Use git config user.name "Your Name" or git config user.email "you@example.com".'); const value = args.slice(1).join(' '); await git.setConfig({ ...opts, path: args[0], value }); try { localStorage.setItem(storageKeys[args[0] === 'user.name' ? 'name' : 'email'], value); } catch {} return print(`Set ${args[0]}.`, 'success'); }
  if (sub === 'commit') { const i = args.indexOf('-m'), message = args[i + 1]; if (i < 0 || !message) throw new Error('Use git commit -m "Your message".'); const { name, email } = await identity(opts); if (!name || !email) throw new Error('Set your identity in Settings or with git config user.name "Your Name" and git config user.email "you@example.com".'); const matrix = await git.statusMatrix(opts); if (!matrix.some(([,h,,s]) => h !== s)) throw new Error('Nothing staged to commit. Use git add first.'); const oid = await git.commit({ ...opts, author: { name, email }, message }); return print(`[${(await git.currentBranch({ ...opts, fullname: false })) || 'HEAD'} ${oid.slice(0, 7)}] ${message}`, 'success'); }
  if (sub === 'log') { let depth = 20, oneline = false; for (let i = 0; i < args.length; i++) { if (args[i] === '--oneline') oneline = true; else if (args[i] === '-n' && /^\d+$/.test(args[i + 1] || '')) depth = Number(args[++i]); else throw new Error('Use git log [--oneline] [-n N].'); } if (depth < 1 || depth > 1000) throw new Error('Log count must be between 1 and 1000.'); const commits = await git.log({ ...opts, depth }); return print(commits.map(({oid,commit}) => oneline ? `${oid.slice(0, 7)} ${commit.message.trim().split('\n')[0]}` : `commit ${oid}\nAuthor: ${commit.author.name} <${commit.author.email}>\nDate:   ${new Date(commit.author.timestamp * 1000).toLocaleString()}\n\n    ${commit.message.trim()}\n`).join('\n')); }
  if (sub === 'branch') { if (args[0] === '-M' || args[0] === '-m') { if (args.length !== 2 || args[1].startsWith('-')) throw new Error('Use git branch -M <new-name>.'); const current = await git.currentBranch({ ...opts, fullname: false }); if (!current) throw new Error('Cannot rename a detached HEAD.'); if (current === args[1]) return print(`Already on branch ${current}.`); if ((await git.listBranches(opts)).includes(args[1])) throw new Error('A branch with that name exists. Wgit will not overwrite it.'); if (await git.getConfig({ ...opts, path: `branch.${current}.remote` })) throw new Error('Renaming branches with upstream settings is not supported yet.'); await git.renameBranch({ ...opts, oldref: current, ref: args[1] }); return print(`Renamed branch ${current} to ${args[1]}.`, 'success'); } if (args[0]?.startsWith('-') || args.length > 1) throw new Error('Unsupported branch option. Use git branch, git branch <name>, or git branch -M <name>.'); if (args[0]) { await git.branch({ ...opts, ref: args[0] }); return print(`Created branch ${args[0]}.`, 'success'); } const current = await git.currentBranch({ ...opts, fullname: false }); const branches = await git.listBranches(opts); return print(branches.map(b => `${b === current ? '*' : ' '} ${b}`).join('\n') || `* ${current || 'main'} (no commits yet)`); }
  if (sub === 'switch' || sub === 'checkout') { const create = args[0] === '-c' && sub === 'switch' || args[0] === '-b' && sub === 'checkout'; const branch = create ? args[1] : args[0]; if (!branch || args.length !== (create ? 2 : 1) || branch.startsWith('-')) throw new Error('Use git switch <branch> or git switch -c <branch>.'); const matrix = await git.statusMatrix(opts); if (matrix.some(([,h,w,s]) => h !== w || h !== s)) throw new Error('Working tree has changes. Commit or remove them before switching branches.'); if (create) await git.branch({ ...opts, ref: branch }); try { await git.checkout({ ...opts, ref: branch }); } catch (error) { if (create) throw new Error(`Branch ${branch} was created, but checkout failed. Inspect the working tree before retrying.`); throw error; } return print(`Switched to ${create ? 'new ' : ''}branch '${branch}'`, 'success'); }
  print(`Git command not supported yet: ${sub || '(none)'}. Type help to see available commands.`, 'error');
}
$('#terminal-form').addEventListener('submit', async e => { e.preventDefault(); const line = input.value.trim(); if (!line || busy) return; if (/https?:\/\/[^\s/]*@/i.test(line) || /https?:\/\/[^\s]*[?#]/i.test(line)) { input.value = ''; print('Do not put credentials in a URL or terminal command. Use the secure push dialog instead.', 'error'); return; } history.push(line); historyIndex = history.length; print(`➜  ${fs ? displayPath(cwd) : '~'}  ${line}`, 'entered'); input.value = ''; busy = true; input.disabled = true; try { await command(line); } catch (err) { print(`Error: ${err.message || err}`, 'error'); } finally { try { await refresh(); } catch {} busy = false; input.disabled = false; input.focus(); body.scrollTop = body.scrollHeight; } });
