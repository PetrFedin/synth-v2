import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = path.resolve(root, '.github', 'workflows', 'import-syntha-v2.yml');
const forbidden = [
  new RegExp(['fire', 'base'].join(''), 'i'),
  new RegExp(['_ai-share', 'synth-1-full'].join('/'), 'i'),
];
const files = await collect(root);
files.push(workflow);
const violations = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const pattern of forbidden) if (pattern.test(text)) violations.push(`${path.relative(root, file)}: ${pattern}`);
}
if (violations.length) {
  console.error(`Syntha V2 isolation violated:\n${violations.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}
console.log(`Syntha V2 isolation OK (${files.length} files checked).`);

async function collect(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(target));
    else if (/\.(mjs|js|json|md|sql|ya?ml|example)$/.test(entry.name) || entry.name === 'Dockerfile') output.push(target);
  }
  return output;
}
