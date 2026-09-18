import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'ops/type-baseline.json');
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

const tsc = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const run = spawnSync(tsc, ['-p', path.join(root, 'tsconfig.json')], { cwd: root, encoding: 'utf8' });
if (run.error) {
  console.error(`Type check could not run: ${run.error.message}. Did you run "npm ci"?`);
  process.exit(1);
}

const current = new Map();
for (const line of `${run.stdout ?? ''}`.split('\n')) {
  const match = ERROR_LINE.exec(line.trim());
  if (!match) continue;
  const file = match[1].split(path.sep).join('/');
  current.set(file, (current.get(file) ?? 0) + 1);
}

// tsc reports nothing on stdout when it fails for a non-type reason; treat that as fatal rather
// than as a clean run, so a broken toolchain cannot look like success.
if (run.status !== 0 && current.size === 0) {
  console.error(`Type check failed without reporting type errors (exit ${run.status}).`);
  console.error(`${run.stdout ?? ''}${run.stderr ?? ''}`.trim().slice(0, 2000));
  process.exit(1);
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));

if (process.argv.includes('--update')) {
  const next = Object.fromEntries([...current.entries()].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(baselinePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`Type baseline updated: ${current.size} file(s), ${total(current)} error(s).`);
  process.exit(0);
}

const regressions = [];
const improvements = [];
for (const [file, count] of current) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) regressions.push(`${file}: ${count} type error(s), baseline allows ${allowed}`);
}
for (const [file, allowed] of Object.entries(baseline)) {
  const count = current.get(file) ?? 0;
  if (count < allowed) improvements.push(`${file}: ${count} type error(s), baseline still allows ${allowed}`);
}

if (regressions.length) {
  console.error('New type errors against the recorded baseline:\n' + regressions.map((item) => `- ${item}`).join('\n'));
  console.error('\nFix them, or run "npm run validate:types -- --update" only when the baseline legitimately changes.');
  process.exit(1);
}

if (improvements.length) {
  console.error('Type baseline is stale — these files improved and must be re-recorded:\n' + improvements.map((item) => `- ${item}`).join('\n'));
  console.error('\nRun "npm run validate:types -- --update" to ratchet the baseline down.');
  process.exit(1);
}

console.log(`Type contract OK (${total(current)} known error(s) across ${current.size} file(s); no regression).`);

function total(counts) { return [...counts.values()].reduce((sum, value) => sum + value, 0); }
