// Per-tab workspace metadata; file handles live in IndexedDB, never localStorage.
const STATE_KEY = 'wgit.workspace.session.v1';
const ID_KEY = 'wgit.workspace.session.id';
function sessionId() { let id=sessionStorage.getItem(ID_KEY); if(!id){ id=crypto.randomUUID(); sessionStorage.setItem(ID_KEY,id); } return id; }
function openDb() { return new Promise((resolve,reject)=>{const req=indexedDB.open('wgit-workspace-handles-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('handles');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
async function dbRequest(mode, op) { const db=await openDb(); try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles',mode), request=op(tx.objectStore('handles'));let result;request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error || new Error('Workspace storage failed.'));});}finally{db.close();} }
export async function saveHandle(handle) { await dbRequest('readwrite',s=>s.put(handle,sessionId())); }
export async function loadHandle() { return dbRequest('readonly',s=>s.get(sessionId())); }
export function saveState(state) { try { sessionStorage.setItem(STATE_KEY,JSON.stringify(state)); return true; } catch { return false; } }
export function loadState() { try { const state=JSON.parse(sessionStorage.getItem(STATE_KEY)); return state && typeof state==='object' ? state : null; } catch { return null; } }
