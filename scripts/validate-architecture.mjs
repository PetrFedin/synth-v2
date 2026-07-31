import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = path.join(root, 'src');
const files = await collect(srcRoot);
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const importerModule = moduleName(file);
  for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), specifier);
    const targetModule = moduleName(resolved);
    if (!importerModule || !targetModule || importerModule === targetModule) continue;
    if (!resolved.endsWith(`${path.sep}public.mjs`)) {
      violations.push(`${path.relative(root, file)} imports private module path ${specifier}`);
    }
  }
}

if (violations.length) {
  console.error('Architecture boundary violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Architecture boundaries OK (${files.length} source files checked).`);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? collect(full) : [full];
  }));
  return nested.flat().filter((file) => file.endsWith('.mjs'));
}

function moduleName(file) {
  const relative = path.relative(srcRoot, file).split(path.sep);
  return relative[0] === 'modules' && relative.length > 1 ? relative[1] : null;
}
