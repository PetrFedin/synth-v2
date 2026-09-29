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
  const actionsSource = sourceBetween('function retailDoorActions(door) {', '\nfunction retailDoorForm()');
  const activeSource = sourceBetween(
    "if (door.status === 'active') {",
    "} else if (door.status === 'inactive') {",
    actionsSource,
  );
  assert.match(activeSource, /retailDoorEditForm\(door\)/);
  assert.match(activeSource, /\/deactivate/);
});

test('inactive retail doors expose reactivation without a backend-rejected edit action', () => {
  const actionsSource = sourceBetween('function retailDoorActions(door) {', '\nfunction retailDoorForm()');
  const inactiveSource = sourceBetween(
    "} else if (door.status === 'inactive') {",
    '\n  }\n  return actions;',
    actionsSource,
  );
  assert.match(inactiveSource, /\/reactivate/);
  assert.match(inactiveSource, /expectedVersion: door\.version/);
  assert.doesNotMatch(inactiveSource, /retailDoorEditForm/);
  assert.doesNotMatch(inactiveSource, /\/deactivate/);
});
