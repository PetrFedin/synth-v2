import { createServer } from 'node:http';
import process from 'node:process';

const base = 'https://synth-v2-cdn.onrender.com';
const checks = [
  ['/', 'SYNTHA V2'],
  ['/health', 'single-js-single-css'],
  ['/app.js', 'SYNTHA_PREVIEW_WORKSPACE'],
  ['/app.js', 'SynthaStrictLocaleAudit'],
  ['/app.css', '.shell'],
];

for (const [pathname, marker] of checks) {
  const response = await fetch(new URL(pathname, base), { redirect: 'follow' });
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  const text = await response.text();
  if (!text.includes(marker)) throw new Error(`${pathname} missing marker ${marker}`);
}

console.log(`STATIC_PUBLIC_VERIFIED ${base}`);

const port = Number(process.env.PORT || 4100);
createServer((_req, res) => {
  res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({status:'ok',verified:base}));
}).listen(port, '0.0.0.0', () => console.log(`static verifier listening on ${port}`));
