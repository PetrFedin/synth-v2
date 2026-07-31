import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'public', 'index.html');
const index = await readFile(indexPath);
assertAscii(index, indexPath);
const html = index.toString('ascii');
const sources = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]);
if (sources.length < 10 || sources.at(-1) !== '/ui/app-start.js' || sources.includes('/app.js')) {
  console.error('Standalone UI script order is invalid.');
  process.exit(1);
}
for (const source of sources) {
  if (!source.startsWith('/ui/')) throw new Error(`Unexpected script path: ${source}`);
  const file = path.join(root, 'public', 'modules', path.basename(source));
  const bytes = await readFile(file);
  assertAscii(bytes, file);
  new vm.Script(bytes.toString('ascii'), { filename: file });
}
console.log(`Standalone UI contract OK (${sources.length} scripts checked).`);

function assertAscii(buffer, file) {
  if ([...buffer].some((byte) => byte > 127)) {
    console.error(`Non-ASCII source detected: ${path.relative(root, file)}`);
    process.exit(1);
  }
}
