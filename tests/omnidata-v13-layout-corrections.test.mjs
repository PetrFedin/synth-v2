import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('V13 keeps the sidebar expanded by default and preserves the collapse control',async()=>{
  const css=await source('public/omnidata-v13.css');
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['--od13-sidebar:220px','grid-template-columns:var(--od13-sidebar) minmax(0,1fr)!important','position:sticky!important','height:100vh!important']) assert.ok(css.includes(token),token);
  for(const token of ["const SIDEBAR_KEY='syntha-v2-sidebar-collapsed'","localStorage?.getItem(SIDEBAR_KEY)===null","state.sidebarCollapsed=false","shell.classList.contains('sidebar-collapsed')","collapse.hidden=false","collapse.removeAttribute('aria-hidden')","sidebar-footer>.sidebar-action:last-child{display:flex!important}","grid-template-columns:58px minmax(0,1fr)!important"]) assert.ok(js.includes(token),token);
  assert.doesNotMatch(js,/classList\.remove\('sidebar-collapsed'\)|localStorage\?\.setItem\(SIDEBAR_KEY,'false'\)/);
});

test('V13 shows navigation descriptions only in icon mode',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ['data-od13-tooltip','od13-tooltip','pointerover','pointerout',"target.matches('.nav-item,.sidebar-action')","document.querySelector('.shell.sidebar-collapsed')","item.removeAttribute('title')","if(!collapsed)hideTooltip()"] ) assert.ok(js.includes(token),token);
});

test('V13 standardises industrial workspace hierarchy and controls',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['.bom-header','.measurement-header','.sourcing-header','.bom-kpis','.measurement-kpis','.sourcing-kpis','.bom-layout','.measurement-layout','.sourcing-grid','.bom-table-wrap','.measurement-table-wrap','.sourcing-table-wrap','font-size:16px!important','min-height:var(--od13-control-height)!important','grid-template-columns:repeat(auto-fit,minmax(132px,1fr))!important','border-radius:var(--od13-radius)!important']) assert.ok(js.includes(token),token);
  assert.match(js,/\.bom-inspector,[\s\S]*\.measurement-inspector/);
  assert.match(js,/@media\(max-width:1180px\)/);
});

test('V13 enforces clean RU and EN copy while expanding accepted abbreviations',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['Материалы / фурнитура','Спецификация (BOM) и производственная себестоимость','Размерные таблицы и градация размеров','PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА','Срок выполнения','Materials / Trims','Bill of Materials (BOM) and Production Costing','Measurement Charts and Grading','PLM / SOURCING / PRODUCTION ALLOCATION','Lead time']) assert.ok(js.includes(token),token);
  for(const abbreviation of ['PLM','BOM','SKU','POM','MOQ','ATS','FX','QC','RFQ','PO','ERP','WMS','EAN','GTIN']) assert.ok(js.includes(`${abbreviation}:`),abbreviation);
  for(const token of ['decorateAbbreviations','abbreviationTooltip','od13-abbr','syntha:locale-changed','MutationObserver']) assert.ok(js.includes(token),token);
});

test('V13 remains the final delivered visual layer',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260804-13"/);
  assert.ok(html.indexOf('/omnidata-v13.css?v=visual-20260804-13')>html.indexOf('/omnidata-v12.css?v=visual-20260804-12'));
  assert.ok(html.indexOf('/ui/omnidata-v13.js?v=visual-20260804-13')>html.indexOf('/ui/omnidata-v12.js?v=visual-20260804-12'));
  assert.ok(handler.includes("'/omnidata-v13.css': ['omnidata-v13.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v13.js': ['modules/omnidata-v13.js'"));
});
