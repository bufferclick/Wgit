import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.WGit_CHROME_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await context.newPage();
const posts = []; let lastBody; let rejectNext = false;
const id = '12345678-1234-4234-8234-123456789abc';
await page.route('**/api/community-country', route => route.fulfill({ json: { country: 'SE' } }));
await page.route('**/functions/v1/community**', async route => {
  const req = route.request(); const url = new URL(req.url());
  if (req.method() === 'POST') { lastBody = req.postDataJSON(); if (rejectNext) { rejectNext = false; return route.fulfill({ status: 429, json: { error: 'Please wait one minute between messages.' } }); } const post = { id: lastBody.parent ? '22345678-1234-4234-8234-123456789abc' : id, parent_id: lastBody.parent, title: lastBody.title, body: lastBody.body, author: lastBody.name || 'guest - sweden', created_at: new Date().toISOString() }; posts.push(post); return route.fulfill({ status: 201, json: post }); }
  return route.fulfill({ json: posts.filter(post => post.parent_id === url.searchParams.get('thread')) });
});
try {
  await page.goto('http://localhost:4173/');
  await page.getByRole('link', { name: 'Community' }).click();
  await page.waitForURL('**/community');
  await page.getByText('No discussions yet').waitFor();
  await page.locator('#new-discussion').click();
  await page.getByText('Posting as guest - sweden · public').waitFor();
  await page.locator('#post-title').fill('Add branching <script>');
  await page.locator('#post-body').fill('Please add a <b>feature</b>');
  await page.locator('#submit-post').click();
  await page.getByRole('button', { name: /Add branching/ }).waitFor();
  assert.equal(lastBody.country, 'SE'); assert.equal(lastBody.name, '');
  assert.equal(await page.locator('#discussion-list script').count(), 0);
  await page.getByRole('button', { name: /Add branching/ }).click();
  assert.equal(await page.locator('.post-body b').count(), 0);
  assert.match(await page.locator('.post-body').first().textContent(), /<b>feature<\/b>/);
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.locator('#post-body').fill('Good idea');
  rejectNext = true; await page.locator('#submit-post').click();
  await page.getByText('Please wait one minute between messages.').waitFor();
  assert.equal(await page.locator('#post-body').inputValue(), 'Good idea');
  await page.locator('#submit-post').click(); await page.getByText('Good idea', { exact: true }).waitFor();
  assert.equal(lastBody.parent, id);
  await page.locator('#theme-toggle').click(); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(() => localStorage.setItem('wgit.name', 'Buffer'));
  await page.reload(); await page.locator('#new-discussion').click();
  assert.equal(await page.locator('#posting-as').textContent(), 'Posting as Buffer · public');
  console.log('Community browser checks passed.');
} finally { await browser.close(); }
