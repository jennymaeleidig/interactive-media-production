// SPDX-License-Identifier: CC0-1.0
// Inspect inlined video payloads in a captured page (ticket-12 CDN-video probe).
import fs from 'node:fs';

const file = process.argv[2];
const h = fs.readFileSync(file, 'utf8');
const marker = /data:video\/[a-z0-9]+;base64,/g;
const base64 = /^[A-Za-z0-9+/=]+/;
let m;
let n = 0;
let total = 0;
const sizes = [];
while ((m = marker.exec(h))) {
  const rest = h.slice(m.index + m[0].length);
  const b64 = base64.exec(rest)?.[0] ?? '';
  n++;
  total += b64.length;
  sizes.push(b64.length);
}
console.log('file MB', (h.length / 1048576).toFixed(1));
console.log('data:video count', n, 'payload MB (b64 chars/1048576)', (total / 1048576).toFixed(1));
console.log('sizes MB', sizes.map((s) => (s / 1048576).toFixed(2)).join(', '));
const remote = h.match(/https:\/\/cdn\.prod\.website-files\.com[^"'\s>]*\.mp4/g) || [];
console.log('remote mp4 refs', remote.length, [...new Set(remote)].join('\n  '));
