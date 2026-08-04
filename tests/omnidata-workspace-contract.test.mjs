import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('the Syntha shell loads strict bilingual V11 after all functional workspaces',async()=>{
  const html=await source('public/index.html');
  assert.match(html,/<meta name="syntha-build" content="visual-20260804-11">/);
  for(const asset of ['/omnidata.css?v=visual-20260804-7','/industrial-product.css?v=industrial-20260803-3','/bom.css?v=industrial-20260804-1','/measurements.css?v=industrial-20260804-3','/samples.css?v=industrial-20260804-2','/omnidata-v8.css?v=visual-20260804-8','/omnidata-v8-reference.css?v=visual-20260804-8','/omnidata-v9.css?v=visual-20260804-9','/omnidata-v10.css?v=visual-20260804-10','/omnidata-v11.css?v=visual-20260804-11'])assert.ok(html.includes(asset),asset);
  const order=['/ui/i18n-runtime.js','/ui/app-core.js','/ui/planning-core.js','/ui/styles-core.js','/ui/materials-core.js','/ui/bom-core.js','/ui/measurement-core.js','/ui/sample-core.js','/ui/omnidata-workspace.js','/ui/planning.js','/ui/styles.js','/ui/materials.js','/ui/bom.js','/ui/omnidata-v7.js','/ui/linesheets.js','/ui/measurements.js','/ui/samples.js','/ui/omnidata-v8.js','/ui/omnidata-v9.js','/ui/omnidata-v10.js','/ui/omnidata-v11.js','/ui/dom-boolean-props.js','/ui/app-start.js'].map(value=>html.indexOf(value));
  assert.ok(order.every((value,index)=>value>=0&&(index===0||value>order[index-1])));
  assert.doesNotMatch(html,/\/ui\/omnidata-v4\.js|\/ui\/omnidata-v6\.js/);
});

test('the Omnidata layer provides tabs, registries and a persistent inspector',async()=>{
  const css=await source('public/omnidata.css');
  for(const selector of ['.od-tabs','.od-metrics','.od-commandbar','.od-master-detail','.od-table','.od-table-row.selected','.od-inspector','.od-inspector-tabs'])assert.match(css,new RegExp(selector.replaceAll('.','\\.')));
  assert.match(css,/position:\s*sticky/);
});

test('every current workspace is rebuilt through the Omnidata table-first system',async()=>{
  const js=await source('public/modules/omnidata-workspace.js');
  for(const primitive of ['odTabs','odMetrics','odHeader','odTable','odInspector','odRegistry','odProgress'])assert.match(js,new RegExp(`function ${primitive}\\(`));
  for(const renderer of ['renderOverview','renderCatalog','renderShowrooms','renderPartners','renderSelections','renderOrders','renderCalendar','renderNotifications'])assert.match(js,new RegExp(`function ${renderer}\\(`));
  assert.match(js,/expectedVersion:\s*item\.version/);
});

test('Linesheets remains a working V9 workspace beneath V10 and V11 visual layers',async()=>{
  const linesheets=await source('public/modules/linesheets.js');
  const installed=await source('public/modules/omnidata-v7-installed.js');
  assert.doesNotThrow(()=>new Function(linesheets));
  for(const name of ['buildRows','tabs','metrics','controls','registry','inspector','renderLinesheets'])assert.match(linesheets,new RegExp(`function ${name}\\(`));
  assert.match(linesheets,/state\.view === 'linesheets'/);
  assert.match(installed,/'Linesheets',[\s\S]*?'linesheets'/);
});
