import { execFileSync } from 'node:child_process';
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

await validateMasterSpecificationSynchronization(violations);

if (violations.length) {
  console.error('Architecture boundary/specification violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}
console.log(`Architecture boundaries OK (${files.length} source files checked).`);

async function validateMasterSpecificationSynchronization(target) {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.GITHUB_EVENT_PATH) {
    console.log('Master specification sync diff check skipped outside GitHub Actions.');
    return;
  }

  let event;
  try {
    event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch (error) {
    target.push(`cannot read GitHub event payload for master specification synchronization: ${error.message}`);
    return;
  }

  const baseSha = event?.pull_request?.base?.sha || event?.before || '';
  if (!baseSha || /^0+$/.test(baseSha)) {
    console.log('Master specification sync diff check skipped because no usable base SHA is available.');
    return;
  }

  try {
    execFileSync('git', ['cat-file', '-e', `${baseSha}^{commit}`], { cwd: root, stdio: 'ignore' });
  } catch {
    target.push(`master specification sync cannot inspect base commit ${baseSha}; CI checkout must retain repository history`);
    return;
  }

  let changedFiles;
  try {
    changedFiles = execFileSync('git', ['diff', '--name-only', `${baseSha}..HEAD`, '--'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch (error) {
    target.push(`cannot compute governed change set for master specification synchronization: ${error.message}`);
    return;
  }

  if (!changedFiles.length) {
    console.log('Master specification sync: no changed files detected.');
    return;
  }

  const governedChanges = changedFiles.filter(isGovernedArchitectureSurface);
  if (!governedChanges.length) {
    console.log('Master specification sync: no governed product/runtime surfaces changed.');
    return;
  }

  if (!changedFiles.includes('ARCHITECTURE.md')) {
    target.push(
      'ARCHITECTURE.md must change in the same PR/push as governed product/runtime changes. ' +
      `Governed files: ${governedChanges.join(', ')}`,
    );
    return;
  }

  console.log(`Master specification sync OK (${governedChanges.length} governed changed file(s)).`);
}

function isGovernedArchitectureSurface(file) {
  if (file === 'ARCHITECTURE.md') return false;
  if (file === 'package.json' || file === 'package-lock.json') return true;
  if (file === '.env.example' || file === 'docker-compose.yml') return true;

  const prefixes = [
    'src/',
    'public/',
    'db/migrations/',
    'scripts/',
    'ops/',
    'mdm/',
    '.github/workflows/',
    'docs/architecture/',
    'docs/fashion-kpi/',
  ];
  if (prefixes.some((prefix) => file.startsWith(prefix))) return true;

  return [
    'docs/omnidata-design-system-v1.md',
    'docs/commercial-execution-spine.md',
    'docs/commercial-publication-linesheets.md',
    'docs/observability.md',
  ].includes(file);
}

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
