// Run against a built site: npm run build && npm run preview
// Then WGit_CHROME_PATH=/path/to/chromium npm run test:browser
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const executablePath = process.env.WGit_CHROME_PATH;
if (!executablePath) throw new Error('Set WGit_CHROME_PATH to a Chromium executable.');
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext();
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.WGit_URL || 'http://localhost:4173/');
  assert.match(await page.locator('.version-badge').textContent(), /v0\.0\.2/);
  assert.match(await page.locator('.about').textContent(), /Web-Git/);
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
  await command('git init', /Initialized empty Git repository/);
  await command('git status', /README\.md[\s\S]*game\.wasm/);
  await command('git config user.name "Buffer"', /Set user.name/);
  await command('git config user.email "bufferclick@github.com"', /Set user.email/);
  await command('git add .', /Staged 2 files/);
  await command('git commit -m "First commit"', /First commit/);
  await command('git status', /working tree clean/);
  await command('git log', /First commit/);
  await command('git branch feature', /Created branch feature/);
  await command('git switch feature', /Switched to branch/);
  await command('git --version', /Wgit v0\.0\.2/);

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
  await command('git config user.name "Demo"', /Set user.name/);
  await command('git config user.email "demo@example.com"', /Set user.email/);
  await command('git add .', /Staged 1 file/);
  await command('git commit -m "Demo commit"', /Demo commit/);
  await command('git status', /working tree clean/);
  assert.deepEqual(errors, []);
  console.log('Browser workflow and clipboard checks passed.');
} finally { await browser.close(); }
