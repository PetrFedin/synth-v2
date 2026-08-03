import { readFile, writeFile } from 'node:fs/promises';

export async function edit(path, transform) {
  const source = await readFile(path, 'utf8');
  const updated = transform(source);
  if (updated === source) throw new Error(`${path}: patch produced no change`);
  await writeFile(path, updated, 'utf8');
  console.log(`updated ${path}`);
}

export function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: expected source fragment was not found`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`${label}: source fragment is not unique`);
  return `${source.slice(0, first)}${replacement}${source.slice(first + search.length)}`;
}

export function replaceRegexOnce(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one match, found ${matches.length}`);
  return source.replace(pattern, replacement);
}
