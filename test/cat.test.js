import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTextFile, MAX_CAT_BYTES } from '../src/cat.js';
const fsFor = data => ({ promises: { stat: async () => ({ size: data.length, isFile: () => true }), readFile: async () => data } });
test('cat reads UTF-8 without changing text, whitespace or markup', async () => {
  const text = '# Hello\n  <script>alert(1)</script>\n\tHej 🌿\n';
  assert.equal(await readTextFile(fsFor(new TextEncoder().encode(text)), '/workspace/README.md'), text);
  assert.equal(await readTextFile(fsFor(new Uint8Array()), '/workspace/empty.txt'), '');
});
test('cat rejects files outside the workspace, directories, large and binary files', async () => {
  await assert.rejects(readTextFile(fsFor(new Uint8Array()), '/outside/file'), /outside the selected folder/);
  await assert.rejects(readTextFile(fsFor(new Uint8Array()), '/workspace/../outside'), /outside the selected folder/);
  await assert.rejects(readTextFile({ promises: { stat: async () => ({ isFile: () => false }) } }, '/workspace/folder'), /Not a file/);
  await assert.rejects(readTextFile(fsFor(new Uint8Array(MAX_CAT_BYTES + 1)), '/workspace/big'), /1 MiB/);
  await assert.rejects(readTextFile(fsFor(new Uint8Array([0, 97])), '/workspace/file'), /binary/);
  await assert.rejects(readTextFile(fsFor(new Uint8Array([255, 254])), '/workspace/file'), /UTF-8/);
});
