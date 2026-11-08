// Run against a built site: npm run build && npm run preview
// Then WGit_CHROME_PATH=/path/to/chromium npm run test:browser
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executablePath = process.env.WGit_CHROME_PATH;
if (!executablePath) throw new Error('Set WGit_CHROME_PATH to a Chromium executable.');
const gitRoot = mkdtempSync(join(tmpdir(), 'wgit-http-test-'));
mkdirSync(join(gitRoot, 'acme'));
const remoteDir = join(gitRoot, 'acme', 'project.git');
execFileSync('git', ['init', '--bare', '--initial-branch=main', remoteDir]);
const seed = join(gitRoot, 'seed'); mkdirSync(seed);
const run = (...args) => execFileSync('git', ['-C', seed, ...args], { stdio: 'ignore' });
run('init', '-b', 'main'); run('config', 'user.name', 'Remote'); run('config', 'user.email', 'remote@example.com');
writeFileSync(join(seed, 'README.md'), 'Remote README\n'); writeFileSync(join(seed, 'remote-only.txt'), 'Remote data\n');
run('add', '.'); run('commit', '-m', 'Remote initial'); run('push', remoteDir, 'main');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.WGit_URL || 'http://localhost:4173/');
  assert.match(await page.locator('.version-badge').textContent(), /v0\.0\.8/);
  assert.equal(await page.title(), 'Wgit');
  assert.ok((await page.locator('link[rel=icon]').getAttribute('href')).includes('favicon'));
  assert.match(await page.locator('footer').textContent(), /Made by Buffer/);
  assert.equal(await page.locator('.green-dot').count(), 0);
  assert.deepEqual(await page.locator('.top-right').locator(':scope > *').evaluateAll(nodes => nodes.map(n => n.className)), ['open-source', 'theme-button', 'settings-button', 'github-top']);
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-label'), 'Switch to light mode');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(13, 17, 23)');
  const themePage = await context.newPage(); await themePage.goto(process.env.WGit_URL || 'http://localhost:4173/');
  assert.equal(await themePage.locator('html').getAttribute('data-theme'), 'dark');
  await themePage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await themePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await themePage.locator('#theme-toggle').isVisible(), true);
  await themePage.close();
  await page.locator('#theme-toggle').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.locator('#theme-toggle').click();
  assert.match(await page.locator('.about').textContent(), /Web-Git/);
  assert.equal(await page.locator('.workspace-label h1').textContent(), 'Browser-based Git workspace');
  assert.equal(await page.getByText('Git, right where you are').count(), 0);
  assert.equal(await page.getByText('Made for builders').count(), 0);
  assert.equal(await page.locator('.workspace-label img').evaluate(img => img.complete && img.naturalWidth > 0), true);
  // Use a real browser filesystem handle from OPFS in place of the interactive
  // directory picker. This exercises nativeFS and browser Git, not Node globals.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const project = await root.getDirectoryHandle('project', { create: true });
    for (const [name, data] of [['README.md', 'Hello from Web-Git\n'], ['game.wasm', new Uint8Array([0, 97, 115, 109, 0, 1, 2])]]) {
      const file = await project.getFileHandle(name, { create: true });
      const writable = await file.createWritable(); await writable.write(data); await writable.close();
    }
    window.showDirectoryPicker = async () => project;
  });
  await page.locator('#open-folder').click();
  await page.waitForFunction(() => document.querySelector('#side-folder').textContent === 'project');
  async function command(text, expected) {
    const input = page.locator('#command-input');
    const lines = page.locator('#terminal-output .output-line');
    const previousCount = await lines.count();
    await input.fill(text); await input.press('Enter');
    await page.waitForFunction(count => document.querySelectorAll('#terminal-output .output-line').length >= count + 2 && !document.querySelector('#command-input').disabled, previousCount);
    const result = await lines.last().textContent();
    assert.match(result, expected, `${text}: ${result}`);
    assert.doesNotMatch(result, /Buffer is not defined|^Error:/);
  }
  await command('cat README.md', /README\.md.*Hello from Web-Git/s);
  assert.equal(await page.locator('.file-output-content').last().textContent(), 'Hello from Web-Git\n');
  const catInput = page.locator('#command-input');
  await catInput.fill('cat game.wasm'); await catInput.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /binary/);
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(), project = await root.getDirectoryHandle('project'), file = await project.getFileHandle('malicious.txt', { create: true }), writer = await file.createWritable(); await writer.write('<img src=x onerror=alert(1)>'); await writer.close(); });
  await command('cat malicious.txt', /<img src=x onerror=alert\(1\)>/);
  assert.equal(await page.locator('.file-output-content img').count(), 0);
  await page.evaluate(async () => { const root = await navigator.storage.getDirectory(), project = await root.getDirectoryHandle('project'); await project.removeEntry('malicious.txt'); });
  await command('git init', /Initialized empty Git repository/);
  await command('git status', /README\.md[\s\S]*game\.wasm/);
  await page.locator('#open-settings').click();
  await page.locator('#settings-name').fill('Buffer'); await page.locator('#settings-email').fill('bufferclick@github.com');
  await page.locator('#settings-form button[type=submit]').click();
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#settings-name').inputValue(), 'Buffer');
  assert.equal(await page.locator('#settings-email').inputValue(), 'bufferclick@github.com');
  await page.locator('#cancel-settings').click();
  await command('git add .', /Staged 2 files/);
  await command('git commit -m "First commit"', /First commit/);
  await command('git status', /working tree clean/);
  await command('git ls-files', /README\.md[\s\S]*game\.wasm/);
  await command('git config --get user.name', /^Buffer$/);
  await command('git log --oneline -n 1', /First commit/);
  await command('git branch -M main', /Already on branch main/);
  assert.ok(!(await page.locator('#terminal-output').textContent()).includes('Created branch -M'));
  // Run real Git smart HTTP against a local bare repo while substituting only
  // the GitHub network endpoint. Authentication is a harmless test value.
  await page.route('**/api/git/github.com/acme/project.git/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const body = request.postDataBuffer() || Buffer.alloc(0);
    const result = spawnSync('git', ['http-backend'], { input: body, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_PROJECT_ROOT: gitRoot, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname.replace('/api/git/github.com', ''), QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method(), CONTENT_TYPE: request.headers()['content-type'] || '', CONTENT_LENGTH: String(body.length), REMOTE_USER: 'test', SERVER_PROTOCOL: 'HTTP/1.1' } });
    if (result.status !== 0) throw new Error(result.stderr.toString());
    let split = result.stdout.indexOf('\r\n\r\n'), separator = 4;
    if (split < 0) { split = result.stdout.indexOf('\n\n'); separator = 2; }
    assert.ok(split >= 0, 'git http-backend returned headers');
    const lines = result.stdout.subarray(0, split).toString().split(/\r?\n/);
    const headers = {}; let status = 200;
    for (const line of lines) { const i = line.indexOf(':'); if (i < 0) continue; const name = line.slice(0, i).toLowerCase(), value = line.slice(i + 1).trim(); if (name === 'status') status = parseInt(value, 10); else headers[name] = value; }
    await route.fulfill({ status, headers, body: result.stdout.subarray(split + separator) });
  });
  await command('git remote add origin https://github.com/acme/project.git', /Added remote origin/);
  await command('git remote -v', /github.com\/acme\/project.git/);
  const input = page.locator('#command-input');
  await input.fill('git push -u origin main'); await input.press('Enter');
  await page.locator('#push-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#push-target').textContent(), /github.com\/acme\/project.git/);
  await page.locator('#github-token').fill('dummy-test-token');
  await page.locator('#push-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /Push rejected.*git sync origin main/);
  assert.equal(await page.locator('#github-token').inputValue(), '');
  await page.locator('#open-settings').click();
  await page.locator('#settings-token').fill('dummy-test-token');
  assert.equal(await page.locator('#settings-token').getAttribute('type'), 'password');
  await page.locator('#settings-form button[type=submit]').click();
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#settings-token').inputValue(), '');
  assert.match(await page.locator('#token-status').textContent(), /token is saved/);
  await page.locator('#cancel-settings').click();
  const secondPage = await context.newPage();
  await secondPage.goto(process.env.WGit_URL || 'http://localhost:4173/');
  await secondPage.locator('#open-settings').click();
  assert.equal(await secondPage.locator('#settings-name').inputValue(), 'Buffer');
  assert.equal(await secondPage.locator('#settings-token').inputValue(), '');
  assert.match(await secondPage.locator('#token-status').textContent(), /token is saved/);
  await secondPage.close();
  await input.fill('git sync origin main'); await input.press('Enter');
  await page.locator('#conflict-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#conflict-path').textContent(), 'README.md');
  assert.match(await page.locator('#conflict-explanation').textContent(), /replace the version on GitHub after a successful push/);
  assert.match(await page.locator('#keep-local').textContent(), /Use my local file/);
  await page.locator('#keep-local').click();
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /Synced origin\/main/);
  await command('git status', /working tree clean/);
  await command('git push -u origin main', /Pushed main.*set upstream/);
  assert.equal(execFileSync('git', ['--git-dir', remoteDir, 'show', 'main:README.md'], { encoding: 'utf8' }), 'Hello from Web-Git\n');
  assert.equal(execFileSync('git', ['--git-dir', remoteDir, 'show', 'main:remote-only.txt'], { encoding: 'utf8' }), 'Remote data\n');
  assert.ok(!(await page.locator('#terminal-output').textContent()).includes('dummy-test-token'));
  const storedConfig = await page.evaluate(async () => { const root = await navigator.storage.getDirectory(), project = await root.getDirectoryHandle('project'), gitdir = await project.getDirectoryHandle('.git'), config = await gitdir.getFileHandle('config'); return (await config.getFile()).text(); });
  assert.ok(!storedConfig.includes('dummy-test-token'));
  assert.match(storedConfig, /remote = origin/);
  assert.deepEqual(execFileSync('git', ['--git-dir', remoteDir, 'show', 'main:game.wasm']), Buffer.from([0, 97, 115, 109, 0, 1, 2]));
  await page.locator('#open-settings').click(); await page.locator('#clear-saved-token').click(); await page.locator('#cancel-settings').click();
  await input.fill('git push'); await input.press('Enter');
  await page.locator('#push-dialog').waitFor({ state: 'visible' });
  await page.locator('#cancel-push').click();
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /Push cancelled/);
  assert.equal(await page.locator('#github-token').inputValue(), '');
  await page.locator('#fullscreen-terminal').click();
  assert.equal(await page.locator('.terminal.expanded').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.terminal.expanded').count(), 0);
  await command('git log', /First commit/);
  await command('git branch feature', /Created branch feature/);
  await command('git switch feature', /Switched to branch/);
  await command('git --version', /Wgit v0\.0\.8/);

  // A real pointer drag selects terminal output, copies it and leaves it selected.
  const versionLine = page.locator('#terminal-output .output-line').last();
  await versionLine.scrollIntoViewIfNeeded();
  const box = await versionLine.boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 85, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#copy-state').textContent === 'Copied');
  assert.ok((await page.evaluate(() => window.getSelection().toString())).length > 0);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.evaluate(() => window.getSelection().toString()));

  // A known selection is copied exactly, without being cleared.
  await page.evaluate(() => {
    const node = [...document.querySelectorAll('#terminal-output .output-line')].find(line => line.textContent.includes('Initialized empty Git repository')).firstChild;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 11);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('#terminal-body').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#copy-state').textContent === 'Copied');
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Initialized');
  assert.equal(await page.evaluate(() => window.getSelection().toString()), 'Initialized');
  // Do not claim success when browser clipboard access is denied.
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new Error('denied'); };
    document.execCommand = () => false;
    document.querySelector('#terminal-body').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#copy-state').textContent.includes('Copy blocked'));
  // Verify the browser-storage demo also supports a complete Git workflow.
  await page.locator('#try-demo').click();
  await page.waitForFunction(() => document.querySelector('#side-folder').textContent === 'demo-project');
  await command('git init', /Initialized empty Git repository/);
  await command('git status --short', /\?\? README\.md/);
  await command('git remote add origin https://github.com/acme/project.git', /Added remote origin/);
  await input.fill('wgit push demo-shortcut'); await input.press('Enter');
  await page.locator('#push-dialog').waitFor({ state: 'visible' });
  await page.locator('#github-token').fill('dummy-test-token');
  await page.locator('#push-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /Pushed main.*demo-shortcut/);
  assert.equal(execFileSync('git', ['--git-dir', remoteDir, 'show', 'demo-shortcut:README.md'], { encoding: 'utf8' }), '# My project\n\nHello from Wgit!\n');
  // The shortcut also handles an existing unrelated branch and prompts for conflicts.
  await input.fill('wgit push main'); await input.press('Enter');
  await page.locator('#push-dialog').waitFor({ state: 'visible' });
  await page.locator('#github-token').fill('dummy-test-token');
  await page.locator('#push-form button[type=submit]').click();
  await page.locator('#conflict-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#conflict-path').textContent(), 'README.md');
  await page.locator('#keep-local').click();
  await page.waitForFunction(() => !document.querySelector('#command-input').disabled);
  assert.match(await page.locator('#terminal-output .output-line').last().textContent(), /branch main after syncing/);
  assert.equal(execFileSync('git', ['--git-dir', remoteDir, 'show', 'main:README.md'], { encoding: 'utf8' }), '# My project\n\nHello from Wgit!\n');
  assert.equal(execFileSync('git', ['--git-dir', remoteDir, 'show', 'main:remote-only.txt'], { encoding: 'utf8' }), 'Remote data\n');
  await command('git log', /Author: Buffer <bufferclick@github.com>/);
  await command('git status', /working tree clean/);
  await command('git switch -c another', /Switched to new branch/);
  assert.deepEqual(errors, []);
  console.log('Browser workflow and clipboard checks passed.');
} finally { await browser.close(); rmSync(gitRoot, { recursive: true, force: true }); }
