// Browser-local file backups. Git metadata is intentionally excluded: restoring
// a snapshot never rewrites Git history or the index.
const MAX_FILES = 500, MAX_BYTES = 20 * 1024 * 1024;
function database() { return new Promise((resolve, reject) => { const r = indexedDB.open('wgit-snapshots-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function transaction(mode, operation) { const db = await database(); try { return await new Promise((resolve,reject) => { const tx = db.transaction('snapshots', mode), req = operation(tx.objectStore('snapshots')); let value; req.onsuccess = () => { value = req.result; }; req.onerror = () => reject(req.error); tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Snapshot transaction aborted.')); }); } finally { db.close(); } }
export const listSnapshots = () => transaction('readonly', store => store.getAll());
export const deleteSnapshot = id => transaction('readwrite', store => store.delete(id));
export async function createSnapshot(fs, workspaceName) {
  const files = [], dirs = [], pending = ['']; let bytes = 0, entries = 0;
  while (pending.length) {
    const dir = pending.pop();
    for (const name of await fs.promises.readdir('/workspace' + (dir ? '/' + dir : ''))) {
      if (name === '.git') continue;
      if (++entries > 2000) throw new Error('Snapshot limit: 2,000 files and folders. No snapshot was saved.');
      const rel = dir ? `${dir}/${name}` : name, path = `/workspace/${rel}`;
      const stat = await fs.promises.lstat(path);
      if (stat.isSymbolicLink?.()) throw new Error(`Cannot snapshot a symbolic link: ${rel}`);
      if (stat.isDirectory()) { dirs.push(rel); pending.push(rel); }
      else if (stat.isFile()) { if (files.length >= MAX_FILES || bytes + stat.size > MAX_BYTES) throw new Error('Snapshot limit: 500 files and 20 MiB. No snapshot was saved.'); const data = await fs.promises.readFile(path); const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data); bytes += dataBytes.byteLength; if (bytes > MAX_BYTES) throw new Error('Snapshot is larger than 20 MiB. No snapshot was saved.'); files.push({path:rel,data:dataBytes}); }
      else throw new Error(`Unsupported file type: ${rel}`);
    }
  }
  const snapshot = { id:crypto.randomUUID(), workspaceName, created:Date.now(), files, dirs, bytes };
  await transaction('readwrite', store => store.add(snapshot)); return snapshot;
}
export async function restoreSnapshot(fs, snapshot) {
  const safe = path => typeof path === 'string' && path && path.split('/').every(x => x && x !== '.' && x !== '..' && x !== '.git');
  if (!Array.isArray(snapshot.files) || !Array.isArray(snapshot.dirs) || !snapshot.files.every(x => safe(x.path)) || !snapshot.dirs.every(safe)) throw new Error('Invalid snapshot paths.');
  for (const dir of snapshot.dirs.slice().sort((a,b) => a.split('/').length-b.split('/').length)) {
    try { await fs.promises.mkdir(`/workspace/${dir}`); } catch (e) { if (e.code !== 'EEXIST') throw e; if (!(await fs.promises.stat(`/workspace/${dir}`)).isDirectory()) throw new Error(`A file blocks directory ${dir}.`); }
  }
  for (const file of snapshot.files) await fs.promises.writeFile(`/workspace/${file.path}`, file.data);
}
