import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(repoRoot, 'public');
const outDir = path.join(repoRoot, 'dist-public-demo');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(publicDir, outDir, { recursive: true });

const source = await readFile(path.join(publicDir, 'index.html'), 'utf8');
if (!source.includes('Syntha - Fashion Operating System')) throw new Error('Unexpected public/index.html');

const cssRefs = [...source.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"?#]+)[^"]*"[^>]*>/g)].map(match => match[1]);
const jsRefs = [...source.matchAll(/<script[^>]+src="([^"?#]+)[^"]*"[^>]*><\/script>/g)].map(match => match[1]);

async function resolveAsset(ref) {
  const clean = ref.replace(/^\//, '');
  const target = path.join(publicDir, clean);
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw new Error(`Missing public asset: ${ref}`);
  return target;
}

const cssParts = [];
for (const ref of cssRefs) {
  const file = await resolveAsset(ref);
  cssParts.push(`/* ${ref} */\n${await readFile(file, 'utf8')}`);
}

const jsParts = [];
for (const ref of jsRefs) {
  const file = await resolveAsset(ref);
  const code = await readFile(file, 'utf8');
  new vm.Script(code, { filename: ref });
  jsParts.push(`\n/* ${ref} */\n${code}\n;`);
}

const css = cssParts.join('\n\n');
const js = jsParts.join('\n');
if (css.length < 5000) throw new Error('Bundled CSS unexpectedly small');
if (!js.includes('SYNTHA_PREVIEW_WORKSPACE')) throw new Error('Bundled JS missing preview workspace');
if (!js.includes('SynthaStrictLocaleAudit')) throw new Error('Bundled JS missing app startup');

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#353945">
  <meta name="syntha-build" content="netlify-mobile-bundle-20260916">
  <title>Syntha V2 — Fashion Operating System</title>
  <style>
    html,body{margin:0;min-height:100%;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#222}
    #syntha-boot{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    #syntha-boot-card{width:min(520px,100%);background:#fff;border:1px solid #e4e6eb;border-radius:18px;padding:28px;box-sizing:border-box;box-shadow:0 10px 30px rgba(0,0,0,.06)}
    #syntha-boot-title{font-size:28px;font-weight:700;letter-spacing:.02em;margin:0 0 8px}
    #syntha-boot-copy{margin:0;color:#6b7280;font-size:15px;line-height:1.5}
  </style>
  <link rel="stylesheet" href="/app.css?v=20260916-1">
</head>
<body>
  <div id="app" aria-live="polite">
    <div id="syntha-boot"><div id="syntha-boot-card"><div id="syntha-boot-title">SYNTHA V2</div><p id="syntha-boot-copy">Загрузка Fashion Operating System…</p></div></div>
  </div>
  <noscript>Для запуска SYNTHA V2 требуется JavaScript.</noscript>
  <script>
    (() => {
      const showFailure = (message) => {
        const app = document.getElementById('app');
        if (!app || app.querySelector('.shell')) return;
        app.innerHTML = '<div id="syntha-boot"><div id="syntha-boot-card"><div id="syntha-boot-title">SYNTHA V2</div><p id="syntha-boot-copy">Не удалось запустить интерфейс. ' + String(message || 'Повторите загрузку страницы.').replace(/[<>&]/g, '') + '</p></div></div>';
      };
      window.addEventListener('error', event => showFailure(event.message || 'Ошибка JavaScript.'));
      window.addEventListener('unhandledrejection', event => showFailure(event.reason?.message || 'Ошибка загрузки приложения.'));
      setTimeout(() => showFailure('Интерфейс загружается слишком долго. Обновите страницу.'), 15000);
    })();
  </script>
  <script defer src="/app.js?v=20260916-1"></script>
</body>
</html>`;

await writeFile(path.join(outDir, 'app.css'), css, 'utf8');
await writeFile(path.join(outDir, 'app.js'), js, 'utf8');
await writeFile(path.join(outDir, 'index.html'), html, 'utf8');

console.log(`PUBLIC_DEMO_BUILD_OK css=${css.length} js=${js.length} scripts=${jsRefs.length} styles=${cssRefs.length}`);
