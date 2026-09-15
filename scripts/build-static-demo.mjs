import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'public');
const distDir = path.join(repoRoot, 'dist');

const source = await readFile(path.join(publicDir, 'index.html'), 'utf8');
if (!source.includes('Syntha - Fashion Operating System')) throw new Error('Unexpected public/index.html');

const cssRefs = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?#]+)[^"]*"[^>]*>/g)].map(match => match[1]);
const jsRefs = [...source.matchAll(/<script[^>]+src="([^"?#]+)[^"]*"[^>]*><\/script>/g)].map(match => match[1]);

async function readRef(ref) {
  const target = path.join(publicDir, ref.replace(/^\//, ''));
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing asset: ${ref}`);
  return readFile(target, 'utf8');
}

const cssParts = [];
for (const ref of cssRefs) cssParts.push(`/* ${ref} */\n${await readRef(ref)}`);

const compatibility = `
(function installSynthaCompatibility(global){
  if (typeof global.structuredClone !== 'function') {
    global.structuredClone = function(value){ return JSON.parse(JSON.stringify(value)); };
  }
  if (global.crypto && typeof global.crypto.randomUUID !== 'function' && typeof global.crypto.getRandomValues === 'function') {
    global.crypto.randomUUID = function(){
      const bytes = new Uint8Array(16); global.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
      return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    };
  }
})(globalThis);
`;

const jsParts = [compatibility];
for (const ref of jsRefs) {
  const code = await readRef(ref);
  new vm.Script(code, { filename: ref });
  jsParts.push(`\n/* ${ref} */\n${code}\n;`);
}
const bundledJs = jsParts.join('\n');
new vm.Script(bundledJs, { filename: 'app.js' });

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#353945">
  <meta name="syntha-build" content="static-cdn-20260916-1">
  <title>Syntha V2 — Fashion Operating System</title>
  <style>
    html,body{margin:0;min-height:100%;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222}
    #syntha-boot{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    #syntha-boot-card{width:min(520px,100%);background:#fff;border:1px solid #e4e6eb;border-radius:18px;padding:28px;box-sizing:border-box;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    #syntha-boot-title{font-size:28px;font-weight:700;letter-spacing:.02em;margin:0 0 8px}
    #syntha-boot-copy{margin:0;color:#6b7280;font-size:15px;line-height:1.5}
    #syntha-boot-error{display:none;margin-top:14px;padding:12px;border-radius:10px;background:#fff4f4;color:#991b1b;font-size:13px;line-height:1.45}
  </style>
  <link rel="stylesheet" href="/app.css?v=20260916-1">
  <script>
    window.addEventListener('error', function(event){
      var box=document.getElementById('syntha-boot-error');
      if(box){box.style.display='block';box.textContent='Ошибка запуска интерфейса: '+(event.message||'неизвестная ошибка');}
    });
    window.setTimeout(function(){
      if(!document.querySelector('.shell')){
        var box=document.getElementById('syntha-boot-error');
        if(box){box.style.display='block';box.textContent='Интерфейс загружается дольше ожидаемого. Обновите страницу один раз.';}
      }
    },12000);
  </script>
</head>
<body>
  <div id="app" aria-live="polite">
    <div id="syntha-boot"><div id="syntha-boot-card"><div id="syntha-boot-title">SYNTHA V2</div><p id="syntha-boot-copy">Загрузка Fashion Operating System…</p><div id="syntha-boot-error"></div></div></div>
  </div>
  <noscript>Для запуска SYNTHA V2 требуется JavaScript.</noscript>
  <script defer src="/app.js?v=20260916-1"></script>
</body>
</html>`;

await mkdir(distDir, { recursive: true });
await Promise.all([
  writeFile(path.join(distDir, 'index.html'), html, 'utf8'),
  writeFile(path.join(distDir, 'app.css'), cssParts.join('\n\n'), 'utf8'),
  writeFile(path.join(distDir, 'app.js'), bundledJs, 'utf8'),
  writeFile(path.join(distDir, 'health'), JSON.stringify({status:'ok',mode:'static-cdn',bundle:'single-js-single-css'}), 'utf8'),
  writeFile(path.join(distDir, '_headers'), '/\n  Cache-Control: no-store\n/app.js\n  Content-Type: text/javascript; charset=utf-8\n  Cache-Control: public, max-age=300\n/app.css\n  Content-Type: text/css; charset=utf-8\n  Cache-Control: public, max-age=300\n', 'utf8'),
]);

console.log(`STATIC_DEMO_BUILT css=${cssParts.join('\n\n').length} js=${bundledJs.length} scripts=${jsRefs.length} styles=${cssRefs.length}`);
