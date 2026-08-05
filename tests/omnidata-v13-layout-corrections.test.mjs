import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('V13 keeps the desktop navigation expanded by default and preserves icon mode',async()=>{
  const css=await source('public/omnidata-v13.css');
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['--od13-sidebar:236px','--od13-sidebar-collapsed:60px','grid-template-columns:var(--od13-sidebar) minmax(0,1fr)!important','grid-template-columns:var(--od13-sidebar-collapsed) minmax(0,1fr)!important','sidebar-footer>.sidebar-action:last-child{display:flex!important']) assert.ok(css.includes(token),token);
  for(const token of ["const SIDEBAR_KEY='syntha-v2-sidebar-collapsed'","localStorage?.getItem(SIDEBAR_KEY)===null","state.sidebarCollapsed=false","shell.classList.contains('sidebar-collapsed')","collapse.hidden=false","if(collapsed)item.title=label;else item.removeAttribute('title')"]) assert.ok(js.includes(token),token);
  assert.doesNotMatch(js,/classList\.remove\('sidebar-collapsed'\)|localStorage\?\.setItem\(SIDEBAR_KEY,'false'\)/);
});

test('V13 uses external CSP-safe CSS for the improved Omnidata visual system',async()=>{
  const css=await source('public/omnidata-v13.css');
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['--od13-control-height:36px','--od13-radius:8px','--od13-accent:#ff5b22','font-size:26px!important','min-height:44px!important','grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important','grid-template-columns:minmax(0,1fr) minmax(320px,360px)!important','box-shadow:var(--od13-shadow)!important']) assert.ok(css.includes(token),token);
  for(const selector of ['.bom-header','.measurement-header','.sample-header','.sourcing-header','.bom-kpis','.measurement-kpis','.sample-kpis','.sourcing-kpis','.bom-inspector','.measurement-inspector','.sample-inspector','.sourcing-inspector']) assert.ok(css.includes(selector),selector);
  assert.doesNotMatch(js,/createElement\(['"]style['"]\)|STYLE_ID|RUNTIME_CSS/);
  assert.doesNotMatch(css,/@import|https?:\/\//i);
});

test('V13 shows navigation descriptions only in collapsed mode and explains abbreviations',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ['data-od13-tooltip','od13-tooltip','pointerover','pointerout',"target.matches('.nav-item,.sidebar-action')","document.querySelector('.shell.sidebar-collapsed')","if(!collapsed)hideTooltip()",'od13-abbr','abbreviationTooltip']) assert.ok(js.includes(token),token);
  for(const abbreviation of ['PLM','BOM','SKU','POM','MOQ','ATS','FX','QC','QMS','RFQ','PO','ERP','WMS','PIM','OMS','RFID','EAN','GTIN','API','PDF','ZIP','PPS','ISO','HEX','RGB','INCOTERMS','SaaS','SMB']) assert.ok(js.includes(`${abbreviation}:`),abbreviation);
});

test('V13 enforces clean RU and EN module names and dynamic status labels',async()=>{
  const js=await source('public/modules/omnidata-v13.js');
  for(const token of ['Материалы и фурнитура','Materials and Trims','Спецификация (BOM) и производственная себестоимость','Bill of Materials (BOM) and Production Costing','Размерные таблицы и градация размеров','Measurement Charts and Grading','PLM / ЗАКУПКИ / РАЗМЕЩЕНИЕ ПРОИЗВОДСТВА','PLM / SOURCING / PRODUCTION ALLOCATION','Срок выполнения','Lead time','Электронная почта','Email','Линейный лист','Linesheet']) assert.ok(js.includes(token),token);
  for(const token of ['RU_EXACT','EN_EXACT','RU_PHRASES','patchNavigationModels','patchViewResolvers','VIEW_TITLES','VIEW_SECTIONS','syntha:locale-changed','MutationObserver']) assert.ok(js.includes(token),token);
  assert.ok(js.includes("'draft':'Черновик'"));
  assert.ok(js.includes("'Черновик':'Draft'"));
});

test('Application start performs a strict audit of remaining enum labels and commercial abbreviations',async()=>{
  const start=await source('public/modules/app-start.js');
  assert.doesNotThrow(()=>new Function(start));
  for(const token of ['window.I18N = window.SynthaI18n','installStrictLocaleAudit','SynthaStrictLocaleAudit','fabric: \'Ткань\'','Incoterm: \'Условие поставки\'','EXW:','FOB:','DDP:','EUR:','USD:','MutationObserver','syntha:locale-changed','Promise.resolve(boot()).finally(schedule)']) assert.ok(start.includes(token),token);
});

test('V13 remains the final delivered visual layer',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260805-15"/);
  assert.ok(html.indexOf('/omnidata-v13.css?v=visual-20260804-13')>html.indexOf('/omnidata-v12.css?v=visual-20260804-12'));
  assert.ok(html.indexOf('/ui/omnidata-v13.js?v=visual-20260804-13')>html.indexOf('/ui/omnidata-v12.js?v=visual-20260804-12'));
  assert.ok(handler.includes("'/omnidata-v13.css': ['omnidata-v13.css'"));
  assert.ok(handler.includes("'/ui/omnidata-v13.js': ['modules/omnidata-v13.js'"));
});
