import { createServer } from 'node:http';
import process from 'node:process';

const base = 'https://synth-v2-app.netlify.app/';
const required = [
  'SYNTHA V2',
  'Fashion Operating System',
  'Commercial pipeline',
  'Wool Double-Breasted Coat',
  'Main Collection FW26',
  'DealSpace',
  'Product & PLM',
  'Public Review Build',
];

async function verify() {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const url = new URL(base);
      url.searchParams.set('verify', `${Date.now()}-${attempt}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url, {
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'user-agent': 'Syntha-V2-independent-public-verifier/1.0' },
        });
      } finally {
        clearTimeout(timer);
      }
      if (response.status !== 200) throw new Error(`root returned ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) throw new Error(`unexpected content-type ${contentType}`);
      const html = await response.text();
      for (const marker of required) {
        if (!html.includes(marker)) throw new Error(`missing marker ${marker}`);
      }
      if (!html.includes('name="viewport"')) throw new Error('viewport meta missing');
      if (/<script\b[^>]*\bsrc\s*=/i.test(html)) throw new Error('external script dependency detected');
      if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html)) throw new Error('external stylesheet dependency detected');
      const bytes = Buffer.byteLength(html);
      if (bytes < 10000) throw new Error(`page too small: ${bytes}`);
      console.log(`NETLIFY_SAFE_PUBLIC_VERIFIED ${base} status=200 bytes=${bytes} standalone=true viewport=true markers=${required.length}`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`NETLIFY_SAFE_VERIFY_RETRY ${attempt}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError || new Error('Netlify public verification failed');
}

await verify();

const port = Number(process.env.PORT || 4100);
createServer((_req, res) => {
  res.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({status:'ok',verified:base,standalone:true}));
}).listen(port, '0.0.0.0', () => console.log(`independent verifier listening on ${port}`));
