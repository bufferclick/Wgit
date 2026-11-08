import * as git from 'isomorphic-git';
import { diffLines } from 'diff';
import { readTextFile } from './cat.js';
import { listSnapshots, createSnapshot, restoreSnapshot, deleteSnapshot } from './snapshots.js';
import { connectRepositories, providerToken } from './auth.js';
import { listGithubRepos } from './github-repos.js';
import { lessons } from './lessons.js';

const el = (tag, cls, text) => { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; };
const button = (text, fn, cls='tool-button') => { const b=el('button',cls,text); b.type='button'; b.addEventListener('click',fn); return b; };
export function mountTools({ getState, exclusive, refresh, identity, insertCommand, openDemo, openFolder }) {
  const wrapper=el('section','workspace-tools'); wrapper.innerHTML=`<div class="tool-heading"><div><span>WORKSPACE TOOLS</span><h2>Everything in one place</h2></div><p>Explore, review and learn.</p></div><div class="tool-grid"></div>`;
  document.querySelector('.demo-row').after(wrapper);
  const dialog=el('dialog','tool-dialog'); dialog.innerHTML=`<div class="tool-dialog-head"><div><span class="tool-eyebrow">WGIT WORKSPACE</span><h2 id="tool-title"></h2></div><button class="tool-close" aria-label="Close">×</button></div><p id="tool-status" role="status" aria-live="polite"></p><div id="tool-content"></div>`; document.body.append(dialog);
  const content=dialog.querySelector('#tool-content'), status=dialog.querySelector('#tool-status'), title=dialog.querySelector('#tool-title'); dialog.querySelector('.tool-close').onclick=()=>dialog.close();
  function show(name) { title.textContent=name; status.textContent=''; content.replaceChildren(); if(!dialog.open)dialog.showModal(); }
  function message(text, error=false) { status.textContent=text; status.classList.toggle('tool-error',error); }
  async function act(fn) { try { message('Working…'); await exclusive(fn); if(status.textContent==='Working…')message(''); } catch(e) { message(e.message || 'Something went wrong.',true); } }
  function workspace(requireRepo=false) { const s=getState(); if(!s.fs)throw new Error('Open a folder or the demo first.'); if(requireRepo && !s.repo)throw new Error('Initialize a Git repository first.'); return s; }
  function addAction(name, desc, open) { const card=button('',open,'tool-card'); card.append(el('strong','',name),el('span','',desc),el('b','','↗')); wrapper.querySelector('.tool-grid').append(card); }
  async function browse(path='/workspace') {
    const s=workspace(); content.replaceChildren(); const bar=el('div','tool-bar'); bar.append(el('strong','',path.replace('/workspace',s.name))); if(path!=='/workspace')bar.append(button('← Parent',()=>act(()=>browse(path.slice(0,path.lastIndexOf('/')))))); content.append(bar);
    const names=(await s.fs.promises.readdir(path)).filter(n=>n!=='.git').sort(); if(!names.length) content.append(el('p','tool-muted','This folder is empty.'));
    for(const name of names) { const target=`${path}/${name}`, stat=await s.fs.promises.lstat(target); const row=button(`${stat.isDirectory()?'▸':'▤'}  ${name}`,()=>act(async()=>{ if(stat.isDirectory())return browse(target); if(!stat.isFile())throw new Error('Unsupported file type.'); const text=await readTextFile(s.fs,target); content.replaceChildren(button('← Back to files',()=>act(()=>browse(path))),el('h3','',name),el('pre','tool-code',text)); }), 'tool-row'); content.append(row); }
  }
  addAction('Files','Browse and open project files',()=>{show('Files'); act(()=>browse());});
  async function changes() {
    const {fs,repo}=workspace(true), opts={fs,dir:repo}; content.replaceChildren(); content.append(el('p','tool-muted','Working files compared with the last commit (HEAD). Staged changes may differ from the working files.')); const matrix=await git.statusMatrix(opts); const items=matrix.filter(([,h,w,stage])=>h!==w||h!==stage);
    if(!items.length){content.append(el('p','tool-empty','No changes to review.'));return;}
    for(const [name,h,w] of items) { if(h===w) { content.append(el('div','tool-row',`Staged changes only · ${name} (working file matches HEAD)`)); continue; } content.append(button(`${h===0?'Added':w===0?'Deleted':'Changed'} · ${name}`,()=>act(async()=>{
      let before='',after=''; const decode=bytes=>{ if(bytes.length>256*1024 || bytes.includes(0)) throw new Error('Diff is limited to 256 KiB UTF-8 text files.'); try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Binary files cannot be displayed as text.');} };
      if(h) { const oid=await git.resolveRef({...opts,ref:'HEAD'}); before=decode((await git.readBlob({...opts,oid,filepath:name})).blob); }
      if(w) { const stat=await fs.promises.stat(`${repo}/${name}`); if(stat.size>256*1024)throw new Error('Diff is limited to 256 KiB UTF-8 text files.'); after=decode(await fs.promises.readFile(`${repo}/${name}`)); }
      const parts=diffLines(before,after,{maxEditLength:5000,timeout:1000}); if(!parts)throw new Error('This diff is too complex to display.');
      const area=el('pre','tool-code diff-code'); for(const part of parts){const block=el('span',part.added?'diff-added':part.removed?'diff-removed':'',part.value.split(/(?<=\n)/).filter(Boolean).map(x=>(part.added?'+ ':part.removed?'- ':'  ')+x).join(''));area.append(block);} content.replaceChildren(button('← All changes',()=>act(changes)),el('h3','',name),area);
    }),'tool-row')); }
  }
  addAction('Changes','Review a visual diff',()=>{show('Changes');act(changes);});
  async function historyView() {
    const {fs,repo}=workspace(true), opts={fs,dir:repo}; content.replaceChildren(); const refs=await git.listBranches(opts), labels=new Map(), queue=[];
    for(const ref of refs) try {const oid=await git.resolveRef({...opts,ref:`refs/heads/${ref}`}); queue.push(oid); labels.set(oid,[...(labels.get(oid)||[]),ref]);}catch{}
    if(!queue.length) try{queue.push(await git.resolveRef({...opts,ref:'HEAD'}));}catch{}
    const commits=[], seen=new Set(); while(queue.length && commits.length<100) {const oid=queue.shift(); if(seen.has(oid))continue; seen.add(oid); const {commit}=await git.readCommit({...opts,oid}); commits.push({oid,commit}); queue.push(...commit.parent);}
    if(!commits.length){content.append(el('p','tool-empty','No commits yet.'));return;}
    content.append(el('p','tool-muted','Up to 100 commits reachable from local branches. Lines connect commits to their parents.'));
    // Parent links are rendered as an SVG graph beside readable commit information.
    const graph=el('div','history-graph'), svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); const width=120,rowHeight=58; svg.setAttribute('width',width); svg.setAttribute('height',commits.length*rowHeight); svg.setAttribute('aria-hidden','true');
    const lanes=[], coords=new Map(); commits.forEach(({oid,commit},i)=>{let lane=lanes.indexOf(oid); if(lane<0){lane=lanes.indexOf(null); if(lane<0)lane=lanes.length; lanes[lane]=oid;} coords.set(oid,{x:14+(lane%7)*15,y:i*rowHeight+20}); lanes[lane]=commit.parent[0]||null; for(const parent of commit.parent.slice(1))if(!lanes.includes(parent)){let free=lanes.indexOf(null); if(free<0)free=lanes.length; lanes[free]=parent;} });
    for(const {oid,commit} of commits)for(const parent of commit.parent){const a=coords.get(oid),b=coords.get(parent);if(!b)continue;const line=document.createElementNS(svg.namespaceURI,'line'); for(const [k,v] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(k,v);line.setAttribute('stroke','#2da44e');line.setAttribute('stroke-width','2');svg.append(line);}
    for(const {oid} of commits){const a=coords.get(oid),circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',a.x);circle.setAttribute('cy',a.y);circle.setAttribute('r','4');circle.setAttribute('fill','#1f883d');svg.append(circle);} graph.append(svg);
    const rows=el('div','history-rows'); for(const {oid,commit} of commits){const row=el('div','history-row');row.append(el('strong','',commit.message.trim().split('\n')[0]),el('span','',`${oid.slice(0,7)} · ${commit.author.name}${labels.has(oid)?' · '+labels.get(oid).join(', '):''}`));rows.append(row);} graph.append(rows);content.append(graph);
  }
  addAction('History','Visualize commits and branches',()=>{show('History');act(historyView);});
  async function commitView() {
    const {fs,repo}=workspace(true),opts={fs,dir:repo}; const matrix=await git.statusMatrix(opts), staged=matrix.filter(([,h,,s])=>h!==s); content.replaceChildren(); content.append(el('p','tool-muted','Only already-staged changes will be committed. Use git add in the terminal to stage files.'));
    if(!staged.length){content.append(el('p','tool-empty','No staged files.'));return;}
    for(const [name,h,,s] of staged)content.append(el('div','tool-row',`${s===0?'Deleted':h===0?'Added':'Changed'} · ${name}`));
    const form=el('form','commit-form'), label=el('label','','Commit message'), field=el('input');field.required=true; field.maxLength=500; field.placeholder='Describe your changes'; label.append(field); const submit=el('button','button primary','Commit staged changes');submit.type='submit';form.append(label,submit);content.append(form);
    form.onsubmit=e=>{e.preventDefault();const messageText=field.value.trim(); if(!messageText)return;act(async()=>{const author=await identity(opts); if(!author.name||!author.email)throw new Error('Set your name and GitHub email in Settings first.'); const current=await git.statusMatrix(opts); if(!current.some(([,h,,s])=>h!==s))throw new Error('Nothing is staged anymore.'); const oid=await git.commit({...opts,author,message:messageText}); await refresh(); await commitView(); message(`Created commit ${oid.slice(0,7)}.`);});};
  }
  addAction('Commit','Commit staged files',()=>{show('Commit');act(commitView);});
  async function repoPicker(page=1) {
    content.replaceChildren(); const note=el('p','tool-muted','Connect with GitHub OAuth to list your repositories. The repo scope grants broad read and write access to private repositories, even though this picker only reads. You can revoke it in GitHub settings. OAuth is not used for Git pushes; those still use your separate PAT.');content.append(note);
    if (!getState().fs) { content.append(el('p','tool-muted','After GitHub redirects back, reopen your folder or demo before choosing a remote.')); const open=el('div','tool-bar'); open.append(button('Open folder',()=>{dialog.close();openFolder();}),button('Open demo',()=>{dialog.close();openDemo();})); content.append(open); }
    const token=await providerToken(); content.append(button(token?'Reconnect GitHub with repository access':'Connect GitHub for repository access',()=>{if(confirm('GitHub will request repo access, including write access to private repositories. Continue?')) { try { sessionStorage.setItem('wgit.open-repo-picker','1'); } catch {} connectRepositories().catch(e=>message(e.message,true)); }}));
    if(!token){content.append(el('p','tool-empty','Connect to load repositories.'));return;}
    let repos; try{repos=await listGithubRepos(token,page);}catch(e){content.append(el('p','tool-error',e.message));return;}
    content.append(el('p','tool-muted',`Page ${page} · selecting a repository sets origin; it does not upload or clone.`));
    for(const r of repos) content.append(button(`${r.name} ${r.private?'· private':'· public'}`,()=>act(async()=>{const {fs,repo}=workspace(true),opts={fs,dir:repo}; const old=(await git.listRemotes(opts)).find(x=>x.remote==='origin'); if(old && await git.getConfig({...opts,path:'remote.origin.pushurl'})) throw new Error('Origin has a separate push URL. Remove it explicitly before changing origin.'); if(old&&!confirm(`Replace the existing origin with ${r.url}? This does not push or change files.`))return; if(old) await git.setConfig({...opts,path:'remote.origin.url',value:r.url}); else await git.addRemote({...opts,remote:'origin',url:r.url}); message(`Origin set to ${r.url}.`);}), 'tool-row'));
    const pages=el('div','tool-bar');if(page>1)pages.append(button('← Previous',()=>act(()=>repoPicker(page-1))));if(repos.length===50)pages.append(button('Next →',()=>act(()=>repoPicker(page+1))));content.append(pages);
  }
  addAction('GitHub repos','Choose an OAuth-connected remote',()=>{show('GitHub repositories');act(()=>repoPicker());});
  async function snapshotsView() {
    const s=workspace();content.replaceChildren();content.append(el('p','tool-muted','Browser-local and unencrypted, including ignored files and secrets; .git is excluded. Maximum 500 files / 20 MiB per snapshot. Clearing browser storage deletes snapshots.'));
    content.append(button('Create snapshot',()=>act(async()=>{if(!confirm(`Save a snapshot of ${s.name} in this browser? It may include sensitive files.`))return;const snap=await createSnapshot(s.fs,s.name);await snapshotsView();message(`Saved ${snap.files.length} files.`);}),'button primary'));
    const snapshots=(await listSnapshots()).sort((a,b)=>b.created-a.created); if(!snapshots.length)content.append(el('p','tool-empty','No snapshots saved on this device.'));
    for(const snap of snapshots){const row=el('div','snapshot-row');row.append(el('span','',`${snap.workspaceName} · ${new Date(snap.created).toLocaleString()} · ${snap.files.length} files`),button('Restore',()=>act(async()=>{const now=workspace();if(!confirm(`Restore ${snap.files.length} files from ${snap.workspaceName} into ${now.name}? Saved paths will be overwritten. Extra files and .git are not removed. A failure may leave a partial restore.`))return;try{await restoreSnapshot(now.fs,snap);}catch(e){throw new Error(`Restore may be partial: ${e.message}`);}await refresh();message('Snapshot restored. Extra files and Git history were not changed.');})),button('Delete',()=>act(async()=>{if(!confirm('Delete this browser snapshot permanently?'))return;await deleteSnapshot(snap.id);await snapshotsView();message('Snapshot deleted.');})));content.append(row);}
  }
  addAction('Snapshots','Save a local restore point',()=>{show('Snapshots');act(snapshotsView);});
  let lessonIndex=0;
  function lessonView(){ const step=lessons[lessonIndex];content.replaceChildren();content.append(el('p','lesson-counter',`LESSON ${lessonIndex+1} OF ${lessons.length}`),el('h3','lesson-title',step.title),el('p','lesson-copy',step.body));const actions=el('div','tool-bar'); if(step.action)actions.append(button('Open the demo',()=>{lessonIndex=Math.min(lessonIndex+1,lessons.length-1);dialog.close();openDemo();},'button primary'));if(step.command)actions.append(button(`Try: ${step.command}`,()=>{lessonIndex=Math.min(lessonIndex+1,lessons.length-1);dialog.close();insertCommand(step.command);},'button primary')); content.append(actions);const nav=el('div','lesson-nav');if(lessonIndex>0)nav.append(button('← Previous',()=>{lessonIndex--;lessonView();}));if(lessonIndex<lessons.length-1)nav.append(button('Next lesson →',()=>{lessonIndex++;lessonView();}));else nav.append(button('Finish',()=>dialog.close()));content.append(nav);}
  addAction('Learn Wgit','A guided tour and Git basics',()=>{show('Learn Wgit');lessonView();});
  try { if(sessionStorage.getItem('wgit.open-repo-picker')) { sessionStorage.removeItem('wgit.open-repo-picker'); show('GitHub repositories'); void act(()=>repoPicker()); } } catch {}
  return { dialog };
}
