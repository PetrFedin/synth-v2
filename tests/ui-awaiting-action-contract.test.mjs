import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [script, html, handler] = await Promise.all([read('public/modules/awaiting-action.js'), read('public/index.html'), read('src/web/static-handler.mjs')]);

test('the awaiting-action screen is loaded and served', () => {
  assert.match(html, /<script defer src="\/ui\/awaiting-action\.js\?v=[^"]+"><\/script>/);
  // A script that is in index.html but not in the served set answers 404 and the screen silently
  // never appears: both lists must name it.
  assert.match(handler, /'\/ui\/awaiting-action\.js': \['modules\/awaiting-action\.js'/);
  assert.ok(html.indexOf('/ui/awaiting-action.js') > html.indexOf('/ui/omnidata-workspace.js'), 'it extends the workspace, so it loads after it');
});

test('the screen reads one endpoint and the counter is the cheap form of it', () => {
  assert.match(script, /\/v2\/inbox\/awaiting-action\?/);
  assert.match(script, /limit: '0'/, 'the badge asks for counters only');
  assert.match(script, /limit: '200'/);
  assert.doesNotMatch(script, /mutate\(/, 'the list has no write path of its own');
});

test('it carries no capability logic: the server decides what a role may see', () => {
  assert.doesNotMatch(script, /roleHasCapability|CAPABILITIES|capabilities|state\.role/);
});

test('it offers a badge in the top bar and the navigation, a type filter and a link to the owning screen', () => {
  assert.match(script, /data-awaiting-action-host|awaitingActionHost/);
  assert.match(script, /topbar-actions/);
  assert.match(script, /\.sidebar \.nav/);
  assert.match(script, /typeFilter/);
  assert.match(script, /state\.view = item\.route\.view/);
  assert.match(script, /OD_UI\.tabs\['awaiting-action'\]/, 'family tabs');
});

test('the polling stops with the session and a failed badge read never blocks work', () => {
  assert.match(script, /clearInterval\(ui\.timer\)/);
  assert.match(script, /document\.hidden/);
  assert.match(script, /catch \(error\) \{\s*\/\/[^\n]*\n\s*ui\.checkedFor = id;/);
});
