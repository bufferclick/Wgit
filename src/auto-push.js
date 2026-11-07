import * as git from 'isomorphic-git';
import { githubUrl, pushBranch } from './remotes.js';
import { syncBranch } from './sync.js';

function validBranch(name) {
  return typeof name === 'string' && name !== '@' && !name.startsWith('-') && !/[\x00-\x20\x7f~^:?*\[\\]/.test(name) && !name.includes('..') && !name.includes('@{') && !name.endsWith('.') && name.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

// Resolve everything possible before staging or committing anything.
export async function prepareAutoPush(opts, remoteBranch) {
  if (!validBranch(remoteBranch)) throw new Error('Use wgit push <branch> with a valid branch name.');
  const branch = await git.currentBranch({ ...opts, fullname: false });
  if (!branch) throw new Error('A checked-out local branch is required.');
  const entry = (await git.listRemotes(opts)).find(item => item.remote === 'origin');
  if (!entry) throw new Error('No origin remote. Add one first with git remote add origin <GitHub HTTPS URL>.');
  const fetchUrl = githubUrl(entry.url);
  const pushUrl = await git.getConfig({ ...opts, path: 'remote.origin.pushurl' });
  const url = githubUrl(pushUrl || entry.url);
  if (fetchUrl !== url) throw new Error('Origin fetch and push URLs differ. Wgit will not automatically sync a different repository.');
  // Do not silently change the upstream of a differently named local branch.
  const configuredRemote = await git.getConfig({ ...opts, path: `branch.${branch}.remote` });
  const configuredMerge = await git.getConfig({ ...opts, path: `branch.${branch}.merge` });
  const upstream = branch === remoteBranch && (!configuredRemote || (configuredRemote === 'origin' && (!configuredMerge || configuredMerge === `refs/heads/${remoteBranch}`)));
  return { branch, remoteBranch, remote: 'origin', url, upstream };
}

export async function autoPush(opts, target, author, token, choose, log = () => {}, proxy) {
  if (!author?.name || !author?.email) throw new Error('Set your name and email in Settings before using wgit push.');
  if (!token) return { cancelled: true, phase: 'authentication' };
  if (await git.currentBranch({ ...opts, fullname: false }) !== target.branch) throw new Error('The checked-out branch changed. No files were staged; retry the command.');
  const matrix = await git.statusMatrix(opts);
  let staged = 0;
  for (const [filepath,, workdir, stage] of matrix) {
    if (workdir === stage) continue;
    try {
      if (workdir === 0) await git.remove({ ...opts, filepath });
      else await git.add({ ...opts, filepath });
    } catch { throw new Error(`Could not stage ${filepath}. Some files may already be staged; check git status before retrying.`); }
    staged++;
  }
  if (staged) log(`Staged ${staged} changed ${staged === 1 ? 'file' : 'files'} (ignored files are excluded).`);
  if (await git.currentBranch({ ...opts, fullname: false }) !== target.branch) throw new Error('The checked-out branch changed. Some files may be staged; check git status before retrying.');
  const current = await git.statusMatrix(opts);
  let commit;
  if (current.some(([, head,, stage]) => head !== stage)) {
    try { commit = await git.commit({ ...opts, author, message: 'Wgit: update project' }); }
    catch { throw new Error('Could not create the local commit. Files may remain staged; check folder permissions and git status.'); }
    log(`Created commit ${commit.slice(0, 7)}: Wgit: update project`);
  } else {
    try { await git.resolveRef({ ...opts, ref: `refs/heads/${target.branch}` }); }
    catch (error) { if (error.code !== 'NotFoundError') throw error; throw new Error('There are no files to commit or push.'); }
    log('No new changes to commit.');
  }
  const beforePush = await git.statusMatrix(opts);
  if (await git.currentBranch({ ...opts, fullname: false }) !== target.branch || beforePush.some(([, head, workdir, stage]) => head !== workdir || head !== stage)) throw new Error('Files changed while preparing the push. Any local commit was kept; check git status before retrying.');
  const push = () => pushBranch(opts, target, token, proxy);
  try {
    const result = await push();
    return { ...result, commit, synced: false };
  } catch (error) {
    if (error.code !== 'PushRejectedError' && !/not-fast-forward|non-fast-forward/.test(error.message || '')) {
      if (error.code === 'HttpError' && /\b(401|403|404)\b/.test(error.message || '')) throw new Error('GitHub denied access or the repository was not found. Check the remote and authentication. Any local commit was kept.');
      throw new Error('Push could not be confirmed. Check GitHub before retrying. Any local commit was kept.');
    }
  }
  log(`Remote ${target.remote}/${target.remoteBranch} has different history. Fetching and syncing without force...`);
  let sync;
  try { sync = await syncBranch(opts, target, token, author, choose, proxy); }
  catch (error) {
    if (error.code === 'HttpError') throw new Error('Could not fetch the remote. Check the URL, access and connection. Any local commit was kept.');
    throw new Error(`${error.message || 'Could not sync remote history.'} Any local commit made before syncing was kept.`);
  }
  if (sync.cancelled) return { cancelled: true, phase: 'sync', commit };
  log(sync.already ? 'Remote history already included; retrying push.' : `Synced remote history into ${target.branch}.`);
  try {
    const result = await push();
    return { ...result, commit, synced: true };
  } catch (error) {
    if (error.code === 'PushRejectedError' || /not-fast-forward|non-fast-forward/.test(error.message || '')) throw new Error('Push was rejected again, possibly because the remote changed during sync. Your local commit and sync were kept; retry after checking the remote.');
    throw new Error('Push could not be confirmed after sync. Check GitHub before retrying; your local commit and sync were kept.');
  }
}
