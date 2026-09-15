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

async function verify() {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      for (const [pathname, marker] of checks) {
        const url = new URL(pathname, base);
        url.searchParams.set('verify', String(Date.now()));
        const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
        if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
        const text = await response.text();
        if (!text.includes(marker)) throw new Error(`${pathname} missing marker ${marker}`);
      }
      console.log(`STATIC_PUBLIC_VERIFIED ${base}`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`STATIC_VERIFY_RETRY ${attempt}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError || new Error('Static public verification failed');
}

await verify();

const port = Number(process.env.PORT || 4100);
createServer((_req, res) => {
  res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({status:'ok',verified:base}));
}).listen(port, '0.0.0.0', () => console.log(`static verifier listening on ${port}`));
