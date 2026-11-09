// Import a user-selected folder as an isolated browser workspace. Never touch
// the source folder or copy Git metadata; it may be incomplete or sensitive.
const MAX_FILES = 10000;
const MAX_BYTES = 250 * 1024 * 1024;
export async function importFolderCopy(fs, files, progress = () => {}) {
  const entries = [], names = new Set(); let root = '', bytes = 0, excludedGit = 0;
  for (const file of files) {
    const path = file.webkitRelativePath;
    if (typeof path !== 'string') throw new Error('The browser did not provide folder paths.');
    const parts = path.split('/');
    if (parts.length < 2 || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\') || p.includes('\0'))) throw new Error('Invalid folder path. No workspace was opened.');
    if (!root) root = parts[0];
    if (parts[0] !== root) throw new Error('Select a single folder.');
    if (parts.slice(1).some(p => p.toLowerCase() === '.git')) { excludedGit++; continue; }
    const relative = parts.slice(1).join('/');
    if (names.has(relative)) throw new Error('Duplicate file paths in the selected folder.');
    names.add(relative);
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error('Invalid file size.');
    bytes += file.size;
    if (entries.length >= MAX_FILES || bytes > MAX_BYTES) throw new Error('Folder copy limit: 10,000 files and 250 MiB. No workspace was opened.');
    entries.push({ file, parts:parts.slice(1) });
  }
  if (!root || !entries.length) throw new Error('No files were selected. Empty folders cannot be imported.');
  const p = fs.promises;
  await p.mkdir('/workspace');
  const dirs = new Set(['/workspace']);
  for (const [index, {file, parts}] of entries.entries()) {
    let dir = '/workspace';
    for (const part of parts.slice(0,-1)) { dir += '/' + part; if (!dirs.has(dir)) { await p.mkdir(dir); dirs.add(dir); } }
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.length !== file.size) throw new Error('A selected file changed during import. Try again.');
    await p.writeFile(`${dir}/${parts.at(-1)}`, data);
    progress(index + 1, entries.length);
  }
  return { name:root, files:entries.length, bytes, excludedGit };
}
