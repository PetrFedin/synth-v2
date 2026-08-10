import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(root,'public');
const html=await source('public/index.html');
const staticHandler=await source('src/web/static-handler.mjs');
const roleRuntime=await source('public/modules/omnidata-v14-role-system.js');
const componentRuntime=await source('public/modules/omnidata-v14-components.js');
const adapterRuntime=await source('public/modules/omnidata-v14-module-adapters.js');
const adapterCss=await source('public/omnidata-v14-module-adapters.css');
const samplesRuntime=await source('public/modules/samples.js');
const sampleSyncRuntime=await source('public/modules/sample-catalog-sync.js');
const techPacksRuntime=await source('public/modules/tech-packs.js');
const productionOrdersRuntime=await source('public/modules/production-orders.js');
const productionExecutionsRuntime=await source('public/modules/production-executions.js');
const finalQualityRuntime=await source('public/modules/final-quality.js');

const FOUNDATION_STYLES=new Set(['/styles.css','/i18n.css']);
const ODS_STYLESHEET='/omnidata-v14-role-system.css';
const LEGACY_VISUAL_DEBT=Object.freeze(['/omnidata.css','/industrial-product.css','/bom.css','/omnidata-v7.css','/omnidata-v7-bom.css','/measurements.css','/measurement-sync.css','/sourcing.css','/tech-packs.css','/production-orders.css','/production-executions.css','/omnidata-v8.css','/omnidata-v8-reference.css','/omnidata-v9.css','/omnidata-v10.css','/omnidata-v11.css','/omnidata-v12.css','/omnidata-v13.css','/omnidata-v14.css','/omnidata-v14-module-adapters.css','/omnidata-v14-extensions.css']);
const LEGACY_VISUAL_DEBT_SET=new Set(LEGACY_VISUAL_DEBT);
const SAMPLES_ODS_PARTS=Object.freeze({'sample-kpis':'metrics','sample-kpi':'metric','sample-filters':'filterbar','sample-layout':'master-detail','sample-table-wrap':'table-wrap','sample-table':'table','sample-inspector':'inspector','sample-summary':'definition-grid','sample-detail-card':'card','sample-badge':'status','sample-empty':'empty','sample-error':'alert','sample-form':'form','sample-field':'field-group'});
const TECH_PACKS_ODS_PARTS=Object.freeze({'tech-pack-kpis':'metrics','tech-pack-kpi':'metric','tech-pack-filters':'filterbar','tech-pack-actions':'toolbar','tech-pack-layout':'master-detail','tech-pack-table-wrap':'table-wrap','tech-pack-table':'table','tech-pack-inspector':'inspector','tech-pack-facts':'definition-grid','tech-pack-readiness':'surface','tech-pack-card':'card','tech-pack-badge':'status','tech-pack-empty':'empty','tech-pack-error':'alert'});
const PRODUCTION_ORDERS_ODS_PARTS=Object.freeze({'production-orders-kpis':'metrics','production-orders-kpi':'metric','production-orders-filters':'filterbar','production-orders-create':'toolbar','production-orders-layout':'master-detail','production-orders-registry':'table-wrap','production-orders-table':'table','production-orders-inspector':'inspector','production-orders-facts':'definition-grid','production-orders-card':'card','production-order-badge':'status','production-orders-empty':'empty','production-orders-error':'alert'});
const PRODUCTION_EXECUTIONS_ODS_PARTS=Object.freeze({'production-execution-kpis':'metrics','production-execution-kpi':'metric','production-execution-filters':'filterbar','production-execution-create':'toolbar','production-execution-actions':'toolbar','production-execution-layout':'master-detail','production-execution-registry':'table-wrap','production-execution-table':'table','production-execution-inspector':'inspector','production-execution-facts':'definition-grid','production-execution-card':'card','production-execution-badge':'status','production-execution-empty':'empty','production-execution-error':'alert','production-timeline':'timeline','production-milestone':'timeline-item','production-milestone-sequence':'timeline-part','production-progress':'progress','production-progress-track':'progress-track','production-progress-fill':'progress-fill'});
const FINAL_QUALITY_ODS_PARTS=Object.freeze({'final-quality-header':'page-header','final-quality-kpis':'metrics','final-quality-kpi':'metric','final-quality-layout':'master-detail','final-quality-grid':'layout','final-quality-facts':'definition-grid','final-quality-runs':'list','final-quality-run':'list-item','final-quality-card':'card','final-quality-filters':'filterbar','final-quality-actions':'toolbar','final-quality-create':'header-toolbar','final-quality-registry':'table-wrap','final-quality-table':'table','final-quality-inspector':'inspector','final-quality-badge':'status','final-quality-recommendation':'status','final-quality-release':'status','final-quality-error':'alert'});
const FORBIDDEN_DYNAMIC_STYLE_APIS=Object.freeze([
  Object.freeze({label:'element.style',pattern:/\.\s*style\s*(?:\.|\[|=)/}),Object.freeze({label:'setAttribute(style)',pattern:/setAttribute\s*\(\s*['"]style['"]/}),Object.freeze({label:'createElement(style)',pattern:/createElement\s*\(\s*['"]style['"]/}),Object.freeze({label:'CSSStyleSheet',pattern:/\bCSSStyleSheet\b/}),Object.freeze({label:'adoptedStyleSheets',pattern:/\badoptedStyleSheets\b/}),Object.freeze({label:'insertRule',pattern:/\binsertRule\s*\(/})
]);
assert(LEGACY_VISUAL_DEBT.length===21,'Legacy visual debt baseline must only decrease from 21 stylesheets.');
const stylesheets=[...html.matchAll(/<link\s+[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m)=>pathname(m[1]));
assert(stylesheets.at(-1)===ODS_STYLESHEET,'ODS must remain the final stylesheet.');
for(const retired of ['/samples.css','/tech-packs.css','/production-executions.css','/production-orders.css','/final-quality.css']){assert(!stylesheets.includes(retired),`${retired} must remain ODS-native and must not restore a local stylesheet.`);assert(!staticHandler.includes(`'${retired}':`),`${retired} local stylesheet route must not be restored.`)}
const unknownStyles=stylesheets.filter((item)=>!FOUNDATION_STYLES.has(item)&&item!==ODS_STYLESHEET&&!LEGACY_VISUAL_DEBT_SET.has(item));
assert(unknownStyles.length===0,`New local stylesheet layers are forbidden by ODS: ${unknownStyles.join(', ')}`);
const presentLegacyDebt=stylesheets.filter((item)=>LEGACY_VISUAL_DEBT_SET.has(item));
assert(presentLegacyDebt.length===18,`Expected 18 loaded legacy styles after five ODS-native migrations, found ${presentLegacyDebt.length}.`);
for(const item of presentLegacyDebt)assert(stylesheets.indexOf(item)<stylesheets.indexOf(ODS_STYLESHEET),`Legacy stylesheet must remain below ODS: ${item}`);
const scripts=[...html.matchAll(/<script\s+[^>]*src="([^"]+)"/g)].map((m)=>pathname(m[1]));
const componentIndex=scripts.indexOf('/ui/omnidata-v14-components.js');const roleIndex=scripts.indexOf('/ui/omnidata-v14-role-system.js');const appStartIndex=scripts.indexOf('/ui/app-start.js');
assert(componentIndex!==-1&&roleIndex!==-1&&appStartIndex!==-1,'ODS component/runtime/app-start chain is incomplete.');assert(componentIndex<roleIndex&&roleIndex<appStartIndex,'ODS component/runtime order is invalid.');
for(const token of ['semanticRoleFor','classifyLegacyComponents','auditComponents'])assert(componentRuntime.includes(token),`Component runtime contract is missing: ${token}`);
function assertAdapterCoverage(runtime,mapping,label){for(const [legacyClass,part] of Object.entries(mapping)){assert(runtime.includes(legacyClass),`${label} semantic hook disappeared: ${legacyClass}`);assert(adapterRuntime.includes(legacyClass),`${label} adapter hook disappeared: ${legacyClass}`);assert(adapterRuntime.includes(`'${part}'`),`${label} ODS part disappeared: ${part}`)}}
assertAdapterCoverage(samplesRuntime,SAMPLES_ODS_PARTS,'Samples');
assertAdapterCoverage(techPacksRuntime,TECH_PACKS_ODS_PARTS,'Tech Packs');
assertAdapterCoverage(productionOrdersRuntime,PRODUCTION_ORDERS_ODS_PARTS,'Production Orders');
assertAdapterCoverage(productionExecutionsRuntime,PRODUCTION_EXECUTIONS_ODS_PARTS,'Production Executions');
for(const token of ['samples:{',"source:'.sample-header'","actions:'.sample-header-actions'",'.sample-field input','.sample-sync-state','od14-tone-success','od14-tone-warning','od14-tone-danger'])assert(adapterRuntime.includes(token),`Samples adapter contract is missing: ${token}`);
for(const token of ['sample-sync-state','sample-sync-error'])assert(sampleSyncRuntime.includes(token),`Samples sync semantic hook disappeared: ${token}`);
for(const token of ["'tech-packs':{","source:'.tech-pack-header'","actions:'.tech-pack-header-actions'",'.tech-pack-filters input','.tech-pack-error'])assert(adapterRuntime.includes(token),`Tech Packs adapter contract is missing: ${token}`);
for(const token of ["'production-orders':{","source:'.production-orders-header'","actions:'.production-orders-actions'",'.production-orders-confirm','.production-orders-filters input'])assert(adapterRuntime.includes(token),`Production Orders adapter contract is missing: ${token}`);
for(const token of ["'production-executions':{","source:'.production-execution-header'","actions:'.production-execution-header-actions'",'.production-execution-filters input','.production-execution-create input'])assert(adapterRuntime.includes(token),`Production Executions adapter contract is missing: ${token}`);
for(const token of ['body.omnidata-v14 progress','progress::-webkit-progress-value','progress::-moz-progress-bar','[data-od14-component="progress-fill"][class$="-0"]','[data-od14-component="progress-fill"][class$="-6"]','--ods-color-accent','--ods-color-border'])assert(adapterCss.includes(token),`Shared progress primitive is missing: ${token}`);
for(const token of ['body.omnidata-v14 dialog','[data-od14-component="form"]','[data-ods-part="form"]','[data-od14-component="field-group"]','grid-template-columns:repeat(2,minmax(0,1fr))'])assert(adapterCss.includes(token),`Shared dialog/form primitive is missing: ${token}`);
for(const token of ['body.omnidata-v14 .sample-page','body.omnidata-v14 .sample-layout','grid-template-columns:minmax(0,1fr) minmax(320px,var(--ods-inspector-width,360px))','body.omnidata-v14 .sample-table-wrap','overflow:auto!important','body.omnidata-v14 .sample-inspector','body.omnidata-v14 .sample-summary'])assert(adapterCss.includes(token),`Samples ODS geometry is missing: ${token}`);
for(const token of ["SHELL_LAYOUT_MIGRATION_KEY='syntha-v2-shell-layout-v2'","LEGACY_SIDEBAR_KEY='syntha-v2-sidebar-collapsed'",'function normalizeShell()','storage.removeItem(LEGACY_SIDEBAR_KEY)',"shell.dataset.odsShellLayout='readable-v2'"])assert(adapterRuntime.includes(token),`Shared shell migration contract is missing: ${token}`);
for(const token of ['grid-template-columns:232px minmax(0,1fr)!important','grid-template-columns:208px minmax(0,1fr)!important','grid-template-columns:68px minmax(0,1fr)!important','body.omnidata-v14.omnidata-design-system-v1 .nav-item.active','var(--ods-color-accent,#ff5b22)','body.omnidata-v14.omnidata-design-system-v1 .entity-head','grid-template-columns:minmax(0,1fr) max-content!important','body.omnidata-v14.omnidata-design-system-v1 .entity-head .badge','position:static!important','body.omnidata-v14.omnidata-design-system-v1 .meta','flex-wrap:wrap!important','@media(max-width:920px)','@media(max-width:720px)'])assert(adapterCss.includes(token),`Shared shell/list geometry is missing: ${token}`);
for(const [legacyClass,part] of Object.entries(FINAL_QUALITY_ODS_PARTS)){assert(finalQualityRuntime.includes(legacyClass),`Final Quality semantic hook disappeared: ${legacyClass}`);assert(roleRuntime.includes(`'${legacyClass}':'${part}'`),`Final Quality ODS mapping disappeared: ${legacyClass} -> ${part}`)}
for(const token of ['statusTone','dataset.odsTone','released','rejected','rework','review','in-progress','pass'])assert(roleRuntime.includes(token),`Final Quality status semantics are not covered by ODS: ${token}`);
for(const script of scripts){if(!script.startsWith('/ui/'))continue;const file=path.join(publicDir,'modules',path.basename(script));const text=await readFile(file,'utf8');for(const {label,pattern} of FORBIDDEN_DYNAMIC_STYLE_APIS)assert(!pattern.test(text),`Loaded UI runtime uses forbidden dynamic styling (${label}): ${script}`)}
console.log(`ODS boundary contract OK (${presentLegacyDebt.length}/${LEGACY_VISUAL_DEBT.length} frozen legacy styles remain; readable shell and no-overlap list geometry enforced; Samples, Tech Packs, Production Executions, Production Orders and Final Quality are ODS-native; no new stylesheet or dynamic style API).`);
async function source(relativePath){return readFile(path.join(root,relativePath),'utf8')}
function pathname(asset){return new URL(asset,'http://syntha.local').pathname}
function assert(condition,message){if(condition)return;console.error(message);process.exit(1)}
