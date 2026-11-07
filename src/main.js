import * as git from 'isomorphic-git';
import LightningFS from '@isomorphic-git/lightning-fs';
import { createIcons, GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, CircleDot, Terminal, FolderOpen, ShieldCheck, Trash2, Command, CheckCheck, Lightbulb, ArrowRight, Link, Folder, ArrowUpLeft, Heart } from 'lucide';
const icons = { GitBranch, Github, ArrowUpRight, BookMarked, CodeXml, CircleDot, Terminal, FolderOpen, ShieldCheck, Trash2, Command, CheckCheck, Lightbulb, ArrowRight, Link, Folder, ArrowUpLeft, Heart };
import { nativeFS } from './native-fs.js';
import { repositoryState, initRepository, incompleteMessage } from './repository.js';
import './style.css';

const icon = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
document.querySelector('#app').innerHTML = `
<header class="topbar">
  <div class="top-left"><a class="brand-mark" href="#" aria-label="Wgit home">${icon('git-branch')}</a><span class="top-divider"></span><span class="top-product">Wgit</span><span class="top-slash">/</span><span class="top-context">workspace</span></div>
  <div class="top-right"><span class="open-source"><span class="green-dot"></span> Open source &amp; free</span><a class="github-top" href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">${icon('github')} <span>View on GitHub</span> ${icon('arrow-up-right', 'external')}</a></div>
</header>
<div class="repo-head"><div class="repo-title"><div class="repo-icon">${icon('book-marked')}</div><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">bufferclick</a><span class="slash">/</span><strong>Wgit</strong><span class="public-pill">Public</span></div></div>
<nav class="tabs" aria-label="Project navigation"><div class="tabs-inner"><a class="tab active" href="#workspace">${icon('code-xml')} Workspace</a></div></nav>
<main id="workspace" class="layout">
  <section class="main-column">
    <div class="intro"><div><div class="eyebrow"><span class="sparkle">✳</span> YOUR BROWSER-BASED GIT WORKSPACE</div><h1>Git, right where you are<span class="green-period">.</span></h1><p>Your projects. Your commands. No setup required.</p></div><div class="intro-art" aria-hidden="true"><span class="art-box">${icon('terminal')}</span><span class="art-line"></span><span class="art-box art-git">${icon('git-branch')}</span></div></div>
    <div class="workspace-heading"><div><h2>Workspace <span class="heading-badge">BETA</span></h2><p>Everything you need to get going.</p></div><span class="secure-label">${icon('shield-check')} Runs in your browser</span></div>
    <div class="panel folder-panel"><div class="folder-illustration">${icon('folder-open')}</div><div class="folder-copy"><div class="folder-title" id="folder-title">Open a project folder</div><div class="folder-description" id="folder-description">Choose a local folder to start using Git, right from your browser.</div></div><button class="button primary" id="open-folder">${icon('folder-open')} Open folder</button></div>
    <div class="terminal panel"><div class="terminal-top"><div class="terminal-title">${icon('terminal')} <strong>Terminal</strong><span class="terminal-divider"></span><span>bash</span></div><div class="terminal-actions"><span id="terminal-state"><span class="status-dot"></span> Ready</span><button id="clear-terminal" class="icon-button" title="Clear terminal" aria-label="Clear terminal">${icon('trash-2')}</button></div></div><div class="terminal-body" id="terminal-body"><div class="terminal-welcome"><div><span class="welcome-green">➜</span> Welcome to Wgit <span class="welcome-muted">— Git without leaving your browser.</span></div><div class="terminal-hint">Open a folder to get started, or type <span>help</span> to see available commands.</div></div><div id="terminal-output" aria-live="polite"></div><form id="terminal-form" autocomplete="off"><label for="command-input" class="prompt"><span>➜</span> <span class="prompt-path" id="prompt-path">~</span></label><input id="command-input" aria-label="Terminal command" spellcheck="false" placeholder="Type a command..." /></form></div><div class="terminal-bottom"><span>${icon('command')} Command line</span><span>Type <kbd>help</kbd> for a list of commands</span></div></div>
    <div class="quick-heading"><div><h2>New around here?</h2><p>Get from zero to version control in a few steps.</p></div><span>THE BASICS</span></div>
    <div class="steps"><div class="step"><span class="step-num">01</span><div class="step-icon">${icon('folder-open')}</div><h3>Open your folder</h3><p>Choose a project folder from your computer.</p></div><div class="step"><span class="step-num">02</span><div class="step-icon">${icon('git-branch')}</div><h3>Initialize Git</h3><p>Run <code>git init</code> to create a new repository.</p></div><div class="step"><span class="step-num">03</span><div class="step-icon">${icon('check-check')}</div><h3>Make your first commit</h3><p>Stage your files and commit your changes.</p></div></div>
    <div class="tip">${icon('lightbulb')} <span><strong>Just looking around?</strong> Try a <button id="try-demo">demo workspace</button> first. No files on your computer will be changed.</span> ${icon('arrow-right', 'tip-arrow')}</div>
  </section>
  <aside class="sidebar"><div class="about"><h2>About Wgit</h2><p>A lightweight Git workspace that lives in your browser. Built for the projects and ideas you want to keep moving.</p><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">${icon('link')} github.com/bufferclick/Wgit</a><div class="tags"><span>git</span><span>browser</span><span>open-source</span></div></div><div class="side-section"><h3>YOUR WORKSPACE</h3><div class="side-status"><div class="side-icon">${icon('folder')}</div><div><strong id="side-folder">No folder selected</strong><p id="side-detail">Open a folder to get started</p></div></div><div class="side-meta"><span>${icon('git-branch')} Branch</span><strong id="branch-label">—</strong></div><div class="side-meta"><span>${icon('circle-dot')} Status</span><strong id="status-label">Not connected</strong></div></div><div class="side-section commands"><div class="side-heading"><h3>QUICK COMMANDS</h3><span>Click to insert</span></div><button data-command="git init"><code>git init</code>${icon('arrow-up-left')}</button><button data-command="git status"><code>git status</code>${icon('arrow-up-left')}</button><button data-command="git add ."><code>git add .</code>${icon('arrow-up-left')}</button><button data-command="git commit -m &quot;First commit&quot;"><code>git commit -m "..."</code>${icon('arrow-up-left')}</button><button data-command="git log"><code>git log</code>${icon('arrow-up-left')}</button></div><div class="help-card"><div class="help-icon">${icon('heart')}</div><div><strong>Made for builders</strong><p>Wgit is open source and always will be.</p><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">View on GitHub ${icon('arrow-right')}</a></div></div></aside>
</main><footer><div><span class="footer-logo">${icon('git-branch')}</span> <strong>Wgit</strong><span>© 2026 Wgit contributors</span></div><div><span>Built for the open web</span><span class="footer-dot">·</span><a href="https://github.com/bufferclick/Wgit" target="_blank" rel="noopener noreferrer">GitHub ${icon('arrow-up-right')}</a></div></footer>`;
createIcons({ icons });

