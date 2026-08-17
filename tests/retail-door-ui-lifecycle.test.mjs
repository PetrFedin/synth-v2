import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/modules/retail-doors.js', import.meta.url), 'utf8');

function sourceBetween(startMarker, endMarker, from = source) {
  const start = from.indexOf(startMarker);
  const end = from.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return from.slice(start, end);
}

test('active retail doors expose edit and deactivate actions', () => {
  const entitySource = sourceBetween('function retailDoorEntity(shop, door) {', '\nfunction retailDoorCreateForm(shops)');
  const activeSource = sourceBetween(
    "if (canManage && door.status === 'active') {",
    "} else if (canManage && door.status === 'inactive') {",
    entitySource,
  );
  assert.match(activeSource, /retailDoorEditForm\(door\)/);
  assert.match(activeSource, /\/deactivate/);
});

test('inactive retail doors expose reactivation without a backend-rejected edit action', () => {
  const entitySource = sourceBetween('function retailDoorEntity(shop, door) {', '\nfunction retailDoorCreateForm(shops)');
  const inactiveSource = sourceBetween(
    "} else if (canManage && door.status === 'inactive') {",
    '\n  }\n  return entity(',
    entitySource,
  );
  assert.match(inactiveSource, /\/reactivate/);
  assert.match(inactiveSource, /expectedVersion: door\.version/);
  assert.doesNotMatch(inactiveSource, /retailDoorEditForm/);
  assert.doesNotMatch(inactiveSource, /\/deactivate/);
});
