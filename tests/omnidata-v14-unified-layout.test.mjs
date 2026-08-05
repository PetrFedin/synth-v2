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
  const runtime=await source('public/modules/omnidata-v14.js');
  for(const token of ['grid-template-columns:minmax(220px,360px) minmax(150px,190px) max-content!important','max-width:360px!important','width:190px!important','min-width:160px!important','max-width:220px!important','width:280px!important']) assert.ok(css.includes(token)||extensions.includes(token),token);
  assert.ok(runtime.includes('od14-no-action'));
  for(const token of ['.ls9-commandbar','grid-template-columns:minmax(220px,360px) max-content minmax(140px,175px) minmax(150px,200px) 36px minmax(8px,1fr) 36px 36px!important','.ls9-search','.ls9-select','.ls9-filter-button','.ls9-layout']) assert.ok(extensions.includes(token),token);
  assert.ok(extensions.includes('[data-od14-component="filterbar"]'));
  assert.ok(extensions.includes('grid-template-columns:minmax(220px,360px) repeat(3,minmax(140px,190px)) max-content!important'));
  assert.ok(extensions.includes('@media(max-width:680px)'));
});

test('V14 applies one typography, spacing and control system through semantic roles',async()=>{
  const css=await source('public/omnidata-v14.css');
  const extensions=await source('public/omnidata-v14-extensions.css');
  const adaptersCss=await source('public/omnidata-v14-module-adapters.css');
  const semanticCss=extensions+adaptersCss;
  for(const token of ['--od14-accent:#ff5b22','--od14-control:36px','--od14-radius:8px','font-size:24px!important','min-height:44px!important','grid-template-columns:repeat(auto-fit,minmax(142px,1fr))!important','grid-template-columns:minmax(0,1fr) minmax(320px,360px)!important','box-shadow:var(--od14-shadow)!important']) assert.ok(css.includes(token),token);
  for(const token of ['--od14-control:32px','--od14-radius:6px','--od14-shadow:none','Forms and dialogs inherit the same visual language','dialog::backdrop','border-radius:10px!important','min-height:var(--od14-control)!important']) assert.ok(extensions.includes(token),token);
  assert.ok(adaptersCss.includes('Structural adapters and semantic roles'), 'semantic adapter layer');
  for(const role of ['surface','card','section-head','toolbar','filterbar','tabs','tab','metrics','metric','button','icon-button','field','master-detail','table-wrap','table','inspector','definition-grid','definition-item','entity','list','list-item','empty','status','alert','timeline','timeline-item','timeline-part','progress','progress-track','progress-fill']) assert.ok(semanticCss.includes(`[data-od14-component="${role}"]`),role);
  for(const token of ['data-od14-tone="success"','data-od14-tone="warning"','data-od14-tone="danger"','data-od14-tone="info"']) assert.ok(semanticCss.includes(token),token);
  assert.doesNotMatch(css+semanticCss,/@import|https?:\/\//i);
});

test('V14 runtime classifies legacy classes before styling them',async()=>{
  const js=await source('public/modules/omnidata-v14-components.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ["const BUILD='visual-20260805-14-components-3'",'const COMPONENTS=Object.freeze','const ROLE_RULES=Object.freeze','semanticRoleFor','classifyLegacyComponents','componentCandidates','assignComponents','assignControls','assignRole','od14RoleSource','dataset.od14Component','dataset.od14Variant','auditComponents','od14ComponentAudit','od14UnclassifiedComponents','data-od14-unclassified','toneFor','data-od14-business-data','STRICT_PAIRS','RU_EXACT','EN_EXACT','translateText','decorateAbbreviations','auditLanguage','MutationObserver','attributeFilter','syntha:locale-changed','SynthaOmnidataV14Components']) assert.ok(js.includes(token),token);
  for(const role of ["role:'filterbar'","role:'table-wrap'","role:'table'","role:'inspector'","role:'card'","role:'status'","role:'alert'","role:'timeline'","role:'progress'","role:'list'"]) assert.ok(js.includes(role),role);
  for(const selector of ['.od-commandbar','.ls9-commandbar','.bom-kpis','.measurement-kpis','.sample-kpis','.sourcing-kpis','.od-master-detail','.ls9-layout','.bom-layout','.measurement-layout','.sample-layout','.sourcing-grid','.od-table','.ls9-table','.bom-table','.measurement-table','.sample-table','.sourcing-table','.od-inspector','.ls9-inspector','.bom-inspector','.measurement-inspector','.sample-inspector','.sourcing-inspector','.production-execution-card','.production-execution-error','.entity']) assert.ok(js.includes(selector),selector);
});

test('V14 module adapters keep Tech Packs, Production Orders and Production Execution in the shared component system',async()=>{
  const js=await source('public/modules/omnidata-v14-module-adapters.js');
  const css=await source('public/omnidata-v14-module-adapters.css');
  assert.doesNotThrow(()=>new Function(js));
  for(const token of ["const BUILD='visual-20260805-14-module-adapters-4'",'tech-packs','production-orders','production-executions','Технические пакеты','Tech Packs','Производственные заказы','Production Orders','tech-pack-kpis','production-orders-kpis','tech-pack-filters','production-orders-filters','tech-pack-table','production-orders-table','tech-pack-inspector','production-orders-inspector','production-execution-kpis','production-execution-filters','production-execution-table','production-execution-inspector','production-timeline','production-milestone','production-progress-track','dataset.od14Component','od14RoleSource','SynthaOmnidataV14ModuleAdapters']) assert.ok(js.includes(token),token);
  for(const token of ['Structural adapters and semantic roles','od14-module-summary','production-execution-header-actions','production-execution-kpis','production-orders-create','production-execution-create','tech-pack-readiness','data-od14-component="card"','data-od14-component="alert"','data-od14-component="timeline"','data-od14-component="progress-track"']) assert.ok(css.includes(token),token);
  assert.doesNotMatch(css,/@import|https?:\/\//i);
});

test('V14 semantic runtime covers Production Execution without a page-specific visual fork',async()=>{
  const execution=await source('public/modules/production-executions.js');
  const components=await source('public/modules/omnidata-v14-components.js');
  assert.doesNotThrow(()=>new Function(execution));
  for(const token of ['production-execution-kpis','production-execution-kpi','production-execution-filters','production-execution-registry','production-execution-table','production-execution-inspector','production-execution-facts','production-timeline','production-milestone','production-progress','production-execution-badge','production-execution-error']) assert.ok(execution.includes(token),token);
  for(const token of ['.production-execution-card','.production-execution-error','PLM / Production Execution','Исполнение производства']) assert.ok(components.includes(token),token);
});

test('V14 audits RU and EN labels and explains abbreviations without translating business data',async()=>{
  const js=await source('public/modules/omnidata-v14.js');
  const components=await source('public/modules/omnidata-v14-components.js');
  for(const token of ['RU_EXACT','EN_EXACT','ROLE_RU','auditInterface','diagnosticAudit','DIAGNOSTIC_SELECTOR','data-od14-untranslated','translateRole','translateBrand','Fashion Operating System','Операционная система моды','syntha:locale-changed','MutationObserver']) assert.ok(js.includes(token),token);
  for(const abbreviation of ['PLM','BOM','SKU','POM','MOQ','ATS','RFQ','PO','ERP','WMS','PIM','OMS','QC','QMS','FX','API','RFID','EAN','GTIN','EXW','FCA','FOB','CIF','DAP','DDP','EUR','USD','RUB','CNY','GBP','ISO','UTC','PDF','ZIP','PPS','HEX','RGB','RU','EN']) assert.ok(components.includes(`${abbreviation}:`),abbreviation);
  for(const pair of ['Ткань','Fabric','Фурнитура','Trim','Условие поставки','Incoterm','Электронная почта','Email','Срок выполнения','Lead time','Листы коллекций','Linesheets','Все статусы','All statuses','Только просроченные','Overdue only']) assert.ok(components.includes(pair),pair);
  assert.ok(components.includes(".entity-title,.entity-code,td,dd,[data-od14-business-data=\"true\"]"));
});

test('V14 semantic component unifier is the final cache-busted no-store visual asset',async()=>{
  const html=await source('public/index.html');
  const handler=await source('src/web/static-handler.mjs');
  assert.match(html,/meta name="syntha-build" content="visual-20260805-14"/);
  const styleOrder=['/production-executions.css?v=industrial-20260805-1','/omnidata-v14.css?v=visual-20260805-14','/omnidata-v14-module-adapters.css?v=visual-20260805-14-module-adapters-1','/omnidata-v14-extensions.css?v=visual-20260805-14-components-3'];
  let previous=-1;for(const asset of styleOrder){const index=html.indexOf(asset);assert.ok(index>previous,asset);previous=index}
  const scriptOrder=['/ui/production-orders.js?v=industrial-20260805-1','/ui/production-executions.js?v=industrial-20260805-1','/ui/omnidata-v14.js?v=visual-20260805-14','/ui/omnidata-v14-module-adapters.js?v=visual-20260805-14-module-adapters-4','/ui/omnidata-v14-components.js?v=visual-20260805-14-components-3','/ui/dom-boolean-props.js?v=visual-20260804-9'];
  previous=-1;for(const asset of scriptOrder){const index=html.indexOf(asset);assert.ok(index>previous,asset);previous=index}
  assert.ok(html.includes('/ui/app-start.js?v=visual-20260805-14-components-3'));
  for(const mapping of ["'/omnidata-v14-module-adapters.css': ['omnidata-v14-module-adapters.css', 'text/css; charset=utf-8', VISUAL_CACHE]","'/omnidata-v14-extensions.css': ['omnidata-v14-extensions.css', 'text/css; charset=utf-8', VISUAL_CACHE]","'/ui/omnidata-v14-module-adapters.js': ['modules/omnidata-v14-module-adapters.js', JS, VISUAL_CACHE]","'/ui/omnidata-v14-components.js': ['modules/omnidata-v14-components.js', JS, VISUAL_CACHE]"]) assert.ok(handler.includes(mapping),mapping);
});
