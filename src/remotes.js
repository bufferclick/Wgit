import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

export function githubUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use an HTTPS GitHub repository URL, e.g. https://github.com/owner/repo.git.'); }
  const path = url.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !path || ['.', '..'].includes(path[1]) || ['.', '..', '.git', '..git', '...git'].includes(path[2])) {
    throw new Error('Only credential-free HTTPS GitHub repository URLs are supported.');
  }
  return `https://github.com/${path[1]}/${path[2].endsWith('.git') ? path[2] : `${path[2]}.git`}`;
}
const redact = url => { try { const parsed = new URL(url); if (parsed.username || parsed.password) { parsed.username = 'redacted'; parsed.password = ''; } return parsed.toString(); } catch { return '(unsupported remote URL)'; } };
export async function remoteCommand(opts, args) {
  if (!args.length || (args.length === 1 && args[0] === '-v')) {
    const remotes = await git.listRemotes(opts);
    if (!remotes.length) return 'No remotes configured.';
    return (await Promise.all(remotes.map(async ({ remote, url }) => args[0] === '-v' ? `${remote}\t${redact(url)} (fetch)\n${remote}\t${redact(await git.getConfig({ ...opts, path: `remote.${remote}.pushurl` }) || url)} (push)` : remote))).join('\n');
  }
  const [action, name, url] = args;
  if (action === 'add' && args.length === 3) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.endsWith('.lock') || name.includes('..')) throw new Error('Invalid remote name.');
    const safeUrl = githubUrl(url);
    await git.addRemote({ ...opts, remote: name, url: safeUrl });
    return `Added remote ${name}: ${safeUrl}`;
  }
  if (action === 'remove' && args.length === 2) { await git.deleteRemote({ ...opts, remote: name }); return `Removed remote ${name}.`; }
  if (action === 'get-url' && args.length === 2) { const entry = (await git.listRemotes(opts)).find(r => r.remote === name); if (!entry) throw new Error(`Remote not found: ${name}`); return redact(entry.url); }
  if (action === 'set-url' && args.length === 3) {
    const entry = (await git.listRemotes(opts)).find(r => r.remote === name);
    if (!entry) throw new Error(`Remote not found: ${name}`);
    const safeUrl = githubUrl(url); await git.setConfig({ ...opts, path: `remote.${name}.url`, value: safeUrl }); return `Updated remote ${name}: ${safeUrl}`;
  }
  throw new Error('Use git remote [-v], add <name> <url>, get-url <name>, set-url <name> <url>, or remove <name>.');
}
export async function preparePush(opts, args) {
  const remaining = [...args]; let upstream = false;
  if (remaining[0] === '-u' || remaining[0] === '--set-upstream') { upstream = true; remaining.shift(); }
  if (remaining.length > 2 || remaining.some(arg => arg.startsWith('-') || arg.includes(':'))) throw new Error('Use git push [-u] [remote] [branch]. Force pushes, tags, and refspecs are not supported.');
  const current = await git.currentBranch({ ...opts, fullname: false });
  const branch = remaining[1] || current;
  if (!branch || !(await git.listBranches(opts)).includes(branch)) throw new Error('Select a local branch with at least one commit before pushing.');
  await git.resolveRef({ ...opts, ref: `refs/heads/${branch}` });
  const remote = remaining[0] || await git.getConfig({ ...opts, path: `branch.${branch}.remote` });
  if (!remote || remote === '.') throw new Error('No upstream remote. Use git push -u origin main (replace origin and main as needed).');
  const entry = (await git.listRemotes(opts)).find(r => r.remote === remote);
  if (!entry) throw new Error(`Remote not found: ${remote}`);
  const pushUrl = await git.getConfig({ ...opts, path: `remote.${remote}.pushurl` });
  const url = githubUrl(pushUrl || entry.url);
  const merge = await git.getConfig({ ...opts, path: `branch.${branch}.merge` });
  if (!remaining[1] && merge && merge !== `refs/heads/${branch}`) throw new Error('This branch tracks a differently named remote branch. Specify a branch explicitly; custom refspecs are not supported.');
  return { remote, branch, url, upstream };
}
export async function pushBranch(opts, target, token, proxy = `${location.origin}/api/git`) {
  // The secret is held only for this request, never in Git config or terminal output.
  const authorization = `Basic ${btoa(`x-access-token:${token}`)}`;
  await git.push({ ...opts, http, url: target.url, remote: target.remote, ref: target.branch, remoteRef: target.branch, corsProxy: proxy, headers: { Authorization: authorization } });
  if (target.upstream) {
    try {
      await git.setConfig({ ...opts, path: `branch.${target.branch}.remote`, value: target.remote });
      await git.setConfig({ ...opts, path: `branch.${target.branch}.merge`, value: `refs/heads/${target.branch}` });
    } catch { return { upstreamSaved: false }; }
  }
  return { upstreamSaved: true };
}