const $ = s => document.querySelector(s);
const input = $('#command-input'), output = $('#terminal-output'), body = $('#terminal-body');
let fs = null, cwd = '/workspace', rootName = '', repo = null, history = [], historyIndex = 0, busy = false;
const pfs = () => fs.promises;
const clean = path => { const result = []; for (const part of path.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (result.length > 1) result.pop(); } else result.push(part); } return '/' + result.join('/'); };
const resolve = path => clean(path?.startsWith('/') ? path : `${cwd}/${path || ''}`);
const displayPath = path => '~/' + [rootName, ...path.split('/').slice(2)].filter(Boolean).join('/');
function print(text, type = '') { const line = document.createElement('div'); line.className = `output-line ${type}`; line.textContent = text; output.append(line); body.scrollTop = body.scrollHeight; }
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
  if (!window.showDirectoryPicker) { print('Folder access is not supported in this browser. Try a Chromium-based browser, or use the demo workspace.', 'error'); input.focus(); return; }
  try { const handle = await window.showDirectoryPicker({ mode: 'readwrite' }); await setWorkspace(nativeFS(handle), handle.name); }
  catch (e) { if (e.name !== 'AbortError') print(`Could not open folder: ${e.message}`, 'error'); }
});
$('#try-demo').addEventListener('click', async () => {
  try { const demoFS = new LightningFS('wgit-demo'); let created = false; try { await demoFS.promises.mkdir('/workspace'); created = true; } catch (e) { if (e.code !== 'EEXIST') throw e; } if (created) await demoFS.promises.writeFile('/workspace/README.md', '# My project\n\nHello from Wgit!\n'); await setWorkspace(demoFS, 'demo-project', true); }
  catch (e) { print(`Could not open demo: ${e.message}`, 'error'); }
});
$('#clear-terminal').addEventListener('click', () => { output.replaceChildren(); input.focus(); });
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.command; input.focus(); }));
$('#terminal-body').addEventListener('click', () => input.focus());
input.addEventListener('keydown', e => { if (e.key === 'ArrowUp') { e.preventDefault(); if (historyIndex > 0) input.value = history[--historyIndex]; } if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIndex < history.length) historyIndex++; input.value = history[historyIndex] || ''; } });
function tokenize(str) { const tokens = []; const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g; for (const match of str.matchAll(re)) tokens.push(match[0].replace(/"([^"]*)"|'([^']*)'/g, (_, a, b) => a ?? b)); return tokens; }
const help = `Available commands\n  pwd                     Show the current folder\n  ls                      List files and folders\n  cd <folder>             Change folder (cd .. to go back)\n  clear                   Clear terminal output\n  git init                Initialize a repository\n  git status              Show changed files\n  git add <file|.>        Stage files\n  git commit -m "message"  Commit staged changes\n  git log                 Show commit history\n  git branch [name]       List or create branches\n  git switch <branch>     Switch branches\n  git config user.name <name>\n  git config user.email <email>\n\nWgit runs Git in your browser. Remote operations and shell commands are not supported yet.`;
async function command(line) {
  const args = tokenize(line), cmd = args.shift(); if (!cmd) return;
  if (cmd === 'help') return print(help);
  if (cmd === 'clear') { output.replaceChildren(); return; }
  if (!fs) return print('Open a folder or try the demo workspace first.', 'error');
  if (cmd === 'pwd') return print(displayPath(cwd));
  if (cmd === 'ls') { const names = await pfs().readdir(cwd); return print(names.filter(n => args.includes('-a') || !n.startsWith('.')).sort().join('  ') || '(empty folder)'); }
  if (cmd === 'cd') { const target = args[0] ? resolve(args[0]) : '/workspace'; if ((target !== '/workspace' && !target.startsWith('/workspace/')) || !(await pfs().stat(target)).isDirectory()) throw new Error('Not a directory'); cwd = target; return; }
  if (cmd !== 'git') return print(`Command not supported: ${cmd}. Type help to see available commands.`, 'error');
  const sub = args.shift();
  if (sub === '--version' || sub === 'version') return print('Wgit · powered by isomorphic-git');
  if (sub === 'init') { if (args.length) throw new Error('Use cd to choose a folder before running git init.'); await initRepository(fs, cwd); return print(`Initialized empty Git repository in ${displayPath(cwd)}/.git/`, 'success'); }
  if (!repo) return print('Not a Git repository. Run git init to create one.', 'error');
  const state = await repositoryState(fs, repo);
  if (state === 'empty') throw new Error('The .git folder is empty from an incomplete initialization. Run git init to retry.');
  if (state === 'unsupported') throw new Error('This folder uses a .git file; linked worktrees are not supported by Wgit.');
  if (state !== 'ready') throw new Error(incompleteMessage);
  const opts = { fs, dir: repo };
  if (sub === 'status') {
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
  if (sub === 'config') { if (!['user.name','user.email'].includes(args[0]) || !args[1]) throw new Error('Use git config user.name "Your Name" or git config user.email "you@example.com".'); await git.setConfig({ ...opts, path: args[0], value: args.slice(1).join(' ') }); return print(`Set ${args[0]}.`, 'success'); }
  if (sub === 'commit') { const i = args.indexOf('-m'), message = args[i + 1]; if (i < 0 || !message) throw new Error('Use git commit -m "Your message".'); const name = await git.getConfig({ ...opts, path: 'user.name' }), email = await git.getConfig({ ...opts, path: 'user.email' }); if (!name || !email) throw new Error('Set your identity first with git config user.name "Your Name" and git config user.email "you@example.com".'); const matrix = await git.statusMatrix(opts); if (!matrix.some(([,h,,s]) => h !== s)) throw new Error('Nothing staged to commit. Use git add first.'); const oid = await git.commit({ ...opts, author: { name, email }, message }); return print(`[${(await git.currentBranch({ ...opts, fullname: false })) || 'HEAD'} ${oid.slice(0, 7)}] ${message}`, 'success'); }
  if (sub === 'log') { const commits = await git.log({ ...opts, depth: 20 }); return print(commits.map(({oid,commit}) => `commit ${oid}\nAuthor: ${commit.author.name} <${commit.author.email}>\nDate:   ${new Date(commit.author.timestamp * 1000).toLocaleString()}\n\n    ${commit.message.trim()}\n`).join('\n')); }
  if (sub === 'branch') { if (args[0]) { await git.branch({ ...opts, ref: args[0] }); return print(`Created branch ${args[0]}.`, 'success'); } const current = await git.currentBranch({ ...opts, fullname: false }); const branches = await git.listBranches(opts); return print(branches.map(b => `${b === current ? '*' : ' '} ${b}`).join('\n') || `* ${current || 'main'} (no commits yet)`); }
  if (sub === 'switch' || sub === 'checkout') { if (!args[0] || args.length > 1 || args[0].startsWith('-')) throw new Error('Use git switch <branch>.'); const matrix = await git.statusMatrix(opts); if (matrix.some(([,h,w,s]) => h !== w || h !== s)) throw new Error('Working tree has changes. Commit or remove them before switching branches.'); await git.checkout({ ...opts, ref: args[0] }); return print(`Switched to branch '${args[0]}'`, 'success'); }
  print(`Git command not supported yet: ${sub || '(none)'}. Type help to see available commands.`, 'error');
}
$('#terminal-form').addEventListener('submit', async e => { e.preventDefault(); const line = input.value.trim(); if (!line || busy) return; history.push(line); historyIndex = history.length; print(`➜  ${fs ? displayPath(cwd) : '~'}  ${line}`, 'entered'); input.value = ''; busy = true; input.disabled = true; try { await command(line); } catch (err) { print(`Error: ${err.message || err}`, 'error'); } finally { try { await refresh(); } catch {} busy = false; input.disabled = false; input.focus(); body.scrollTop = body.scrollHeight; } });
