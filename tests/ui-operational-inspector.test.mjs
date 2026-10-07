import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(p)=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [script,html,handler,css]=await Promise.all([read('public/modules/operational-inspector.js'),read('public/index.html'),read('src/web/static-handler.mjs'),read('public/operational-inspector.css')]);
test('shared operational inspector is loaded and served',()=>{assert.match(html,/\/operational-inspector\.css/);assert.match(html,/\/ui\/operational-inspector\.js/);assert.match(handler,/operational-inspector\.css/);assert.match(handler,/operational-inspector\.js/);assert.ok(css.length>500);});
test('inspector reads the contextual projection and writes only collaboration authority',()=>{assert.match(script,/\/v2\/operational\/entities\//);assert.match(script,/\/v2\/operational\/threads/);assert.match(script,/\/v2\/operational\/decisions/);assert.doesNotMatch(script,/\/v2\/products\/.+method/);});
test('inspector exposes one shared entry contract',()=>{assert.match(script,/SynthaOperationalInspector=Object\.freeze\(\{open,close,refresh,mountAction\}\)/);assert.match(script,/syntha:operational-inspector/);});
