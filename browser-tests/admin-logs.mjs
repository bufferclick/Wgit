import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:process.env.WGit_CHROME_PATH, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
const origin = 'http://localhost:4173';
let admin = false, requests = [], votes = {};
const context = await browser.newContext({ viewport:{width:390,height:844},colorScheme:'dark' });
await context.addInitScript(() => { const exp = Math.floor(Date.now()/1000)+3600; const jwt = `${btoa('{}')}.${btoa(JSON.stringify({exp,sub:'00000000-0000-4000-8000-000000000001'}))}.sig`; sessionStorage.setItem('sb-jjkuljatqsjndqwrqtxe-auth-token',JSON.stringify({access_token:jwt,refresh_token:'x',token_type:'bearer',expires_at:exp,expires_in:3600,user:{id:'00000000-0000-4000-8000-000000000001',aud:'authenticated'}})); });
await context.route('**/functions/v1/community**', async route => {
  const u = new URL(route.request().url()), action=u.searchParams.get('action'); const req=route.request();
  if (action === 'me') return route.fulfill({json:{login:admin?'bufferclick':'other',admin,banned:false}});
  if (action === 'bans' && req.method()==='GET') return route.fulfill({json:[{github_id:'42',github_login:'test-user'}]});
  if (action === 'votes') return route.fulfill({json:{totals:Object.entries(votes).map(([release_id,direction])=>({release_id,upvotes:direction===1?1:0,downvotes:direction===-1?1:0})),mine:Object.entries(votes).map(([release_id,direction])=>({release_id,direction}))}});
  if (req.method()==='POST') { const body=req.postDataJSON(); requests.push({action,body}); if (action==='vote') votes[body.release]=body.direction; return route.fulfill({json:action==='wipe'?{ok:true,deleted:{posts:6,votes:1}}:{ok:true}}); }
  return route.fulfill({json:[]});
});
const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${origin}/settings/admin`); await page.getByText(/access denied/).waitFor(); assert.equal(await page.locator('#admin-controls').isVisible(),false);
  admin=true; await page.reload(); await page.locator('#admin-controls').waitFor({state:'visible'}); await page.getByText('test-user@github.com').waitFor();
  await page.locator('#ban-email').fill('someone@github.com'); await page.locator('#ban-form button').click(); await page.getByText('Account banned.').waitFor(); assert.equal(requests.at(-1).action,'ban');
  await page.getByRole('button',{name:'Unban'}).click(); await page.getByText('Account unbanned.').waitFor(); assert.equal(requests.at(-1).action,'unban');
  await page.locator('input[value="posts"]').check(); await page.locator('input[value="votes"]').check();
  let dialogs=0; const confirmOnlyFirst = async dialog => { dialogs++; if(dialogs===1) await dialog.accept(); else await dialog.dismiss(); };
  page.on('dialog',confirmOnlyFirst); await page.locator('#wipe-data').click(); page.off('dialog',confirmOnlyFirst); assert.equal(dialogs,2); assert.equal(requests.filter(x=>x.action==='wipe').length,0);
  dialogs=0; const acceptAll=async dialog => { dialogs++; await dialog.accept(dialog.type()==='prompt'?'DELETE SELECTED DATA':undefined); }; page.on('dialog',acceptAll); await page.locator('#wipe-data').click(); page.off('dialog',acceptAll);
  await page.getByText('Selected data deleted.', {exact:false}).waitFor(); assert.match(await page.locator('#admin-status').textContent(), /discussions and replies: 6; update votes: 1/); assert.equal(dialogs,3); assert.deepEqual(requests.at(-1).body.categories,['posts','votes']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('link',{name:'Logs'}).click(); await page.getByText('Verified as @bufferclick').waitFor(); assert.match(await page.locator('.release-item').first().textContent(),/v0.1.8/);
  const up=page.locator('.release-item').first().getByRole('button',{name:/Upvote/}); await up.click(); await page.waitForFunction(()=>document.querySelector('.release-item .vote-button').getAttribute('aria-pressed')==='true'); assert.equal(requests.at(-1).action,'vote'); assert.equal(requests.at(-1).body.direction,1);
  await page.locator('.release-item').first().getByRole('button',{name:/Downvote/}).click(); await page.waitForFunction(()=>document.querySelectorAll('.release-item .vote-button')[1].getAttribute('aria-pressed')==='true'); assert.equal(requests.at(-1).body.direction,-1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const visitorContext = await browser.newContext(); const visitor = await visitorContext.newPage();
  await visitor.route('**/functions/v1/community**', route => route.fulfill({json:[]}));
  await visitor.goto(`${origin}/community`); await visitor.getByText('Verify with GitHub to start or reply to a discussion.').waitFor();
  await visitor.locator('#new-discussion').click(); assert.equal(await visitor.locator('#submit-post').isDisabled(), true);
  await visitor.goto(`${origin}/settings/admin`); await visitor.getByText('Verify with GitHub to check admin access.').waitFor(); assert.equal(await visitor.locator('#admin-controls').isVisible(), false);
  await visitor.goto(`${origin}/logs`); await visitor.getByText('Verify with GitHub to vote.').waitFor(); assert.equal(await visitor.locator('.vote-button').first().isDisabled(), true);
  await visitorContext.close(); assert.deepEqual(errors,[]); console.log('Admin and logs browser checks passed.');
} finally { await browser.close(); }
