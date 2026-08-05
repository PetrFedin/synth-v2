import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}

test('V14 builds one consistent page header and removes duplicate module title systems',async()=>{
  const css=await source('public/omnidata-v14.css');
  const js=await source('public/modules/omnidata-v14.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ['od14-page-header','od14-page-heading','od14-page-section','od14-page-title','od14-page-description','od14-page-actions','od14-source-toolbar','od14-source-header']) assert.ok(css.includes(token),token);
  for(const token of ["const HEADER_CLASS='od14-page-header'",'const HEADERS=Object.freeze','buildUnifiedHeader','sourceActionNodes','markSourceLayouts',"'.view-toolbar > button'","'.bom-header-actions > button'","'.measurement-header-actions > button'","'.sample-header-actions > button'","'.sourcing-header-actions > button'","'.od-commandbar > button.primary'",'workspace.prepend(header)']) assert.ok(js.includes(token),token);
  for(const view of ['overview','planning','styles','materials','boms','measurements','samples','suppliers','rfqs','quotations','production','catalog','linesheets','showrooms','partners','selections','orders','calendar','notifications']) assert.ok(js.includes(`${view}:{section:`),view);
});

test('V14 constrains search and filters instead of stretching them across the workspace',async()=>{
  const css=await source('public/omnidata-v14.css');
  const extensions=await source('public/omnidata-v14-extensions.css');
  for(const token of ['grid-template-columns:minmax(220px,360px) minmax(150px,190px) max-content!important','max-width:360px!important','width:190px!important','min-width:160px!important','max-width:220px!important','width:280px!important','od14-no-action']) assert.ok(css.includes(token)||extensions.includes(token),token);
  for(const token of ['.ls9-commandbar','grid-template-columns:minmax(220px,360px) max-content minmax(140px,175px) minmax(150px,200px) 36px minmax(8px,1fr) 36px 36px!important','.ls9-search','.ls9-select','.ls9-filter-button','.ls9-layout']) assert.ok(extensions.includes(token),token);
  assert.doesNotMatch(css,/\.od-commandbar[\s\S]{0,500}grid-template-columns:minmax\(0,1fr\)!important/);
});

test('V14 unifies typography, controls, cards, tables, inspectors and dialogs',async()=>{
  const css=await source('public/omnidata-v14.css');
  const extensions=await source('public/omnidata-v14-extensions.css');
  for(const token of ['--od14-accent:#ff5b22','--od14-control:36px','--od14-radius:8px','font-size:24px!important','min-height:44px!important','grid-template-columns:repeat(auto-fit,minmax(142px,1fr))!important','grid-template-columns:minmax(0,1fr) minmax(320px,360px)!important','box-shadow:var(--od14-shadow)!important']) assert.ok(css.includes(token),token);
  for(const selector of ['.od-master-detail','.bom-layout','.measurement-layout','.sample-layout','.sourcing-grid','.od-inspector','.bom-inspector','.measurement-inspector','.sample-inspector','.sourcing-inspector','.od-table','.bom-table','.measurement-table','.sample-table','.sourcing-table']) assert.ok(css.includes(selector),selector);
  for(const token of ['Forms and dialogs inherit the same visual language','dialog::backdrop','border-radius:10px!important','min-height:var(--od14-control)!important']) assert.ok(extensions.includes(token),token);
  assert.doesNotMatch(css+extensions,/@import|https?:\/\//i);
});

test('V14 audits RU and EN labels and explains abbreviations without translating business data',async()=>{
  const js=await source('public/modules/omnidata-v14.js');
  for(const token of ['RU_EXACT','EN_EXACT','ROLE_RU','auditInterface','diagnosticAudit','DIAGNOSTIC_SELECTOR','data-od14-untranslated','translateRole','translateBrand','Fashion Operating System','Операционная система моды','syntha:locale-changed','MutationObserver']) assert.ok(js.includes(token),token);
  for(const abbreviation of ['PLM','BOM','SKU','POM','MOQ','ATS','RFQ','PO','ERP','WMS','PIM','OMS','QC','QMS','FX','API','RFID','EAN','GTIN','EXW','FCA','FOB','CIF','DAP','DDP','EUR','USD','RUB','CNY','GBP','ISO','UTC','PDF','ZIP','PPS','HEX','RGB','SMB','SaaS','RU','EN']) assert.ok(js.includes(`${abbreviation}:`),abbreviation);
  for(const pair of ['Ткань','Fabric','Фурнитура','Trim','Условие поставки','Incoterm','Электронная почта','Email','Срок выполнения','Lead time','Линейные листы','Linesheets']) assert.ok(js.includes(pair),pair);
  assert.ok(js.includes("if(parent.closest('script,style,textarea,input,[contenteditable=\"true\"],.od13-abbr'))"));
});

test('V14 is the final cache-busted visual layer and is served with no-store caching',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260805-14"/);
  assert.ok(html.indexOf('/omnidata-v14.css?v=visual-20260805-14')>html.indexOf('/omnidata-v13.css?v=visual-20260804-13'));
  assert.ok(html.indexOf('/omnidata-v14-extensions.css?v=visual-20260805-14')>html.indexOf('/omnidata-v14.css?v=visual-20260805-14'));
  assert.ok(html.indexOf('/ui/omnidata-v14.js?v=visual-20260805-14')>html.indexOf('/ui/omnidata-v13.js?v=visual-20260804-13'));
  assert.ok(html.includes('/ui/app-start.js?v=visual-20260805-14'));
  assert.ok(handler.includes("'/omnidata-v14.css': ['omnidata-v14.css', 'text/css; charset=utf-8', VISUAL_CACHE]"));
  assert.ok(handler.includes("'/omnidata-v14-extensions.css': ['omnidata-v14-extensions.css', 'text/css; charset=utf-8', VISUAL_CACHE]"));
  assert.ok(handler.includes("'/ui/omnidata-v14.js': ['modules/omnidata-v14.js', JS, VISUAL_CACHE]"));
});
