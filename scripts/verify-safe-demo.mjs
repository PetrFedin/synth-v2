import process from 'node:process';

process.env.NODE_OPTIONS = '';
const url = process.env.SYNTHA_VERIFY_URL || 'https://synth-v2-app.netlify.app/';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: controller.signal,
    headers: { 'user-agent': 'Syntha-V2-public-verifier/1.0' },
  });
  if (response.status !== 200) throw new Error(`root returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) throw new Error(`unexpected content-type: ${contentType}`);
  const html = await response.text();
  const required = [
    'SYNTHA V2',
    'Fashion Operating System',
    'Commercial pipeline',
    'Wool Double-Breasted Coat',
    'Main Collection FW26',
    'DealSpace',
    'Product & PLM',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`missing marker: ${marker}`);
  }
  if (!html.includes('name="viewport"')) throw new Error('viewport meta missing');
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) throw new Error('external JavaScript dependency detected');
  if (/<link\b[^>]*rel=["']stylesheet["']/i.test(html)) throw new Error('external stylesheet dependency detected');
  if (/https?:\/\//i.test(html.replace(/https?:\/\/schema\.org/gi, ''))) throw new Error('external URL dependency detected');
  const bytes = Buffer.byteLength(html);
  if (bytes < 10000) throw new Error(`page unexpectedly small: ${bytes} bytes`);
  console.log(`SAFE_DEMO_VERIFIED ${url} status=200 bytes=${bytes} standalone=true mobileViewport=true markers=${required.length}`);
} finally {
  clearTimeout(timer);
}
