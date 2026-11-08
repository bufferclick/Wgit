import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.WGit_CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext();
await context.route('**/functions/v1/community**',r=>r.fulfill({json:new URL(r.request().url()).searchParams.get('action')==='votes'?{totals:[],mine:[]}:[]}));
try {
 const page=await context.newPage();await page.goto('http://localhost:4173');const dot=page.locator('.logs-unread-dot');await dot.waitFor();
 const second=await context.newPage();await second.goto('http://localhost:4173/community');await second.locator('.logs-unread-dot').waitFor();
 await page.getByRole('link',{name:'Logs'}).click();assert.equal(await page.locator('.logs-unread-dot').count(),0);await second.locator('.logs-unread-dot').waitFor({state:'detached'});assert.ok(await page.locator('.release-item').first().locator('.release-changes li').count()>1);
 await page.goto('http://localhost:4173/notifications');assert.equal(await page.locator('.logs-unread-dot').count(),0);
 await page.evaluate(()=>localStorage.setItem('wgit.logs.lastRead','v0.1.6'));await page.reload();await dot.waitFor();
 await page.goto('http://localhost:4173/logs');assert.equal(await dot.count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('wgit.logs.lastRead')),'v0.1.7');
 const failed=await browser.newContext();await failed.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}});});const fallback=await failed.newPage();await fallback.goto('http://localhost:4173');await fallback.locator('.logs-unread-dot').waitFor();await fallback.getByRole('link',{name:'Logs'}).click();assert.equal(await fallback.locator('.logs-unread-dot').count(),0);await failed.close();
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{get(){throw new Error('denied')}});});const noStorage=await blocked.newPage();await noStorage.goto('http://localhost:4173/logs');assert.equal(await noStorage.locator('.logs-unread-dot').count(),0);await blocked.close();
 console.log('Release indicator browser checks passed.');
} finally {await browser.close();}
