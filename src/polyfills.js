// isomorphic-git's browser ESM build uses the Node Buffer global at runtime.
// Vite resolves imports of "buffer" but does not provide this global itself.
import { Buffer } from 'buffer';
if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = Buffer;
