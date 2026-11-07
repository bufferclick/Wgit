// A small Node-style filesystem adapter backed by the File System Access API.
// All paths are scoped to the directory the user explicitly selected.
export function nativeFS(root) {
  const error = (code, path) => Object.assign(new Error(`${code}: ${path}`), { code });
  function parts(path) {
    if (typeof path !== 'string') throw error('ENOENT', String(path));
    const result = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!result.length) throw error('EACCES', path); result.pop(); }
      else result.push(part);
    }
    if (result[0] === 'workspace') result.shift();
    else if (result.length) throw error('EACCES', path);
    return result;
  }
  async function directory(path, create = false) {
    let handle = root;
    try { for (const part of parts(path)) handle = await handle.getDirectoryHandle(part, { create }); }
    catch (e) { throw error(e.name === 'TypeMismatchError' ? 'ENOTDIR' : e.name === 'NotAllowedError' ? 'EACCES' : 'ENOENT', path); }
    return handle;
  }
  async function parent(path) {
    const p = parts(path), name = p.pop();
    if (!name) throw error('EISDIR', path);
    return [await directory('/workspace/' + p.join('/')), name];
  }
  async function file(path, create = false) {
    const [dir, name] = await parent(path);
    try { return await dir.getFileHandle(name, { create }); }
    catch (e) { throw error(e.name === 'TypeMismatchError' ? 'EISDIR' : e.name === 'NotAllowedError' ? 'EACCES' : 'ENOENT', path); }
  }
  async function stat(path) {
    try {
      const handle = await file(path), f = await handle.getFile();
      return { type: 'file', mode: 0o100644, size: f.size, mtimeMs: f.lastModified, ctimeMs: f.lastModified, mtime: new Date(f.lastModified), ctime: new Date(f.lastModified), isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
    } catch (e) {
      if (!['ENOENT', 'EISDIR'].includes(e.code)) throw e;
      await directory(path);
      return { type: 'dir', mode: 0o040000, size: 0, mtimeMs: 0, ctimeMs: 0, mtime: new Date(0), ctime: new Date(0), isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false };
    }
  }
  const fs = {
    async readFile(path, options) {
      const data = await (await file(path)).getFile();
      const encoding = typeof options === 'string' ? options : options?.encoding;
      return encoding ? data.text() : new Uint8Array(await data.arrayBuffer());
    },
    async writeFile(path, data) {
      const handle = await file(path, true), writable = await handle.createWritable();
      await writable.write(typeof data === 'string' ? data : new Uint8Array(data));
      await writable.close();
    },
    async mkdir(path) {
      const [dir, name] = await parent(path);
      try { await dir.getDirectoryHandle(name); throw error('EEXIST', path); }
      catch (e) { if (e.code === 'EEXIST') throw e; if (e.name === 'TypeMismatchError') throw error('EEXIST', path); if (e.name !== 'NotFoundError') throw e; }
      await dir.getDirectoryHandle(name, { create: true });
    },
    async readdir(path) { const names = []; for await (const name of (await directory(path)).keys()) names.push(name); return names; },
    async unlink(path) { const [dir, name] = await parent(path); try { await dir.removeEntry(name); } catch (e) { throw error(e.name === 'NotFoundError' ? 'ENOENT' : 'EACCES', path); } },
    async rmdir(path) { const [dir, name] = await parent(path); try { await dir.removeEntry(name); } catch (e) { throw error(e.name === 'NotFoundError' ? 'ENOENT' : 'EACCES', path); } },
    stat, lstat: stat,
    async readlink(path) { throw error('EINVAL', path); },
    async symlink(_target, path) { throw error('ENOTSUP', path); }
  };
  return { promises: fs };
}
