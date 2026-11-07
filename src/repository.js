import * as git from 'isomorphic-git';

// A repository can be left half-created if a browser blocks a write during init.
// Never treat a missing HEAD as a valid repository or overwrite non-empty data.
export async function repositoryState(fs, dir) {
  const path = `${dir}/.git`;
  let stat;
  try { stat = await fs.promises.stat(path); }
  catch (error) { if (error.code === 'ENOENT') return 'absent'; throw error; }
  if (!stat.isDirectory()) return 'unsupported';
  const names = await fs.promises.readdir(path);
  if (!names.length) return 'empty';
  async function hasFile(name) {
    try { return (await fs.promises.stat(`${path}/${name}`)).isFile(); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  return await hasFile('HEAD') && await hasFile('config') ? 'ready' : 'incomplete';
}

export const incompleteMessage = 'The .git folder is incomplete. Wgit will not overwrite it. Inspect or back it up using a native Git client before retrying.';

export async function initRepository(fs, dir) {
  const state = await repositoryState(fs, dir);
  if (state === 'ready') throw new Error('This folder is already a Git repository.');
  if (state === 'unsupported') throw new Error('This folder uses a .git file; linked worktrees are not supported by Wgit.');
  if (state === 'incomplete') throw new Error(incompleteMessage);

  // isomorphic-git creates an empty hooks directory even though it never uses
  // hooks. Chromium may prohibit creating .git/hooks. Skip exactly this optional
  // mkdir, not other security errors, so the repository remains a normal Git
  // repository on disk and all other writes follow the browser's permissions.
  const original = fs.promises;
  const initFs = { promises: new Proxy(original, {
    get(target, prop) {
      if (prop === 'mkdir') return (path, ...args) => path === `${dir}/.git/hooks` ? Promise.resolve() : target.mkdir(path, ...args);
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  }) };
  await git.init({ fs: initFs, dir, defaultBranch: 'main' });
  if (await repositoryState(fs, dir) !== 'ready') throw new Error(incompleteMessage);
}
