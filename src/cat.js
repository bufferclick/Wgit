// Keep the terminal responsive and avoid rendering binary files as text.
export const MAX_CAT_BYTES = 1024 * 1024;
export async function readTextFile(fs, path) {
  if (typeof path !== 'string' || (path !== '/workspace' && !path.startsWith('/workspace/')) || path.split('/').some(part => part === '..' || part === '.')) throw new Error('Path is outside the selected folder.');
  const stat = await fs.promises.stat(path);
  if (!stat.isFile()) throw new Error('Not a file.');
  if (stat.size > MAX_CAT_BYTES) throw new Error('File is larger than the 1 MiB display limit.');
  const data = await fs.promises.readFile(path);
  if (typeof data === 'string') {
    if (new TextEncoder().encode(data).length > MAX_CAT_BYTES) throw new Error('File is larger than the 1 MiB display limit.');
    if (data.includes('\0')) throw new Error('This appears to be a binary file. cat supports UTF-8 text only.');
    return data;
  }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength > MAX_CAT_BYTES) throw new Error('File is larger than the 1 MiB display limit.');
  if (bytes.includes(0)) throw new Error('This appears to be a binary file. cat supports UTF-8 text only.');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('This is not valid UTF-8 text. cat cannot display binary files.'); }
}
