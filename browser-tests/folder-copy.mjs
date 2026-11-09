import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=mkdtempSync(join(tmpdir(),'wgit-folder-'));const source=join(root,'project');mkdirSync(source);mkdirSync(join(source,'src'));mkdirSync(join(source,'.git'));writeFileSync(join(source,'README.md'),'source text');writeFileSync(join(source,'src','index.js'),'hello');writeFileSync(join(source,'.git','config'),'existing config');
const browser=await chromium.launch({executablePath:process.env.WGit_CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(()=>{window.showDirectoryPicker=undefined;});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function command(text,expected){const before=await page.locator('#terminal-output .output-line').count();await page.locator('#command-input').fill(text);await page.locator('#command-input').press('Enter');await page.waitForFunction(n=>document.querySelectorAll('#terminal-output .output-line').length>=n+2&&document.querySelector('#terminal-form').dataset.busy!=='true',before);assert.match(await page.locator('#terminal-output .output-line').last().textContent(),expected);}
try {
 await page.goto('http://localhost:4173');await page.locator('#open-folder').click();await page.getByText(/Direct folder access is unavailable/).waitFor();
 const chooser=page.waitForEvent('filechooser');await page.locator('#open-folder-copy').click();await (await chooser).setFiles(source);await page.getByText(/Copied 2 files/).waitFor();assert.match(await page.locator('#folder-description').textContent(),/Browser-stored copy/);
 await command('ls',/README\.md\s+src/);await command('git init',/Initialized empty Git repository/);await command('git add .',/Staged/);
 await page.locator('#open-settings').click();await page.locator('#settings-name').fill('Tester');await page.locator('#settings-email').fill('tester@github.com');await page.locator('#settings-form button[type=submit]').click();await command('git commit -m "First"',/First/);
 await page.getByRole('link',{name:'Logs'}).click();await page.getByRole('link',{name:'Workspace'}).click();await page.waitForFunction(()=>document.querySelector('#side-detail')?.textContent==='Browser-stored folder copy');await command('git log --oneline',/First/);
 assert.equal(readFileSync(join(source,'.git','config'),'utf8'),'existing config');assert.equal(readFileSync(join(source,'README.md'),'utf8'),'source text');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);console.log('Folder copy browser checks passed.');
} finally {await browser.close();rmSync(root,{recursive:true,force:true});}
