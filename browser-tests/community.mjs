import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.WGit_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const posts = []; let lastBody; let rejectNext = false; let nextId = 1; let reads = 0;
const newId = () => `${String(nextId++).padStart(8, '0')}-1234-4234-8234-123456789abc`;
await context.route('**/api/community-country', route => route.fulfill({ json: { country: 'SE' } }));
await context.route('https://github.com/*.png?*', route => route.fulfill({ status: 404 }));
await context.route('**/functions/v1/community**', async route => {
  const req = route.request(); const url = new URL(req.url());
  if (req.method() === 'POST') {
    lastBody = req.postDataJSON(); if (rejectNext) { rejectNext = false; return route.fulfill({ status: 429, json: { error: 'Please wait one minute between messages.' } }); }
    const post = { id: newId(), parent_id: lastBody.parent, title: lastBody.parent ? null : lastBody.title, body: lastBody.body, author: lastBody.name || 'guest - sweden', github_username: lastBody.github, created_at: new Date().toISOString(), owner_hash: lastBody.owner_hash };
    posts.push(post); const {owner_hash, ...publicPost} = post; return route.fulfill({ status: 201, json: publicPost });
  }
  if (req.method() === 'DELETE') {
    const data = req.postDataJSON(), post = posts.find(p => p.id === data.id);
    const valid = post && createHash('sha256').update(data.token).digest('hex') === post.owner_hash;
    if (!valid) return route.fulfill({ status: 403, json: { error: 'Not yours.' } });
    if (!post.parent_id) { const deleted = new Set([post.id]); let changed = true; while (changed) { changed = false; for (const p of posts) if (deleted.has(p.parent_id) && !deleted.has(p.id)) { deleted.add(p.id); changed = true; } } for (let i = posts.length - 1; i >= 0; i--) if (deleted.has(posts[i].id)) posts.splice(i, 1); }
    else { post.deleted = true; post.body = '[deleted]'; post.author = '[deleted]'; post.github_username = null; }
    return route.fulfill({ json: { deleted: true } });
  }
  reads++; const offset = Number(url.searchParams.get('offset') || 0);
  return route.fulfill({ json: posts.slice(offset, offset + 100).map(({owner_hash, ...post}) => post) });
});
try {
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => !!sessionStorage.getItem('wgit.community.cache.v2'));
  assert.ok(reads > 0, 'workspace preloads community');
  await page.getByRole('link', { name: 'Community' }).click(); await page.waitForURL('**/community');
  await page.getByText('No discussions yet').waitFor();
  await page.locator('#new-discussion').click(); await page.waitForURL('**/community/new');
  await page.getByText('Posting as guest - sweden · public').waitFor();
  await page.locator('#post-title').fill('Add branching <script>'); await page.locator('#post-body').fill('Please add a <b>feature</b>');
  await page.locator('#submit-post').click(); await page.waitForURL(/\/community\/add-branching-script--[0-9a-f-]+$/);
  const discussionUrl = page.url(), rootId = posts[0].id;
  assert.equal(lastBody.country, 'SE'); assert.equal(lastBody.name, ''); assert.match(lastBody.owner_hash, /^[a-f0-9]{64}$/);
  assert.equal(await page.locator('.post-body b').count(), 0); assert.match(await page.locator('.post-body').first().textContent(), /<b>feature<\/b>/);
  assert.equal(await page.locator('.post-card').first().locator('.author-name').count(), 0);
  await page.locator('.post-card').first().getByRole('button', { name: 'Reply' }).click(); await page.waitForURL(`**/reply/${rootId}`);
  await page.locator('#post-body').fill('Good idea'); rejectNext = true; await page.locator('#submit-post').click();
  await page.getByText('Please wait one minute between messages.').waitFor(); assert.equal(await page.locator('#post-body').inputValue(), 'Good idea');
  await page.locator('#submit-post').click(); await page.getByText('Good idea', { exact: true }).waitFor(); assert.equal(lastBody.parent, rootId);
  const replyId = posts[1].id; await page.locator(`#comment-${replyId}`).getByRole('button', { name: 'Reply' }).click(); await page.waitForURL(`**/reply/${replyId}`);
  await page.locator('#post-body').fill('Nested reply'); await page.locator('#submit-post').click(); await page.getByText('Nested reply', { exact: true }).waitFor(); assert.equal(lastBody.parent, replyId);
  await page.reload(); await page.getByText('Nested reply', { exact: true }).waitFor(); assert.equal(page.url(), discussionUrl);
  const nestedId = posts[2].id; await page.locator(`#comment-${nestedId} a.post-action`).click(); assert.match(page.url(), new RegExp(`#comment-${nestedId}$`)); await page.reload(); await page.getByText('Nested reply', { exact: true }).waitFor();
  page.on('dialog', dialog => dialog.accept());
  await page.locator(`#comment-${replyId}`).getByRole('button', { name: 'Delete' }).click();
  await page.getByText('[deleted]', { exact: true }).first().waitFor(); await page.getByText('Nested reply', { exact: true }).waitFor();
  const other = await context.newPage(); await other.goto(discussionUrl); await other.getByText('Nested reply', { exact: true }).waitFor();
  // Deletion keys are scoped to the browser profile, not a visible display name.
  const separate = await browser.newContext(); const visitor = await separate.newPage();
  await visitor.route('**/functions/v1/community**', route => route.fulfill({json: posts.map(({owner_hash,...post}) => post)}));
  await visitor.goto(discussionUrl); await visitor.getByText('Nested reply', { exact: true }).waitFor(); assert.equal(await visitor.locator('.delete-post').count(), 0); await separate.close(); await other.close();
  await page.locator('#theme-toggle').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('.post-card').first().getByRole('button', { name: 'Delete' }).click(); await page.waitForURL('**/community'); await page.getByText('No discussions yet').waitFor();
  await page.goto('http://localhost:4173/settings'); assert.equal(await page.locator('#settings-dialog').isVisible(), true);
  await page.locator('#settings-name').fill('Buffer'); await page.locator('#settings-email').fill('bad@example.com'); await page.locator('#settings-form button[type=submit]').click();
  assert.match(await page.locator('#settings-error').textContent(), /username@github.com/); assert.equal(page.url(), 'http://localhost:4173/settings');
  await page.locator('#settings-email').fill('BufferClick@github.com'); await page.locator('#settings-form button[type=submit]').click();
  await page.getByRole('link', { name: 'Community' }).click(); await page.locator('#new-discussion').click();
  await page.locator('#post-title').fill('Profile'); await page.locator('#post-body').fill('Profile test'); await page.locator('#submit-post').click();
  await page.locator('.post-card .author-name').waitFor(); assert.equal(await page.locator('.post-card .author-name').getAttribute('href'), 'https://github.com/BufferClick');
  assert.equal(await page.locator('.post-card .author-avatar').getAttribute('href'), 'https://github.com/BufferClick');
  assert.equal(await page.locator('.post-card .author-avatar img').getAttribute('src'), 'https://github.com/BufferClick.png?size=64');
  assert.deepEqual(errors, []); console.log('Community browser checks passed.');
} finally { await browser.close(); }
