import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { githubUrl } from './remotes.js';

export async function prepareSync(opts, args) {
  if (args.length !== 2 || args.some(a => a.startsWith('-') || a.includes(':'))) throw new Error('Use git sync <remote> <branch>, for example git sync origin main.');
  const [remote, branch] = args;
  const current = await git.currentBranch({ ...opts, fullname: false });
  if (!current || current !== branch) throw new Error('Switch to the local branch with the same name before syncing.');
  const entry = (await git.listRemotes(opts)).find(r => r.remote === remote);
  if (!entry) throw new Error(`Remote not found: ${remote}`);
  const pushUrl = await git.getConfig({ ...opts, path: `remote.${remote}.pushurl` });
  if (pushUrl && githubUrl(pushUrl) !== githubUrl(entry.url)) throw new Error('Fetch and push URLs differ. Wgit will not sync a different repository from the push target.');
  return { remote, branch, url: githubUrl(entry.url) };
}
async function clean(opts) {
  const matrix = await git.statusMatrix(opts);
  if (matrix.some(([, h, w, s]) => h !== w || h !== s)) throw new Error('Commit or move all changed and untracked files before syncing. No files were changed.');
}
async function filesAt(opts, oid) {
  const result = new Map();
  await git.walk({ ...opts, trees: [git.TREE({ ref: oid })], map: async (path, [entry]) => {
    if (path === '.' || !entry) return;
    if (path.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.includes('\\') || part.includes('\0'))) throw new Error('The remote contains an unsafe path. No files were changed.');
    const type = await entry.type();
    if (type === 'tree') return;
    const mode = await entry.mode();
    if (type !== 'blob' || ![0o100644, 0o100755].includes(mode)) throw new Error('Sync does not support symlinks, submodules, or special Git file modes. No files were changed.');
    result.set(path, { oid: await entry.oid(), mode });
  } });
  return result;
}
const same = (a, b) => (!a && !b) || (!!a && !!b && a.oid === b.oid && a.mode === b.mode);
async function writeTree(opts, files) {
  const root = new Map();
  for (const [path, value] of files) {
    const parts = path.split('/'); let node = root;
    for (const part of parts.slice(0, -1)) {
      if (node.has(part) && !(node.get(part) instanceof Map)) throw new Error(`File/directory conflict at ${path}. Resolve it with another Git client.`);
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part);
    }
    const leaf = parts.at(-1);
    if (node.has(leaf)) throw new Error(`File/directory conflict at ${path}. Resolve it with another Git client.`);
    node.set(leaf, value);
  }
  async function write(node) {
    const tree = [];
    for (const [name, value] of node) {
      if (value instanceof Map) tree.push({ path: name, mode: '040000', type: 'tree', oid: await write(value) });
      else tree.push({ path: name, mode: value.mode.toString(8), type: 'blob', oid: value.oid });
    }
    return git.writeTree({ ...opts, tree });
  }
  return write(root);
}
// Guard even ignored files: statusMatrix intentionally does not show them.
async function guardNewPaths(opts, ours, merged) {
  for (const name of merged.keys()) {
    if (ours.has(name)) continue;
    const parts = name.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const path = `${opts.dir}/${parts.slice(0, i).join('/')}`;
      let stat;
      try { stat = await opts.fs.promises.lstat(path); }
      catch (error) { if (error.code === 'ENOENT') break; throw error; }
      if (i === parts.length || !stat.isDirectory()) throw new Error(`Cannot sync: an existing file or folder at ${path} might be overwritten. Move it first; no files were changed.`);
    }
  }
}
export async function syncBranch(opts, target, token, author, choose, proxy = `${location.origin}/api/git`) {
  await clean(opts);
  if (!author?.name || !author?.email) throw new Error('Set your name and email in Settings before syncing.');
  const current = await git.resolveRef({ ...opts, ref: `refs/heads/${target.branch}` });
  const auth = `Basic ${btoa(`x-access-token:${token}`)}`;
  const fetched = await git.fetch({ ...opts, http, url: target.url, remote: target.remote, ref: target.branch, remoteRef: target.branch, singleBranch: true, corsProxy: proxy, headers: { Authorization: auth } });
  const theirs = fetched.fetchHead;
  if (!theirs) throw new Error('The remote branch has no commits to sync.');
  const bases = await git.findMergeBase({ ...opts, oids: [current, theirs] });
  if (bases.length > 1) throw new Error('This history has multiple merge bases; use another Git client.');
  if (bases[0] === theirs) return { already: true };
  const [oursFiles, theirFiles, baseFiles] = await Promise.all([filesAt(opts, current), filesAt(opts, theirs), bases.length ? filesAt(opts, bases[0]) : new Map()]);
  const merged = new Map(), conflicts = [];
  for (const path of [...new Set([...oursFiles.keys(), ...theirFiles.keys(), ...baseFiles.keys()])].sort()) {
    const ours = oursFiles.get(path), theirsFile = theirFiles.get(path), base = baseFiles.get(path);
    let chosen;
    if (same(ours, theirsFile)) chosen = ours;
    else if (same(ours, base)) chosen = theirsFile;
    else if (same(theirsFile, base)) chosen = ours;
    else { conflicts.push({ path, ours: !!ours, theirs: !!theirsFile }); continue; }
    if (chosen) merged.set(path, chosen);
  }
  for (const conflict of conflicts) {
    const selection = await choose(conflict);
    if (!['local', 'remote'].includes(selection)) return { cancelled: true };
    const chosen = selection === 'local' ? oursFiles.get(conflict.path) : theirFiles.get(conflict.path);
    if (chosen) merged.set(conflict.path, chosen);
  }
  await clean(opts);
  await guardNewPaths(opts, oursFiles, merged);
  const tree = await writeTree(opts, merged);
  const oid = bases[0] === current ? theirs : await git.commit({ ...opts, tree, parent: [current, theirs], noUpdateBranch: true, author, message: `Merge ${target.remote}/${target.branch} into ${target.branch}` });
  // Checkout first without moving HEAD, protecting untracked/ignored files; only
  // advance the branch after the checkout succeeds. No forced checkout or push.
  await git.checkout({ ...opts, ref: oid, noUpdateHead: true, dryRun: true });
  if (await git.resolveRef({ ...opts, ref: `refs/heads/${target.branch}` }) !== current) throw new Error('The branch changed during sync; try again.');
  try { await git.checkout({ ...opts, ref: oid, noUpdateHead: true }); }
  catch { throw new Error('Sync checkout could not complete. The branch was not advanced, but files or the index may be partially updated. Inspect and back up the project before retrying.'); }
  if (await git.resolveRef({ ...opts, ref: `refs/heads/${target.branch}` }) !== current) throw new Error('The branch changed during sync. Inspect the working tree before continuing.');
  try { await git.writeRef({ ...opts, ref: `refs/heads/${target.branch}`, value: oid, force: true }); }
  catch { throw new Error('Sync could not update the branch. The working tree may contain the merged files; inspect and back up the project before retrying.'); }
  return { oid, conflicts: conflicts.length, unrelated: !bases.length };
}
