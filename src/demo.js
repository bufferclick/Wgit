// Bundle a public snapshot of Wgit's source, not the user's local files or .git.
// Only the explicit source paths below are included; hidden files and secrets are not discovered.
const files = import.meta.glob([
  '../.gitignore', '../README.md', '../index.html', '../favicon.svg', '../package.json', '../package-lock.json', '../vite.config.js',
  '../src/*.{js,css}', '../functions/api/*.js', '../functions/api/git/*.js',
  '../supabase/functions/community/*.ts', '../supabase/migrations/*.sql',
  '../test/*.js', '../browser-tests/*.mjs'
], { query: '?raw', import: 'default' });

export async function openDemo(fs) {
  const p = fs.promises;
  try { await p.mkdir('/workspace'); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  // A marker is written only after every file is seeded. Existing files are never overwritten.
  try { await p.stat('/.wgit-demo-seeded'); return; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const [source, load] of Object.entries(files)) {
    const path = '/workspace/' + (source.startsWith('./') ? 'src/' + source.slice(2) : source.replace(/^\.\.\//, ''));
    const parts = path.split('/').slice(1, -1); let dir = '';
    for (const part of parts) { dir += '/' + part; try { await p.mkdir(dir); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
    try { await p.stat(path); } catch (e) { if (e.code !== 'ENOENT') throw e; await p.writeFile(path, await load()); }
  }
  await p.writeFile('/.wgit-demo-seeded', 'Wgit demo source snapshot\n');
}
